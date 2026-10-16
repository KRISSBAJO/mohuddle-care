import "server-only";
import { and, asc, desc, eq, gte, or } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { notify, recipients } from "@/server/notify";

/* Finishing and talking about tasks, shared by the website and the phone app. */

const uuid = z.uuid();

/* Marks a task done, with an optional note, and tells whoever made it. */
export async function finishTaskFor(user: SessionUser, id: string, rawNote: string): Promise<{ error?: string; task?: { id: string; individualId: string | null; homeId: string | null } }> {
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const note = rawNote.trim().slice(0, 1000);
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
  return { task };
}

/* Adds to the task's conversation and tells the others involved. */
export async function commentOnTaskFor(user: SessionUser, id: string, rawBody: string): Promise<{ error?: string }> {
  if (!uuid.safeParse(id).success) return { error: "Unknown task." };
  const body = rawBody.trim();
  if (body.length < 2) return { error: "Write a comment first." };
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return { error: "This task was deleted." };
  const [comment] = await db.insert(schema.taskComments).values({ taskId: id, userId: user.id, body: body.slice(0, 2000) }).returning();
  const to = await recipients({ staffIds: [task.assignedTo], except: user.id });
  if (task.createdBy && task.createdBy !== user.id) to.push(task.createdBy);
  await notify([...new Set(to)], { kind: "task:comment", title: `${user.name} on ${task.title}`, body: body.slice(0, 200), href: `/app/tasks/${id}`, tone: "info", dedupeKey: `task:comment:${comment.id}` });
  return {};
}

/* A staff member's open tasks, and the ones they finished in the last day, soonest due first. */
export async function myTasks(user: SessionUser) {
  if (!user.staffId) return [];
  return db
    .select({ id: schema.tasks.id, title: schema.tasks.title, details: schema.tasks.details, dueAt: schema.tasks.dueAt, priority: schema.tasks.priority, status: schema.tasks.status, completedAt: schema.tasks.completedAt, person: schema.individuals.firstName, home: schema.homes.name })
    .from(schema.tasks)
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.tasks.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.tasks.homeId))
    .where(and(eq(schema.tasks.assignedTo, user.staffId), or(eq(schema.tasks.status, "open"), and(eq(schema.tasks.status, "done"), gte(schema.tasks.completedAt, new Date(Date.now() - 24 * 3_600_000))))))
    .orderBy(asc(schema.tasks.status), asc(schema.tasks.dueAt), desc(schema.tasks.createdAt))
    .limit(40);
}

/* One task with its conversation. */
export async function taskWithComments(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const [task] = await db
    .select({ id: schema.tasks.id, title: schema.tasks.title, details: schema.tasks.details, dueAt: schema.tasks.dueAt, priority: schema.tasks.priority, status: schema.tasks.status, completedAt: schema.tasks.completedAt, completionNote: schema.tasks.completionNote, category: schema.tasks.category, person: schema.individuals.firstName, personLast: schema.individuals.lastName, home: schema.homes.name })
    .from(schema.tasks)
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.tasks.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.tasks.homeId))
    .where(eq(schema.tasks.id, id))
    .limit(1);
  if (!task) return null;
  const comments = await db
    .select({ id: schema.taskComments.id, body: schema.taskComments.body, createdAt: schema.taskComments.createdAt, by: schema.users.name })
    .from(schema.taskComments)
    .leftJoin(schema.users, eq(schema.users.id, schema.taskComments.userId))
    .where(eq(schema.taskComments.taskId, id))
    .orderBy(asc(schema.taskComments.createdAt));
  return { ...task, comments };
}
