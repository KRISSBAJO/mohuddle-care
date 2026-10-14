import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { shiftMinutes } from "@/lib/log-note";
import { mayReview, noteRights, reviewFlags, type FlagKey, type NoteKind, type ReviewStatus } from "@/lib/note-review";
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
          })
          .from(schema.dailyLogs)
          .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
          .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
          .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
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
    ...daily.map(row => ({ ...row, kind: "daily" as const, attention: row.behaviour || row.seizure || row.mood === "low" || row.mood === "distressed" })),
    ...community.map(row => ({ ...row, kind: "community" as const, attention: false })),
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
    };
  });
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
  return { note, events, reviewedBy: reviewer[0] ?? null, rights: noteRights(user, { ...asTarget(note), status: note.status }, settings.note_review_roles) };
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
