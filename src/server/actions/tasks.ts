"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fmt, zonedTime } from "@/lib/format";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { notify, recipients } from "@/server/notify";
import type { FormState } from "./auth";

const uuid = z.uuid();
const optionalId = z.union([z.literal(""), uuid]).transform(value => value || null);
const taskInput = z.object({
  title: z.string().trim().min(3, "Give the task a short title.").max(160),
  details: z.string().trim().max(2000).default(""),
  assignedTo: optionalId,
  homeId: optionalId,
  individualId: optionalId,
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  category: z.string().trim().max(80).default(""),
  dueDate: z.union([z.literal(""), z.iso.date()]).default(""),
  dueTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).default(""),
});

function readTask(formData: FormData) {
  const parsed = taskInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the task." } as const;
  const { dueDate, dueTime, ...rest } = parsed.data;
  return { data: { ...rest, dueAt: dueDate ? zonedTime(dueDate, dueTime || "17:00") : null } } as const;
}

function refresh(task: { id: string; individualId: string | null; homeId: string | null }) {
  revalidatePath("/app/tasks", "layout");
  revalidatePath("/app");
  if (task.individualId) revalidatePath(`/app/individuals/${task.individualId}`);
}

/* Who may change a task: coordinators, whoever created it, and whoever it is assigned to. */
const mayEdit = (user: SessionUser, task: { createdBy: string | null; assignedTo: string | null }) => canManage(user) || task.createdBy === user.id || (user.staffId !== null && task.assignedTo === user.staffId);

async function tellAssignee(user: SessionUser, task: { id: string; title: string; assignedTo: string | null; dueAt: Date | null; priority: string }, kind: "assigned" | "reassigned") {
  if (!task.assignedTo) return;
  await notify(await recipients({ staffIds: [task.assignedTo], except: user.id }), {
    kind: `task:${kind}`,
    title: `${kind === "assigned" ? "New task" : "Task passed to you"}: ${task.title}`,
    body: task.dueAt ? `Due ${fmt.dateTime(task.dueAt)}.` : "",
    href: `/app/tasks/${task.id}`,
    tone: task.priority === "high" ? "warn" : "info",
    dedupeKey: `task:${kind}:${task.id}:${task.assignedTo}`,
  });
}

export async function addTask(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const read = readTask(formData);
  if ("error" in read) return { error: read.error };
  const [task] = await db.insert(schema.tasks).values({ ...read.data, createdBy: user.id }).returning();
  await db.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "task", entityId: task.id });
  await tellAssignee(user, task, "assigned");
  refresh(task);
  if (formData.get("stay") === "1") return {};
  redirect(`/app/tasks/${task.id}`);
}

export async function editTask(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!existing) return { error: "This task was deleted." };
  if (!mayEdit(user, existing)) return { error: "Only the coordinator, the person who made it or the person doing it can change this task." };
  const read = readTask(formData);
  if ("error" in read) return { error: read.error };
  const [task] = await db.update(schema.tasks).set(read.data).where(eq(schema.tasks.id, id)).returning();
  await db.insert(schema.auditLog).values({ userId: user.id, action: "update", entity: "task", entityId: id });
  if (task.assignedTo && task.assignedTo !== existing.assignedTo) await tellAssignee(user, task, "reassigned");
  refresh(task);
  return {};
}

/* Marks a task done, with an optional note on what was done. Whoever made it is told. */
export async function finishTask(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const [task] = await db
    .update(schema.tasks)
    .set({ status: "done", completedAt: new Date(), completedBy: user.id, completionNote: note })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.status, "open")))
    .returning();
  if (!task) return { error: "This task is already done." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: "complete", entity: "task", entityId: id });
  if (task.createdBy && task.createdBy !== user.id) {
    await notify([task.createdBy], { kind: "task:done", title: `Done: ${task.title}`, body: note ? `${user.name}: ${note}` : `Finished by ${user.name}.`, href: `/app/tasks/${task.id}`, tone: "good", dedupeKey: `task:done:${task.id}:${task.completedAt?.getTime()}` });
  }
  refresh(task);
  return {};
}

export async function reopenTask(id: string): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const [task] = await db.update(schema.tasks).set({ status: "open", completedAt: null, completedBy: null, completionNote: "" }).where(eq(schema.tasks.id, id)).returning();
  if (!task) return { error: "This task was deleted." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: "reopen", entity: "task", entityId: id });
  refresh(task);
  return {};
}

export async function removeTask(id: string): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!existing) return { error: "This task was already deleted." };
  if (!canManage(user) && existing.createdBy !== user.id) return { error: "Only a coordinator or the person who made it can delete this task." };
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "delete", entity: "task", entityId: id });
  refresh(existing);
  redirect("/app/tasks");
}

/* Adds to the task's conversation and tells the others involved. */
export async function commentOnTask(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write a comment first." };
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return { error: "This task was deleted." };
  const [comment] = await db.insert(schema.taskComments).values({ taskId: id, userId: user.id, body: body.slice(0, 2000) }).returning();
  const to = await recipients({ staffIds: [task.assignedTo], except: user.id });
  if (task.createdBy && task.createdBy !== user.id) to.push(task.createdBy);
  await notify([...new Set(to)], { kind: "task:comment", title: `${user.name} on ${task.title}`, body: body.slice(0, 200), href: `/app/tasks/${id}`, tone: "info", dedupeKey: `task:comment:${comment.id}` });
  revalidatePath(`/app/tasks/${id}`);
  return {};
}
