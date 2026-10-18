import "server-only";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { addDays, dateKey } from "@/lib/format";
import { MOODS } from "@/lib/log-note";
import type { NoteKind } from "@/lib/note-review";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { COMMUNITY_LABELS, DAILY_LABELS, noteVersion } from "@/server/note-workflow";
import { goalsForLogs } from "@/server/queries/logs";
import { myReturned, noteReview, reviewQueue } from "@/server/queries/note-review";
import { getSettings } from "@/server/settings";

export async function mobileNoteInbox(user: SessionUser, now: number) {
  const settings = await getSettings();
  const today = dateKey(new Date(now));
  const since = addDays(today, -29);
  const row = { id: schema.dailyLogs.id, day: schema.dailyLogs.logDate, person: schema.individuals.firstName, last: schema.individuals.lastName, status: schema.dailyLogs.reviewStatus };
  const [returned, review, daily, community, people, staff] = await Promise.all([
    myReturned(user.staffId),
    reviewQueue(user, { status: "submitted", kind: "all", homeId: "", flagged: false, from: since, to: today }, settings, now),
    user.staffId ? db.select(row).from(schema.dailyLogs).innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId)).where(and(eq(schema.dailyLogs.staffId, user.staffId), gte(schema.dailyLogs.logDate, since))).orderBy(desc(schema.dailyLogs.logDate)).limit(100) : [],
    user.staffId ? db.select({ ...row, id: schema.communityNotes.id, day: schema.communityNotes.noteDate, status: schema.communityNotes.reviewStatus }).from(schema.communityNotes).innerJoin(schema.individuals, eq(schema.individuals.id, schema.communityNotes.individualId)).where(and(eq(schema.communityNotes.staffId, user.staffId), gte(schema.communityNotes.noteDate, since))).orderBy(desc(schema.communityNotes.noteDate)).limit(100) : [],
    db.select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName }).from(schema.individuals).where(eq(schema.individuals.active, true)).orderBy(asc(schema.individuals.firstName)),
    db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.firstName)),
  ]);
  return {
    returned: returned.map(note => ({ ...note, person: `${note.first} ${note.last}` })),
    review: review.map(({ id, kind, person, day, status, flags, writer }) => ({ id, kind, person, day, status, flags, writer })),
    recent: [...daily.map(note => ({ ...note, kind: "daily" as const })), ...community.map(note => ({ ...note, kind: "community" as const }))].map(note => ({ ...note, person: `${note.person} ${note.last}` })).sort((a, b) => b.day.localeCompare(a.day)),
    people: people.map(person => ({ id: person.id, name: `${person.first} ${person.last}` })),
    staff: staff.filter(person => person.id !== user.staffId).map(person => ({ id: person.id, name: `${person.first} ${person.last}` })),
    community: { today, costCenters: settings.cp_cost_centers, minimum: settings.cp_note_min_chars },
  };
}

export async function mobileNoteRecord(user: SessionUser, kind: NoteKind, id: string, now: number) {
  const settings = await getSettings();
  const review = await noteReview(kind, id, user, settings, now);
  if (!review) return null;
  const table = kind === "daily" ? schema.dailyLogs : schema.communityNotes;
  const [record] = await db.select().from(table).where(eq(table.id, id));
  if (!record) return null;
  const labels = kind === "daily" ? DAILY_LABELS : COMMUNITY_LABELS;
  const fields = Object.fromEntries(Object.keys(labels).map(key => [key, String(record[key as keyof typeof record] ?? "")]));
  const daily = kind === "daily" ? record as typeof schema.dailyLogs.$inferSelect : null;
  if (daily) for (const entry of daily.timeline) fields[`timeline.${entry.hour}`] = entry.note;
  const goals = daily ? (await goalsForLogs([id])).get(id) ?? [] : [];
  // Include recorded structured answers as well as prose. Never turn internal IDs into UI content.
  const omit = new Set(["id", "agencyId", "individualId", "staffId", "shiftId", "withStaffId", "reviewedBy", "sections", "returnReason", "reviewStatus", "editedAt", "reviewedAt", "createdAt", ...Object.keys(labels)]);
  const details = Object.entries(record).filter(([key, value]) => !omit.has(key) && value !== "" && value !== null && (!Array.isArray(value) || value.length > 0));
  return { ...review, version: noteVersion(record), fields, labels, details, goals, locations: settings.log_locations, moods: [...MOODS], costCenters: settings.cp_cost_centers, minimum: kind === "daily" ? settings.daily_log_summary_min_chars : settings.cp_note_min_chars };
}
