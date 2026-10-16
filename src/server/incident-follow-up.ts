import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";

/*
 * Following up an incident after it was reported: anyone can add what they learned later, and a
 * coordinator starts the review. The website's actions and the phone app both call these.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid = z.uuid();

export async function incidentById(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const [incident] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, id)).limit(1);
  return incident ?? null;
}

/* Adds a line to the incident's timeline. */
export async function timelineNote(tx: Tx, incidentId: string, userId: string, kind: string, body: string) {
  await tx.insert(schema.incidentNotes).values({ incidentId, userId, kind, body });
  // Its own action name, so the timeline never mistakes it for an older status change from the audit log.
  await tx.insert(schema.auditLog).values({ userId, action: `incident:timeline:${kind}`, entity: "incident", entityId: incidentId });
}

/* Anyone can add what they learned later. The original account is never edited. */
export async function addIncidentNoteFor(user: SessionUser, id: string, raw: string): Promise<{ error?: string }> {
  const incident = await incidentById(id);
  if (!incident) return { error: "This incident no longer exists." };
  const body = raw.trim();
  if (body.length < 3) return { error: "Write the follow-up note first." };
  if (body.length > 3000) return { error: "Keep a note under 3,000 characters." };
  await db.transaction(tx => timelineNote(tx, id, user.id, "note", body));
  return {};
}

/* A coordinator or administrator starts reviewing an open incident. */
export async function startIncidentReviewFor(user: SessionUser, id: string): Promise<{ error?: string }> {
  if (!canManage(user)) return { error: "Only coordinators and administrators review incidents." };
  const incident = await incidentById(id);
  if (!incident) return { error: "This incident no longer exists." };
  if (incident.status !== "open") return { error: "Only open incidents can move to review." };
  await db.transaction(async tx => {
    await tx.update(schema.incidents).set({ status: "under_review" }).where(eq(schema.incidents.id, id));
    await timelineNote(tx, id, user.id, "review", "Review started.");
  });
  return {};
}
