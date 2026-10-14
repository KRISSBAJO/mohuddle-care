"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { overlaps, parseCommunityNote } from "@/lib/community-note";
import { dateKey } from "@/lib/format";
import { MOODS, shiftHours } from "@/lib/log-note";
import { changesBetween, readNoteRefs, type NoteKind } from "@/lib/note-review";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { notify, recipients, type Role } from "@/server/notify";
import { noteReview } from "@/server/queries/note-review";
import { getSettings, type Settings } from "@/server/settings";
import type { FormState } from "./auth";

const UUID = /^[0-9a-f-]{36}$/;
const hrefFor = (kind: NoteKind, id: string) => (kind === "daily" ? `/app/daily-logs/${id}` : `/app/community-notes/${id}`);
const tableFor = (kind: NoteKind) => (kind === "daily" ? schema.dailyLogs : schema.communityNotes);

async function load(kind: NoteKind, id: string, user: SessionUser, settings: Settings) {
  if (!UUID.test(id)) return null;
  return noteReview(kind, id, user, settings, Date.now());
}

function refresh(kind: NoteKind, id: string, personId: string) {
  revalidatePath(hrefFor(kind, id));
  revalidatePath(`/app/individuals/${personId}`);
  revalidatePath("/app/daily-logs");
}

/* Tells the writer, if they have a login. */
async function tellWriter(staffId: string | null, except: string, message: { kind: string; title: string; body?: string; href: string; tone: "info" | "warn" | "bad" | "good"; dedupeKey: string }) {
  if (!staffId) return;
  await notify(await recipients({ staffIds: [staffId], except }), message);
}

/* Approves one note. Approved notes are locked. */
export async function approveNote(kind: NoteKind, id: string): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  const review = await load(kind, id, user, settings);
  if (!review?.rights.approve) return { error: "This note cannot be approved now." };
  const table = tableFor(kind);
  await db.update(table).set({ reviewStatus: "approved", reviewedBy: user.id, reviewedAt: new Date(), returnReason: "" }).where(and(eq(table.id, id), eq(table.reviewStatus, "submitted")));
  await db.insert(schema.noteEvents).values({ noteKind: kind, noteId: id, userId: user.id, action: "approved" });
  refresh(kind, id, review.note.personId);
  return {};
}

/* Sends a note back to its writer with what to fix. */
export async function returnNote(kind: NoteKind, id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  const review = await load(kind, id, user, settings);
  if (!review?.rights.returnIt) return { error: "This note cannot be returned now." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Say what the writer should fix." };
  if (reason.length > 1000) return { error: "Keep the reason under 1,000 characters." };
  const table = tableFor(kind);
  await db.update(table).set({ reviewStatus: "returned", reviewedBy: user.id, reviewedAt: new Date(), returnReason: reason }).where(eq(table.id, id));
  await db.insert(schema.noteEvents).values({ noteKind: kind, noteId: id, userId: user.id, action: "returned", note: reason });
  await tellWriter(review.note.writerStaffId, user.id, {
    kind: "notes:returned",
    title: `${user.name} sent back your note for ${review.note.person}`,
    body: reason,
    href: hrefFor(kind, id),
    tone: "warn",
    dedupeKey: `notes:returned:${id}:${Date.now()}`,
  });
  refresh(kind, id, review.note.personId);
  return {};
}

/* Opens an approved note again, for an administrator to correct it. */
export async function reopenNote(kind: NoteKind, id: string): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  const review = await load(kind, id, user, settings);
  if (!review?.rights.reopen) return { error: "Only an administrator can reopen an approved note." };
  const table = tableFor(kind);
  await db.update(table).set({ reviewStatus: "submitted", reviewedBy: null, reviewedAt: null }).where(eq(table.id, id));
  await db.insert(schema.noteEvents).values({ noteKind: kind, noteId: id, userId: user.id, action: "reopened" });
  refresh(kind, id, review.note.personId);
  return {};
}

export type BulkState = FormState & { approved?: number; skipped?: number };

