"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dateKey } from "@/lib/format";
import { overlaps, parseCommunityNote } from "@/lib/community-note";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

const UUID = /^[0-9a-f-]{36}$/;

/* Saves and signs a Community Participation note for one person. */
export async function createCommunityNote(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
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

  // The same writer cannot bill the same person twice for the same minutes.
  if (user.staffId) {
    const same = await db
      .select({ startTime: schema.communityNotes.startTime, endTime: schema.communityNotes.endTime })
      .from(schema.communityNotes)
      .where(and(eq(schema.communityNotes.individualId, individualId), eq(schema.communityNotes.staffId, user.staffId), eq(schema.communityNotes.noteDate, note.noteDate)));
    if (same.some(row => overlaps(row, note))) return { error: `You already wrote a Community Participation note for ${person.first} that covers part of this time.` };
  }

  const [row] = await db
    .insert(schema.communityNotes)
    .values({ ...note, individualId, staffId: user.staffId, withStaffId, signedName: user.name, signedAt: new Date() })
    .returning({ id: schema.communityNotes.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "community_note", entityId: row.id });
  revalidatePath(`/app/individuals/${individualId}`);
  redirect(`/app/community-notes/${row.id}?saved=1`);
}
