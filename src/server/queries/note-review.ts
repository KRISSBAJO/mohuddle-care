import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { shiftMinutes } from "@/lib/log-note";
import { closestCopy, mayReview, noteRights, reviewFlags, shingles, type CopyMatch, type FlagKey, type NoteKind, type ReviewStatus } from "@/lib/note-review";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import type { Settings } from "@/server/settings";

const staffName = sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`;

export type ReviewFilters = { status: ReviewStatus | "all"; kind: NoteKind | "all"; homeId: string; flagged: boolean; from: string; to: string };

export type ReviewRow = {
  kind: NoteKind;
  id: string;
  personId: string;
  person: string;
  homeId: string | null;
  home: string | null;
  homeManagerStaffId: string | null;
  day: string;
  startTime: string;
  endTime: string;
  writer: string | null;
  writerStaffId: string | null;
  signedName: string;
  signedAt: Date | null;
  status: ReviewStatus;
  returnReason: string;
  flags: FlagKey[];
  /* The other note this one matches, when flagged as copied. */
  copyOf: CopyMatch | null;
};

/* A note's start and end as instants, from its day and clock times. Null when it has no times. */
function window(day: string, start: string, end: string) {
  const minutes = shiftMinutes(start, end);
  if (minutes === null) return { start: null, end: null };
  const from = zonedTime(day, start).getTime();
  return { start: from, end: from + minutes * 60_000 };
}

/* Shift notes and Community Participation notes in a date range, with their flags, as one list. */
async function notesBetween(filters: ReviewFilters, settings: Settings, now: number): Promise<ReviewRow[]> {
  const status = filters.status === "all" ? undefined : filters.status;
  const [daily, community] = await Promise.all([
    filters.kind === "community"
      ? []
      : db
          .select({
            id: schema.dailyLogs.id,
            personId: schema.dailyLogs.individualId,
            first: schema.individuals.firstName,
            last: schema.individuals.lastName,
            homeId: schema.individuals.homeId,
            home: schema.homes.name,
            homeManagerStaffId: schema.homes.managerStaffId,
            day: schema.dailyLogs.logDate,
            startTime: schema.dailyLogs.timeIn,
            endTime: schema.dailyLogs.timeOut,
            writer: staffName,
            writerStaffId: schema.dailyLogs.staffId,
            signedName: schema.dailyLogs.signedName,
            signedAt: schema.dailyLogs.signedAt,
            createdAt: schema.dailyLogs.createdAt,
            status: schema.dailyLogs.reviewStatus,
            returnReason: schema.dailyLogs.returnReason,
            mood: schema.dailyLogs.mood,
            seizure: schema.dailyLogs.seizure,
            behaviour: schema.dailyLogs.behaviourOccurred,
            ...dailyText,
            shiftEnd: schema.shifts.endsAt,
          })
          .from(schema.dailyLogs)
          .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
          .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
          .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
          .leftJoin(schema.shifts, eq(schema.shifts.id, schema.dailyLogs.shiftId))
          .where(
            and(
              gte(schema.dailyLogs.logDate, filters.from),
              lte(schema.dailyLogs.logDate, filters.to),
              status ? eq(schema.dailyLogs.reviewStatus, status) : undefined,
              filters.homeId ? eq(schema.individuals.homeId, filters.homeId) : undefined,
            ),
          )
          .orderBy(desc(schema.dailyLogs.logDate), asc(schema.individuals.firstName))
          .limit(600),
    filters.kind === "daily"
      ? []
      : db
          .select({
            id: schema.communityNotes.id,
            personId: schema.communityNotes.individualId,
            first: schema.individuals.firstName,
            last: schema.individuals.lastName,
            homeId: schema.individuals.homeId,
            home: schema.homes.name,
            homeManagerStaffId: schema.homes.managerStaffId,
            day: schema.communityNotes.noteDate,
            startTime: schema.communityNotes.startTime,
            endTime: schema.communityNotes.endTime,
            writer: staffName,
            writerStaffId: schema.communityNotes.staffId,
            signedName: schema.communityNotes.signedName,
            signedAt: schema.communityNotes.signedAt,
            createdAt: schema.communityNotes.createdAt,
            status: schema.communityNotes.reviewStatus,
            returnReason: schema.communityNotes.returnReason,
            ...communityText,
          })
          .from(schema.communityNotes)
          .innerJoin(schema.individuals, eq(schema.individuals.id, schema.communityNotes.individualId))
          .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
          .leftJoin(schema.staff, eq(schema.staff.id, schema.communityNotes.staffId))
          .where(
            and(
              gte(schema.communityNotes.noteDate, filters.from),
              lte(schema.communityNotes.noteDate, filters.to),
              status ? eq(schema.communityNotes.reviewStatus, status) : undefined,
              filters.homeId ? eq(schema.individuals.homeId, filters.homeId) : undefined,
            ),
          )
          .orderBy(desc(schema.communityNotes.noteDate))
          .limit(600),
  ]);
  const all = [
    ...daily.map(row => ({ ...row, kind: "daily" as const, attention: row.behaviour || row.seizure || row.mood === "low" || row.mood === "distressed", text: joinText(row), endsAt: row.shiftEnd })),
    ...community.map(row => ({ ...row, kind: "community" as const, attention: false, text: joinText(row), endsAt: shiftMinutes(row.startTime, row.endTime) === null ? null : zonedTime(row.day, row.endTime) })),
  ];
  return withFlags(all, settings, now);
}

type FactRow = {
  kind: NoteKind;
  id: string;
  personId: string;
  first: string;
  last: string;
  homeId: string | null;
  home: string | null;
  homeManagerStaffId: string | null;
  day: string;
  startTime: string;
  endTime: string;
  writer: string | null;
  writerStaffId: string | null;
  signedName: string;
  signedAt: Date | null;
  createdAt: Date;
  status: ReviewStatus;
  returnReason: string;
  attention: boolean;
  text: string;
  endsAt: Date | null;
};

/* Adds each note's flags, loading the writers' punches and resubmissions in two queries. */
async function withFlags(rows: FactRow[], settings: Settings, now: number): Promise<ReviewRow[]> {
  if (!rows.length) return [];
  const writers = [...new Set(rows.map(row => row.writerStaffId).filter((id): id is string => Boolean(id)))];
  const days = rows.map(row => row.day).sort();
  const [punches, resubmitted] = await Promise.all([
    writers.length
      ? db
          .select({ staffId: schema.timeEntries.staffId, clockInAt: schema.timeEntries.clockInAt, clockOutAt: schema.timeEntries.clockOutAt })
          .from(schema.timeEntries)
          .where(and(inArray(schema.timeEntries.staffId, writers), gte(schema.timeEntries.clockInAt, zonedTime(addDays(days[0], -1), "00:00")), lte(schema.timeEntries.clockInAt, zonedTime(addDays(days[days.length - 1], 2), "00:00"))))
      : [],
    db
      .selectDistinct({ noteId: schema.noteEvents.noteId })
      .from(schema.noteEvents)
      .where(and(inArray(schema.noteEvents.noteId, rows.map(row => row.id)), eq(schema.noteEvents.action, "resubmitted"))),
  ]);
  const resent = new Set(resubmitted.map(row => row.noteId));
  const copies = settings.note_review_checks.includes("copied") ? await copyMatches(rows, writers, days[0], days[days.length - 1], settings.note_copy_percent) : new Map<string, CopyMatch>();
  const earlyMs = settings.note_early_minutes * 60_000;
  return rows.map(row => {
    const times = window(row.day, row.startTime, row.endTime);
    const flags = reviewFlags(
      {
        noteDay: row.day,
        writtenDay: dateKey(row.signedAt ?? row.createdAt),
        ...times,
        punches: row.writerStaffId ? punches.filter(punch => punch.staffId === row.writerStaffId).map(punch => ({ in: punch.clockInAt.getTime(), out: punch.clockOutAt?.getTime() ?? null })) : null,
        attention: row.attention,
        resubmitted: resent.has(row.id),
        copied: copies.has(row.id),
        early: Boolean(row.endsAt && (row.signedAt ?? row.createdAt).getTime() < row.endsAt.getTime() - (row.kind === "daily" ? earlyMs : 0)),
      },
      settings.note_review_checks,
      settings.note_punch_tolerance_minutes,
      now,
    );
    return {
      kind: row.kind,
      id: row.id,
      personId: row.personId,
      person: `${row.first} ${row.last}`,
      homeId: row.homeId,
      home: row.home,
      homeManagerStaffId: row.homeManagerStaffId,
      day: row.day,
      startTime: row.startTime,
      endTime: row.endTime,
      writer: row.writer ?? (row.signedName || null),
      writerStaffId: row.writerStaffId,
      signedName: row.signedName,
      signedAt: row.signedAt,
      status: row.status,
      returnReason: row.returnReason,
      flags,
      copyOf: copies.get(row.id) ?? null,
    };
  });
}


/* The written parts of each kind of note, joined, for comparing notes. */
const dailyText = {
  t1: schema.dailyLogs.notes,
  t2: schema.dailyLogs.presentation,
  t3: schema.dailyLogs.meals,
  t4: schema.dailyLogs.health,
  t5: schema.dailyLogs.activities,
  t6: schema.dailyLogs.behaviours,
  t7: schema.dailyLogs.goalProgress,
};
const communityText = { t1: schema.communityNotes.note, t2: schema.communityNotes.activity, t3: schema.communityNotes.learning, t4: schema.communityNotes.selection };
const joinText = (row: Partial<Record<"t1" | "t2" | "t3" | "t4" | "t5" | "t6" | "t7", string>>) => [row.t1, row.t2, row.t3, row.t4, row.t5, row.t6, row.t7].filter(Boolean).join(" ");

/*
 * Notes whose words match another note by the same writer: from 14 days before the earliest note
 * up to the latest, for any person. Same-day notes for different people count too.
 */
async function copyMatches(rows: { id: string; writerStaffId: string | null; day: string; text: string }[], writers: string[], firstDay: string, lastDay: string, threshold: number) {
  const found = new Map<string, CopyMatch>();
  if (!writers.length) return found;
  const since = addDays(firstDay, -14);
  const [daily, community] = await Promise.all([
    db
      .select({ id: schema.dailyLogs.id, staffId: schema.dailyLogs.staffId, day: schema.dailyLogs.logDate, first: schema.individuals.firstName, ...dailyText })
      .from(schema.dailyLogs)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
      .where(and(inArray(schema.dailyLogs.staffId, writers), gte(schema.dailyLogs.logDate, since), lte(schema.dailyLogs.logDate, lastDay))),
    db
      .select({ id: schema.communityNotes.id, staffId: schema.communityNotes.staffId, day: schema.communityNotes.noteDate, first: schema.individuals.firstName, ...communityText })
      .from(schema.communityNotes)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.communityNotes.individualId))
      .where(and(inArray(schema.communityNotes.staffId, writers), gte(schema.communityNotes.noteDate, since), lte(schema.communityNotes.noteDate, lastDay))),
  ]);
  const pool = [
    ...daily.map(row => ({ id: row.id, kind: "daily" as const, staffId: row.staffId, day: row.day, person: row.first, runs: shingles(joinText(row)) })),
    ...community.map(row => ({ id: row.id, kind: "community" as const, staffId: row.staffId, day: row.day, person: row.first, runs: shingles(joinText(row)) })),
  ].filter(item => item.runs.size);
  for (const row of rows) {
    if (!row.writerStaffId) continue;
    const runs = shingles(row.text);
    if (!runs.size) continue;
    const others = pool.filter(item => item.staffId === row.writerStaffId && item.day <= row.day && item.day >= addDays(row.day, -14));
    const match = closestCopy({ id: row.id, runs }, others, threshold);
    if (match) found.set(row.id, match);
  }
  return found;
}

const asTarget = (row: ReviewRow) => ({ writerStaffId: row.writerStaffId, signedName: row.signedName, homeManagerStaffId: row.homeManagerStaffId });

/* The notes this user may review, filtered, newest first. */
export async function reviewQueue(user: SessionUser, filters: ReviewFilters, settings: Settings, now: number) {
  const rows = (await notesBetween(filters, settings, now)).filter(row => mayReview(user, asTarget(row), settings.note_review_roles));
  return filters.flagged ? rows.filter(row => row.flags.length > 0) : rows;
}

/* How many notes from the last 30 days wait for this user's review. */
export async function reviewWaiting(user: SessionUser, settings: Settings, now: number) {
  const today = dateKey(new Date(now));
  const rows = await reviewQueue(user, { status: "submitted", kind: "all", homeId: "", flagged: false, from: addDays(today, -29), to: today }, settings, now);
  return rows.length;
}

/* One note's review: its status, flags, what this user may do, and its history. */
export async function noteReview(kind: NoteKind, id: string, user: SessionUser, settings: Settings, now: number) {
  const table = kind === "daily" ? schema.dailyLogs : schema.communityNotes;
  const [row] = await db.select({ day: kind === "daily" ? schema.dailyLogs.logDate : schema.communityNotes.noteDate }).from(table).where(eq(table.id, id)).limit(1);
  if (!row) return null;
  const [note] = (await notesBetween({ status: "all", kind, homeId: "", flagged: false, from: row.day, to: row.day }, settings, now)).filter(item => item.id === id);
  if (!note) return null;
  const [events, reviewer] = await Promise.all([
    db
      .select({ id: schema.noteEvents.id, action: schema.noteEvents.action, note: schema.noteEvents.note, changes: schema.noteEvents.changes, at: schema.noteEvents.createdAt, by: schema.users.name })
      .from(schema.noteEvents)
      .leftJoin(schema.users, eq(schema.users.id, schema.noteEvents.userId))
      .where(and(eq(schema.noteEvents.noteKind, kind), eq(schema.noteEvents.noteId, id)))
      .orderBy(desc(schema.noteEvents.createdAt)),
    db
      .select({ name: schema.users.name, at: (kind === "daily" ? schema.dailyLogs : schema.communityNotes).reviewedAt })
      .from(table)
      .innerJoin(schema.users, eq(schema.users.id, (kind === "daily" ? schema.dailyLogs : schema.communityNotes).reviewedBy))
      .where(eq(table.id, id))
      .limit(1),
  ]);
  return { note, events, reviewedBy: reviewer[0] ?? null, rights: noteRights(user, { ...asTarget(note), status: note.status }, settings.note_review_roles, settings.note_writer_edit) };
}

/* The user's own notes that a reviewer sent back, oldest first so the longest-waiting is fixed first. */
export async function myReturned(staffId: string | null) {
  if (!staffId) return [];
  const [daily, community] = await Promise.all([
    db
      .select({ id: schema.dailyLogs.id, day: schema.dailyLogs.logDate, reason: schema.dailyLogs.returnReason, first: schema.individuals.firstName, last: schema.individuals.lastName })
      .from(schema.dailyLogs)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
      .where(and(eq(schema.dailyLogs.staffId, staffId), eq(schema.dailyLogs.reviewStatus, "returned"))),
    db
      .select({ id: schema.communityNotes.id, day: schema.communityNotes.noteDate, reason: schema.communityNotes.returnReason, first: schema.individuals.firstName, last: schema.individuals.lastName })
      .from(schema.communityNotes)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.communityNotes.individualId))
      .where(and(eq(schema.communityNotes.staffId, staffId), eq(schema.communityNotes.reviewStatus, "returned"))),
  ]);
  return [...daily.map(row => ({ ...row, kind: "daily" as const })), ...community.map(row => ({ ...row, kind: "community" as const }))].sort((a, b) => a.day.localeCompare(b.day));
}