/* Approves many notes at once. Flagged notes are left for one-by-one review unless the setting allows them. */
export async function approveNotes(_previous: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const settings = await getSettings();
  const refs = readNoteRefs(formData.getAll("note").map(String));
  if (!refs.length) return { error: "Tick the notes to approve." };
  if (refs.length > 300) return { error: "Approve up to 300 notes at a time." };
  let approved = 0;
  let skipped = 0;
  for (const ref of refs) {
    const review = await load(ref.kind, ref.id, user, settings);
    if (!review?.rights.approve || (settings.note_bulk_flagged === "skip" && review.note.flags.length > 0)) {
      skipped += 1;
      continue;
    }
    const table = tableFor(ref.kind);
    await db.update(table).set({ reviewStatus: "approved", reviewedBy: user.id, reviewedAt: new Date(), returnReason: "" }).where(and(eq(table.id, ref.id), eq(table.reviewStatus, "submitted")));
    await db.insert(schema.noteEvents).values({ noteKind: ref.kind, noteId: ref.id, userId: user.id, action: "approved", note: "Approved with others" });
    approved += 1;
  }
  revalidatePath("/app/daily-logs");
  return { approved, skipped };
}

/*
 * After an edit: a reviewer's edit is recorded and the writer is told; a writer's edit to a
 * returned note sends it back for review and tells the reviewers.
 */
async function afterEdit(kind: NoteKind, id: string, user: SessionUser, settings: Settings, review: NonNullable<Awaited<ReturnType<typeof load>>>, changes: { field: string; before: string; after: string }[], reason: string) {
  const table = tableFor(kind);
  const resubmit = review.rights.writer && review.note.status === "returned";
  await db
    .update(table)
    .set(resubmit ? { reviewStatus: "submitted", editedAt: new Date(), returnReason: "" } : { editedAt: new Date() })
    .where(eq(table.id, id));
  await db.insert(schema.noteEvents).values({ noteKind: kind, noteId: id, userId: user.id, action: resubmit ? "resubmitted" : "edited", note: reason, changes });
  if (resubmit) {
    const ids = await recipients({ roles: settings.note_review_roles as Role[], staffIds: [review.note.homeManagerStaffId], except: user.id });
    await notify(ids, { kind: "notes:resubmitted", title: `${user.name} fixed and resubmitted a note for ${review.note.person}`, body: reason || undefined, href: hrefFor(kind, id), tone: "info", dedupeKey: `notes:resubmitted:${id}:${Date.now()}` });
  } else {
    await tellWriter(review.note.writerStaffId, user.id, { kind: "notes:edited", title: `${user.name} edited your note for ${review.note.person}`, body: reason, href: hrefFor(kind, id), tone: "info", dedupeKey: `notes:edited:${id}:${Date.now()}` });
  }
  refresh(kind, id, review.note.personId);
}

