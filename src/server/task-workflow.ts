import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { fmt, zonedTime } from "@/lib/format";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { notify, recipients } from "@/server/notify";
import { commentOnTaskFor, finishTaskFor } from "@/server/tasks";
import type { FormState } from "./actions/auth";

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

async function validReferences(data: { assignedTo: string | null; homeId: string | null; individualId: string | null }) {
  for (const [table, id] of [[schema.staff, data.assignedTo], [schema.homes, data.homeId], [schema.individuals, data.individualId]] as const) {
    if (!id) continue;
    const [row] = await db.select({ id: table.id, active: table.active }).from(table).where(eq(table.id, id)).limit(1);
    if (!row?.active) return false;
  }
  return true;
}

export async function addTask(user: SessionUser, _previous: FormState, formData: FormData): Promise<FormState & { redirect?: string; id?: string }> {
  const read = readTask(formData);
  if ("error" in read) return { error: read.error };
  if (!(await validReferences(read.data))) return { error: "Choose active staff, homes and people in this agency." };
  const [task] = await db.insert(schema.tasks).values({ ...read.data, createdBy: user.id }).returning();
  await db.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "task", entityId: task.id });
  await tellAssignee(user, task, "assigned");
  if (formData.get("stay") === "1") return {};
  return { id: task.id, redirect: `/app/tasks/${task.id}` };
}

export async function editTask(user: SessionUser, id: string, _previous: FormState, formData: FormData): Promise<FormState & { redirect?: string; id?: string }> {
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!existing) return { error: "This task was deleted." };
  if (!mayEdit(user, existing)) return { error: "Only the coordinator, the person who made it or the person doing it can change this task." };
  const read = readTask(formData);
  if ("error" in read) return { error: read.error };
  if (!(await validReferences(read.data))) return { error: "Choose active staff, homes and people in this agency." };
  const [task] = await db.update(schema.tasks).set(read.data).where(eq(schema.tasks.id, id)).returning();
  await db.insert(schema.auditLog).values({ userId: user.id, action: "update", entity: "task", entityId: id });
  if (task.assignedTo && task.assignedTo !== existing.assignedTo) await tellAssignee(user, task, "reassigned");
  return {};
}

/* Marks a task done, with an optional note on what was done. Whoever made it is told. */
export async function finishTask(user: SessionUser, id: string, _previous: FormState, formData: FormData): Promise<FormState & { redirect?: string; id?: string }> {
  const result = await finishTaskFor(user, id, String(formData.get("note") ?? ""));
  if (result.error) return { error: result.error };
  return {};
}

export async function reopenTask(user: SessionUser, id: string): Promise<FormState & { redirect?: string; id?: string }> {
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const [task] = await db.update(schema.tasks).set({ status: "open", completedAt: null, completedBy: null, completionNote: "" }).where(eq(schema.tasks.id, id)).returning();
  if (!task) return { error: "This task was deleted." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: "reopen", entity: "task", entityId: id });
  return {};
}

export async function removeTask(user: SessionUser, id: string): Promise<FormState & { redirect?: string; id?: string }> {
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!existing) return { error: "This task was already deleted." };
  if (!canManage(user) && existing.createdBy !== user.id) return { error: "Only a coordinator or the person who made it can delete this task." };
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "delete", entity: "task", entityId: id });
  return { redirect: "/app/tasks" };
}

/* Adds to the task's conversation and tells the others involved. */
export async function commentOnTask(user: SessionUser, id: string, _previous: FormState, formData: FormData): Promise<FormState & { redirect?: string; id?: string }> {
  const result = await commentOnTaskFor(user, id, String(formData.get("body") ?? ""));
  if (result.error) return { error: result.error };
  return {};
}
