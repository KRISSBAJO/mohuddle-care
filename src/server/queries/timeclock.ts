import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { addDays, dateKey, weekStart, zonedTime } from "@/lib/format";
import { clockableShift, handoverChecklist, nextShift, overstayMinutes, workedMinutes } from "@/lib/timeclock";
import { db, schema } from "@/server/db";
import type { Settings } from "@/server/settings";
import { officeAccess, officePoint } from "@/lib/office-work";
import { officeSnapshot } from "@/server/office-work";

const staffName = sql<string>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`;
const workPlace = sql<string | null>`case when ${schema.timeEntries.flags} @> '["office_work"]'::jsonb then 'Office / admin work' else ${schema.homes.name} end`;
export const isUuid = (value: string | undefined | null): value is string => Boolean(value && /^[0-9a-f-]{36}$/.test(value));

/* ---------- The staff member's own clock ---------- */

/* The stretch of work someone is in now, with its breaks, shift and home. */
export async function openEntry(staffId: string) {
  const [row] = await db
    .select({
      entry: schema.timeEntries,
      home: workPlace,
      homeLatitude: schema.homes.latitude,
      homeLongitude: schema.homes.longitude,
      homeChecks: schema.homes.handoverChecks,
      shiftStart: schema.shifts.startsAt,
      shiftEnd: schema.shifts.endsAt,
      pattern: schema.shiftPatterns.name,
    })
    .from(schema.timeEntries)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.timeEntries.homeId))
    .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(and(eq(schema.timeEntries.staffId, staffId), isNull(schema.timeEntries.clockOutAt)))
    .orderBy(desc(schema.timeEntries.clockInAt))
    .limit(1);
  if (!row) return null;
  if (row.entry.flags.includes("office_work")) {
    const office = await officeSnapshot(row.entry.id);
    row.homeLatitude = office?.latitude ?? null; row.homeLongitude = office?.longitude ?? null;
  }
  const breaks = await db.select().from(schema.timeBreaks).where(eq(schema.timeBreaks.entryId, row.entry.id)).orderBy(asc(schema.timeBreaks.startAt));
  return { ...row, breaks, openBreak: breaks.find(item => !item.endAt) ?? null };
}

/* Handovers at a home in the last day that this person has not read, newest first. */
export async function unreadHandovers(staffId: string, homeIds: string[], now: number) {
  if (!homeIds.length) return [];
  return db
    .select({
      id: schema.handovers.id,
      homeId: schema.handovers.homeId,
      note: schema.handovers.note,
      people: schema.handovers.people,
      checks: schema.handovers.checks,
      incident: schema.handovers.incident,
      createdAt: schema.handovers.createdAt,
      staff: staffName,
    })
    .from(schema.handovers)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.handovers.staffId))
    .leftJoin(schema.handoverReads, and(eq(schema.handoverReads.handoverId, schema.handovers.id), eq(schema.handoverReads.staffId, staffId)))
    .where(
      and(
        inArray(schema.handovers.homeId, homeIds),
        gte(schema.handovers.createdAt, new Date(now - 24 * 3_600_000)),
        or(isNull(schema.handovers.staffId), ne(schema.handovers.staffId, staffId)),
        isNull(schema.handoverReads.id),
      ),
    )
    .orderBy(desc(schema.handovers.createdAt))
    .limit(10);
}

/* Everything the clock-in page needs: the shift to clock in to, homes for an unscheduled start, and what to read. */
export async function clockInContext(staffId: string, now: number, settings: Settings) {
  const shifts = await db
    .select({
      id: schema.shifts.id,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
      homeId: schema.shifts.homeId,
      home: schema.homes.name,
      pattern: schema.shiftPatterns.name,
      kind: schema.shifts.kind,
    })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(and(eq(schema.shifts.staffId, staffId), ne(schema.shifts.status, "missed"), gte(schema.shifts.endsAt, new Date(now)), lt(schema.shifts.startsAt, new Date(now + 36 * 3_600_000))))
    .orderBy(asc(schema.shifts.startsAt));
  // A shift already clocked and finished cannot be clocked again.
  const done = shifts.length
    ? await db.select({ shiftId: schema.timeEntries.shiftId }).from(schema.timeEntries).where(and(inArray(schema.timeEntries.shiftId, shifts.map(shift => shift.id)), isNotNull(schema.timeEntries.clockOutAt)))
    : [];
  const available = shifts.filter(shift => !done.some(row => row.shiftId === shift.id));
  const shift = clockableShift(available, now, settings.clock_early_minutes);
  const upcoming = shift ? null : nextShift(available, now);
  const homes = await db
    .select({ id: schema.homes.id, name: schema.homes.name, latitude: schema.homes.latitude, longitude: schema.homes.longitude })
    .from(schema.homes)
    .where(eq(schema.homes.active, true))
    .orderBy(asc(schema.homes.name));
  const handovers = await unreadHandovers(staffId, homes.map(home => home.id), now);
  // Nothing in the next day and a half: the next shift on the schedule at all, so the clock can say when.
  const [later] = shift || upcoming
    ? []
    : await db
        .select({ startsAt: schema.shifts.startsAt, home: schema.homes.name, pattern: schema.shiftPatterns.name })
        .from(schema.shifts)
        .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
        .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
        .where(and(eq(schema.shifts.staffId, staffId), ne(schema.shifts.status, "missed"), gte(schema.shifts.startsAt, new Date(now))))
        .orderBy(asc(schema.shifts.startsAt))
        .limit(1);
  const [member] = await db.select({ active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  const office = { error: officeAccess(settings, staffId, Boolean(member?.active), Boolean(shift)), address: settings.office_work_address, point: officePoint(settings), radius: settings.office_work_radius };
  return { shift, upcoming, later: later ?? null, homes, handovers, office };
}

/* What is still undone for the people at this home since clock in: notes and doses. */
export async function clockOutContext(open: NonNullable<Awaited<ReturnType<typeof openEntry>>>, now: number, settings: Settings) {
  const { entry } = open;
  const people = entry.homeId
    ? await db
        .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName })
        .from(schema.individuals)
        .where(and(eq(schema.individuals.homeId, entry.homeId), eq(schema.individuals.active, true)))
        .orderBy(asc(schema.individuals.firstName))
    : [];
  const ids = people.map(person => person.id);
  const days = [dateKey(entry.clockInAt), dateKey(new Date(now))];
  const [notes, doses] = ids.length
    ? await Promise.all([
        db
          .select({ individualId: schema.dailyLogs.individualId })
          .from(schema.dailyLogs)
          .where(
            and(
              inArray(schema.dailyLogs.individualId, ids),
              or(
                entry.shiftId ? eq(schema.dailyLogs.shiftId, entry.shiftId) : undefined,
                and(eq(schema.dailyLogs.staffId, entry.staffId), inArray(schema.dailyLogs.logDate, days), gte(schema.dailyLogs.createdAt, entry.clockInAt)),
              ),
            ),
          ),
        db
          .select({ id: schema.medAdministrations.id, individualId: schema.medAdministrations.individualId, scheduledFor: schema.medAdministrations.scheduledFor, medication: schema.medications.name })
          .from(schema.medAdministrations)
          .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
          .where(and(inArray(schema.medAdministrations.individualId, ids), eq(schema.medAdministrations.status, "due"), gte(schema.medAdministrations.scheduledFor, entry.clockInAt), lte(schema.medAdministrations.scheduledFor, new Date(now))))
          .orderBy(asc(schema.medAdministrations.scheduledFor)),
      ])
    : [[], []];
  const withNotes = new Set(notes.map(note => note.individualId));
  return {
    people: people.map(person => ({ ...person, noteWritten: withNotes.has(person.id), dosesDue: doses.filter(dose => dose.individualId === person.id) })),
    notesMissing: people.filter(person => !withNotes.has(person.id)).length,
    dosesMissing: doses.length,
    checklist: handoverChecklist(settings.handover_checks, open.homeChecks ?? []),
    overstay: overstayMinutes(open.shiftEnd, now, settings.clock_overstay_minutes),
    // Minutes before the shift end, when more than the allowance; otherwise 0.
    leftEarly: open.shiftEnd && open.shiftEnd.getTime() - now > settings.clock_early_leave_minutes * 60_000 ? Math.ceil((open.shiftEnd.getTime() - now) / 60_000) : 0,
    worked: workedMinutes(entry.clockInAt, null, open.breaks, now),
  };
}

/* ---------- Lists for staff and managers ---------- */

export type EntryRow = Awaited<ReturnType<typeof entryRows>>[number];

function entryRows(where: ReturnType<typeof and>, limit: number, offset = 0) {
  return db
    .select({
      id: schema.timeEntries.id,
      staffId: schema.timeEntries.staffId,
      staff: staffName,
      homeId: schema.timeEntries.homeId,
      home: workPlace,
      clockInAt: schema.timeEntries.clockInAt,
      clockOutAt: schema.timeEntries.clockOutAt,
      closedBy: schema.timeEntries.closedBy,
      inLocation: schema.timeEntries.inLocation,
      outLocation: schema.timeEntries.outLocation,
      lateMinutes: schema.timeEntries.lateMinutes,
      unscheduled: schema.timeEntries.unscheduled,
      flags: schema.timeEntries.flags,
      warnings: schema.timeEntries.warnings,
      reviewedAt: schema.timeEntries.reviewedAt,
      shiftStart: schema.shifts.startsAt,
      shiftEnd: schema.shifts.endsAt,
      pattern: schema.shiftPatterns.name,
      mealMinutes: sql<number>`coalesce((select sum(extract(epoch from (coalesce(b.end_at, now()) - b.start_at)) / 60) from time_breaks b where b.entry_id = ${schema.timeEntries.id} and b.kind = 'meal'), 0)::int`,
    })
    .from(schema.timeEntries)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.timeEntries.staffId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.timeEntries.homeId))
    .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(where)
    .orderBy(desc(schema.timeEntries.clockInAt))
    .limit(limit)
    .offset(offset);
}

/* Minutes worked on a list row: clock in to out (or now) less meal breaks. */
export const rowMinutes = (row: Pick<EntryRow, "clockInAt" | "clockOutAt" | "mealMinutes">, now: number) =>
  Math.max(0, Math.floor(((row.clockOutAt?.getTime() ?? now) - row.clockInAt.getTime()) / 60_000) - row.mealMinutes);

/* One person's recent punches and their totals this week. */
export async function staffTime(staffId: string, now: number) {
  const monday = weekStart(dateKey(new Date(now)));
  const [rows, corrections] = await Promise.all([
    entryRows(and(eq(schema.timeEntries.staffId, staffId), gte(schema.timeEntries.clockInAt, zonedTime(addDays(monday, -21), "00:00"))), 60),
    db.select().from(schema.timeCorrections).where(eq(schema.timeCorrections.staffId, staffId)).orderBy(desc(schema.timeCorrections.createdAt)).limit(10),
  ]);
  const thisWeek = rows.filter(row => dateKey(row.clockInAt) >= monday);
  return {
    rows,
    corrections,
    weekMinutes: thisWeek.reduce((sum, row) => sum + rowMinutes(row, now), 0),
    lateCount: rows.filter(row => row.lateMinutes > 0).length,
    flagged: rows.filter(row => row.flags.length && !row.reviewedAt).length,
  };
}

export const entryFilters = { all: "All punches", open: "On the clock", flagged: "Needs review", late: "Late", away: "Away from the home", manager: "Closed by a manager" } as const;
export type EntryFilter = keyof typeof entryFilters;

export async function searchEntries(options: { filter: EntryFilter; staff: string; home: string; from: string; to: string; page: number; per: number }) {
  const where = and(
    options.filter === "open" ? isNull(schema.timeEntries.clockOutAt) : undefined,
    options.filter === "flagged" ? and(sql`jsonb_array_length(${schema.timeEntries.flags}) > 0`, isNull(schema.timeEntries.reviewedAt)) : undefined,
    options.filter === "late" ? sql`${schema.timeEntries.lateMinutes} > 0` : undefined,
    options.filter === "away" ? or(inArray(schema.timeEntries.inLocation, ["outside", "unavailable"]), inArray(schema.timeEntries.outLocation, ["outside", "unavailable"])) : undefined,
    options.filter === "manager" ? eq(schema.timeEntries.closedBy, "manager") : undefined,
    isUuid(options.staff) ? eq(schema.timeEntries.staffId, options.staff) : undefined,
    isUuid(options.home) ? eq(schema.timeEntries.homeId, options.home) : undefined,
    options.from ? gte(schema.timeEntries.clockInAt, zonedTime(options.from, "00:00")) : undefined,
    options.to ? lt(schema.timeEntries.clockInAt, zonedTime(addDays(options.to, 1), "00:00")) : undefined,
  );
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.timeEntries).where(where);
  const pages = Math.max(1, Math.ceil(total / options.per));
  const page = Math.min(Math.max(1, options.page), pages);
  const rows = await entryRows(where, options.per, (page - 1) * options.per);
  return { rows, total, page, pages };
}

/* ---------- The manager's live board ---------- */

export async function liveBoard(now: number, settings: Settings) {
  const since = new Date(now - 16 * 3_600_000);
  const [open, shifts, entriesForShifts, review, corrections, homes] = await Promise.all([
    entryRows(isNull(schema.timeEntries.clockOutAt) as ReturnType<typeof and>, 200),
    db
      .select({ id: schema.shifts.id, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, homeId: schema.shifts.homeId, home: schema.homes.name, staffId: schema.shifts.staffId, staff: staffName, phone: schema.staff.phone, pattern: schema.shiftPatterns.name })
      .from(schema.shifts)
      .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
      .innerJoin(schema.staff, eq(schema.staff.id, schema.shifts.staffId))
      .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
      .where(and(isNotNull(schema.shifts.staffId), ne(schema.shifts.status, "missed"), gte(schema.shifts.endsAt, since), lte(schema.shifts.startsAt, new Date(now))))
      .orderBy(asc(schema.shifts.startsAt)),
    db.select({ shiftId: schema.timeEntries.shiftId, staffId: schema.timeEntries.staffId, homeId: schema.timeEntries.homeId, clockInAt: schema.timeEntries.clockInAt }).from(schema.timeEntries).where(gte(schema.timeEntries.clockInAt, new Date(now - 30 * 3_600_000))),
    entryRows(and(sql`jsonb_array_length(${schema.timeEntries.flags}) > 0`, isNull(schema.timeEntries.reviewedAt), gte(schema.timeEntries.clockInAt, new Date(now - 45 * 86_400_000))), 50),
    db
      .select({ correction: schema.timeCorrections, staff: staffName, home: schema.homes.name })
      .from(schema.timeCorrections)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.timeCorrections.staffId))
      .leftJoin(schema.homes, eq(schema.homes.id, schema.timeCorrections.homeId))
      .where(eq(schema.timeCorrections.status, "pending"))
      .orderBy(asc(schema.timeCorrections.createdAt)),
    db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name)),
  ]);
  const breaks = open.length ? await db.select().from(schema.timeBreaks).where(and(inArray(schema.timeBreaks.entryId, open.map(row => row.id)), isNull(schema.timeBreaks.endAt))) : [];

  // A shift counts as clocked when an entry is linked to it, or the same person clocked in at that home around its start.
  const clocked = (shift: (typeof shifts)[number]) =>
    entriesForShifts.some(
      row => row.shiftId === shift.id || (!row.shiftId && row.staffId === shift.staffId && row.homeId === shift.homeId && Math.abs(row.clockInAt.getTime() - shift.startsAt.getTime()) < 4 * 3_600_000),
    );
  const missing = shifts.filter(shift => !clocked(shift));
  const graceMs = settings.clock_late_grace_minutes * 60_000;
  const noShowMs = settings.clock_no_show_minutes * 60_000;
  const lateNotIn = missing.filter(shift => now - shift.startsAt.getTime() > graceMs && now - shift.startsAt.getTime() <= noShowMs && shift.endsAt.getTime() > now);
  const noShows = missing.filter(shift => now - shift.startsAt.getTime() > noShowMs);
  const pastEnd = open.filter(row => row.shiftEnd && now > row.shiftEnd.getTime() + settings.clock_overstay_minutes * 60_000);
  const forgotten = open.filter(row => (row.shiftEnd ? now > row.shiftEnd.getTime() + settings.clock_forgot_hours * 3_600_000 : now - row.clockInAt.getTime() > 16 * 3_600_000));

  const byHome = homes.map(home => ({
    ...home,
    on: open.filter(row => row.homeId === home.id).map(row => ({ ...row, onBreak: breaks.find(item => item.entryId === row.id) ?? null })),
    expected: shifts.filter(shift => shift.homeId === home.id && shift.endsAt.getTime() > now).length,
  }));
  return { open, byHome, lateNotIn, noShows, pastEnd, forgotten, review, corrections, minimum: settings.shift_coverage_minimum };
}

/* ---------- One entry in full ---------- */

export async function entryDetail(id: string) {
  const [row] = await db
    .select({
      entry: schema.timeEntries,
      staff: staffName,
      staffFirst: schema.staff.firstName,
      home: workPlace,
      homeLatitude: schema.homes.latitude,
      homeLongitude: schema.homes.longitude,
      shiftStart: schema.shifts.startsAt,
      shiftEnd: schema.shifts.endsAt,
      pattern: schema.shiftPatterns.name,
      reviewer: schema.users.name,
    })
    .from(schema.timeEntries)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.timeEntries.staffId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.timeEntries.homeId))
    .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .leftJoin(schema.users, eq(schema.users.id, schema.timeEntries.reviewedBy))
    .where(eq(schema.timeEntries.id, id))
    .limit(1);
  if (!row) return null;
  const [breaks, handover, changes, reads] = await Promise.all([
    db.select().from(schema.timeBreaks).where(eq(schema.timeBreaks.entryId, id)).orderBy(asc(schema.timeBreaks.startAt)),
    db.select().from(schema.handovers).where(eq(schema.handovers.entryId, id)).limit(1),
    db
      .select({ change: schema.timeEntryChanges, by: schema.users.name })
      .from(schema.timeEntryChanges)
      .leftJoin(schema.users, eq(schema.users.id, schema.timeEntryChanges.userId))
      .where(eq(schema.timeEntryChanges.entryId, id))
      .orderBy(asc(schema.timeEntryChanges.createdAt)),
    db
      .select({ handoverId: schema.handoverReads.handoverId, readAt: schema.handoverReads.readAt, remark: schema.handoverReads.remark, writer: staffName, note: schema.handovers.note })
      .from(schema.handoverReads)
      .innerJoin(schema.handovers, eq(schema.handovers.id, schema.handoverReads.handoverId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.handovers.staffId))
      .where(eq(schema.handoverReads.entryId, id)),
  ]);
  return { ...row, breaks, handover: handover[0] ?? null, changes, reads };
}

/* ---------- Handover log ---------- */

export async function handoverLog(options: { home: string; page: number; per: number }) {
  const where = isUuid(options.home) ? eq(schema.handovers.homeId, options.home) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.handovers).where(where);
  const pages = Math.max(1, Math.ceil(total / options.per));
  const page = Math.min(Math.max(1, options.page), pages);
  const rows = await db
    .select({
      handover: schema.handovers,
      home: schema.homes.name,
      staff: staffName,
      reads: sql<number>`(select count(*) from handover_reads r where r.handover_id = ${schema.handovers.id})::int`,
      // Who took over and acknowledged it, with any remark, in the order they did.
      acks: sql<{ staff: string; remark: string; readAt: string }[]>`(select coalesce(json_agg(json_build_object('staff', s.first_name || ' ' || s.last_name, 'remark', r.remark, 'readAt', r.read_at) order by r.read_at), '[]'::json) from handover_reads r join staff s on s.id = r.staff_id where r.handover_id = ${schema.handovers.id})`,
    })
    .from(schema.handovers)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.handovers.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.handovers.staffId))
    .where(where)
    .orderBy(desc(schema.handovers.createdAt))
    .limit(options.per)
    .offset((page - 1) * options.per);
  return { rows, total, page, pages };
}