const DAILY_LABELS: Record<string, string> = {
  timeIn: "Start time",
  timeOut: "Finish time",
  location: "Where support was given",
  mood: "Mood",
  presentation: "Presentation",
  meals: "Meals",
  health: "Health",
  activities: "Activities",
  behaviours: "Behaviour",
  antecedent: "Before the behaviour",
  intervention: "Staff response",
  behaviourOutcome: "After the behaviour",
  familyContact: "Family or guardian contact",
  appointments: "Appointments",
  goalProgress: "Goal progress",
  notes: "Shift summary",
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/* Edits a signed shift note. Reviewers give a reason; a writer fixing a returned note resubmits it. */
export async function editDailyLog(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  const review = await load("daily", id, user, settings);
  if (!review?.rights.edit) return { error: "You cannot edit this note now." };
  const [log] = await db.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, id)).limit(1);
  if (!log) return { error: "This note no longer exists." };

  const text = (name: string, max: number) => String(formData.get(name) ?? "").trim().slice(0, max);
  const after: Record<string, string> = {};
  // Fields the edit page did not show keep what they had.
  for (const field of Object.keys(DAILY_LABELS)) after[field] = formData.has(field) ? text(field, field === "notes" ? 5000 : 3000) : String(log[field as keyof typeof log] ?? "");
  // Older notes were written without times; they may stay without them.
  const timesLeftOut = !log.timeIn && !log.timeOut && !after.timeIn && !after.timeOut;
  if (!timesLeftOut && (!TIME.test(after.timeIn) || !TIME.test(after.timeOut) || after.timeIn === after.timeOut)) return { error: "Enter a start and finish time that are not the same." };
  if (!settings.log_locations.includes(after.location) && after.location !== log.location) return { error: "Choose where support was given." };
  if (!(MOODS as readonly string[]).includes(after.mood)) return { error: "Choose a mood." };
  if (after.notes.length < settings.daily_log_summary_min_chars) return { error: `The shift summary needs at least ${settings.daily_log_summary_min_chars} characters.` };

  // Timeline lines: one per hour of the (possibly new) times, keeping the doses recorded at signing.
  const timeline = log.sections.includes("timeline")
    ? shiftHours(after.timeIn, after.timeOut)
        .map(hour => ({ hour, note: text(`timeline.${hour}`, 500), meds: log.timeline.find(entry => entry.hour === hour)?.meds ?? [] }))
        .filter(entry => entry.note || entry.meds.length)
    : log.timeline;

  const before = Object.fromEntries(Object.keys(DAILY_LABELS).map(field => [field, String(log[field as keyof typeof log] ?? "")]));
  const changes = changesBetween(before, after, DAILY_LABELS);
  const lines = (entries: typeof timeline) => entries.map(entry => `${entry.hour} ${entry.note}`).join("\n");
  if (lines(timeline) !== lines(log.timeline)) changes.push({ field: "Hourly timeline", before: lines(log.timeline), after: lines(timeline) });

  const reason = text("reason", 1000);
  if (!changes.length && !review.rights.writer) return { error: "Nothing was changed." };
  if (review.rights.reviewer && !review.rights.writer && reason.length < 5) return { error: "Give a reason for the edit. The writer sees it." };

  await db
    .update(schema.dailyLogs)
    .set({ ...after, mood: after.mood as (typeof MOODS)[number], timeline })
    .where(eq(schema.dailyLogs.id, id));
  await afterEdit("daily", id, user, settings, review, changes, reason);
  redirect(`/app/daily-logs/${id}?edited=1`);
}

const COMMUNITY_LABELS: Record<string, string> = {
  noteDate: "Date",
  startTime: "Start time",
  endTime: "End time",
  trips: "Number of trips",
  costCenter: "Cost center",
  otherParty: "Other responsible party",
  selection: "How the activity was selected",
  location: "Location",
  activity: "Activity or action",
  note: "Note",
  learning: "Learning opportunities",
};

/* Edits a signed Community Participation note, with the same rules as writing one. */
export async function editCommunityNote(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  const review = await load("community", id, user, settings);
  if (!review?.rights.edit) return { error: "You cannot edit this note now." };
  const [current] = await db.select().from(schema.communityNotes).where(eq(schema.communityNotes.id, id)).limit(1);
  if (!current) return { error: "This note no longer exists." };

  formData.set("attest", "on");
  const parsed = parseCommunityNote(formData, { today: dateKey(), noteMin: settings.cp_note_min_chars, costCenters: [...settings.cp_cost_centers, current.costCenter].filter(Boolean) });
  if ("error" in parsed) return parsed;
  const { note } = parsed;
  if (current.staffId) {
    const others = await db
      .select({ startTime: schema.communityNotes.startTime, endTime: schema.communityNotes.endTime })
      .from(schema.communityNotes)
      .where(and(eq(schema.communityNotes.individualId, current.individualId), eq(schema.communityNotes.staffId, current.staffId), eq(schema.communityNotes.noteDate, note.noteDate), ne(schema.communityNotes.id, id)));
    if (others.some(row => overlaps(row, note))) return { error: "Another note by the same writer already covers part of this time." };
  }

  const show = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  const before = Object.fromEntries(Object.keys(COMMUNITY_LABELS).map(field => [field, show(current[field as keyof typeof current])]));
  const after = Object.fromEntries(Object.keys(COMMUNITY_LABELS).map(field => [field, show(note[field as keyof typeof note])]));
  const changes = changesBetween(before, after, COMMUNITY_LABELS);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (!changes.length && !review.rights.writer) return { error: "Nothing was changed." };
  if (review.rights.reviewer && !review.rights.writer && reason.length < 5) return { error: "Give a reason for the edit. The writer sees it." };

  await db.update(schema.communityNotes).set(note).where(eq(schema.communityNotes.id, id));
  await afterEdit("community", id, user, settings, review, changes, reason);
  redirect(`/app/community-notes/${id}?edited=1`);
}
