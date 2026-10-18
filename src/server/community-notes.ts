import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { dateKey } from "@/lib/format";
import { overlaps, parseCommunityNote } from "@/lib/community-note";
import { db, schema } from "@/server/db";
import type { SessionUser } from "@/server/auth";
import { getSettings } from "@/server/settings";

const UUID = /^[0-9a-f-]{36}$/;

/* Saves and signs a Community Participation note for one person. */
export async function saveCommunityNote(user: SessionUser, formData: FormData): Promise<{ id: string; error?: undefined } | { error: string; id?: undefined }> {
  const requestId = String(formData.get("_requestId") ?? "");
  if (requestId && !UUID.test(requestId)) return { error: "Unknown note request." };
  const individualId = String(formData.get("individualId") ?? "");
  if (!UUID.test(individualId)) return { error: "Choose who the note is for." };
  const [person] = await db.select({ id: schema.individuals.id, active: schema.individuals.active, first: schema.individuals.firstName }).from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person || !person.active) return { error: "That person is not supported any more." };

  const settings = await getSettings();
  const parsed = parseCommunityNote(formData, { today: dateKey(), noteMin: settings.cp_note_min_chars, costCenters: settings.cp_cost_centers });
  if ("error" in parsed) return parsed;
  const { note } = parsed;

  // Optional: another staff member who was there. They do not sign.
  const withRaw = String(formData.get("withStaffId") ?? "");
  let withStaffId: string | null = null;
  if (withRaw) {
    if (!UUID.test(withRaw) || withRaw === user.staffId) return { error: "Choose another staff member, or leave it empty." };
    const [other] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.id, withRaw), eq(schema.staff.active, true))).limit(1);
    if (!other) return { error: "That staff member is not active." };
    withStaffId = other.id;
  }

  return db.transaction(async tx => {
    // Serialize a writer's community notes, including notes made simultaneously on another device.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.agencyId + ":" + (user.staffId ?? user.id)}))`);
    if (requestId) {
      const [event] = await tx.select({ id: schema.auditLog.entityId }).from(schema.auditLog).where(and(eq(schema.auditLog.entityId, requestId), eq(schema.auditLog.entity, "community_note"), eq(schema.auditLog.action, "create"), eq(schema.auditLog.userId, user.id))).limit(1);
      if (event) return { id: event.id! };
    }
  // The same writer cannot bill the same person twice for the same minutes.
  if (user.staffId) {
    const same = await tx
      .select({ startTime: schema.communityNotes.startTime, endTime: schema.communityNotes.endTime })
      .from(schema.communityNotes)
      .where(and(eq(schema.communityNotes.individualId, individualId), eq(schema.communityNotes.staffId, user.staffId), eq(schema.communityNotes.noteDate, note.noteDate)));
    if (same.some(row => overlaps(row, note))) return { error: `You already wrote a Community Participation note for ${person.first} that covers part of this time.` };
  }

  const [row] = await tx
    .insert(schema.communityNotes)
    .values({ ...(requestId ? { id: requestId } : {}), ...note, individualId, staffId: user.staffId, withStaffId, signedName: user.name, signedAt: new Date() })
    .returning({ id: schema.communityNotes.id });
  await tx.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "community_note", entityId: row.id });
  return { id: row.id };
  });
}
