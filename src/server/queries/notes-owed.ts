import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { dateKey } from "@/lib/format";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

export type NoteState = "in_progress" | "due" | "overdue";

export type OwedShift = {
  shiftId: string;
  homeId: string;
  home: string;
  staffId: string;
  staff: string;
  pattern: string;
  kind: "day" | "evening" | "overnight";
  startsAt: Date;
  endsAt: Date;
  day: string;
  state: NoteState;
  dueBy: Date;
  people: { id: string; name: string; logId: string | null }[];
};

/*
 * Every staff member who works a shift owes a daily note for each person living at that home.
 * A note counts when it is linked to the shift, or (for notes written before shifts were linked)
 * when the same staff member wrote it for that person on that day.
 */
export async function notesOwed(options: { from: Date; to?: Date; staffId?: string; homeId?: string }) {
  const settings = await getSettings();
  const now = Date.now();
  const graceMs = settings.shift_note_grace_hours * 3_600_000;
  const shifts = await db
    .select({
      id: schema.shifts.id,
      homeId: schema.shifts.homeId,
      home: schema.homes.name,
      staffId: schema.shifts.staffId,
      staff: sql<string>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
      pattern: schema.shiftPatterns.name,
      kind: schema.shifts.kind,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
    })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .innerJoin(schema.staff, eq(schema.staff.id, schema.shifts.staffId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(
      and(
        isNotNull(schema.shifts.staffId),
        ne(schema.shifts.status, "missed"),
        gte(schema.shifts.startsAt, options.from),
        lt(schema.shifts.startsAt, options.to ?? new Date(now)),
        lt(schema.shifts.startsAt, new Date(now)),
        options.staffId ? eq(schema.shifts.staffId, options.staffId) : undefined,
        options.homeId ? eq(schema.shifts.homeId, options.homeId) : undefined,
      ),
    )
    .orderBy(asc(schema.shifts.startsAt), asc(schema.homes.name));
  if (!shifts.length) return [];

  const homeIds = [...new Set(shifts.map(shift => shift.homeId))];
  const residents = await db
    .select({ id: schema.individuals.id, homeId: schema.individuals.homeId, first: schema.individuals.firstName, last: schema.individuals.lastName, admittedAt: schema.individuals.admittedAt })
    .from(schema.individuals)
    .where(and(eq(schema.individuals.active, true), inArray(schema.individuals.homeId, homeIds)))
    .orderBy(asc(schema.individuals.firstName));
  const days = [...new Set(shifts.map(shift => dateKey(shift.startsAt)))];
  const staffIds = [...new Set(shifts.map(shift => shift.staffId!))];
  const logs = await db
    .select({ id: schema.dailyLogs.id, individualId: schema.dailyLogs.individualId, staffId: schema.dailyLogs.staffId, shiftId: schema.dailyLogs.shiftId, logDate: schema.dailyLogs.logDate })
    .from(schema.dailyLogs)
    .where(or(inArray(schema.dailyLogs.shiftId, shifts.map(shift => shift.id)), and(inArray(schema.dailyLogs.staffId, staffIds), inArray(schema.dailyLogs.logDate, days))));

  return shifts.map((shift): OwedShift => {
    const day = dateKey(shift.startsAt);
    const dueBy = new Date(shift.endsAt.getTime() + graceMs);
    const state: NoteState = shift.endsAt.getTime() > now ? "in_progress" : now > dueBy.getTime() ? "overdue" : "due";
    const people = residents
      .filter(person => person.homeId === shift.homeId && (!person.admittedAt || person.admittedAt <= day))
      .map(person => {
        const log = logs.find(row => row.individualId === person.id && (row.shiftId === shift.id || (!row.shiftId && row.staffId === shift.staffId && row.logDate === day)));
        return { id: person.id, name: `${person.first} ${person.last}`, logId: log?.id ?? null };
      });
    return {
      shiftId: shift.id,
      homeId: shift.homeId,
      home: shift.home,
      staffId: shift.staffId!,
      staff: shift.staff,
      pattern: shift.pattern ?? "Custom shift",
      kind: shift.kind,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      day,
      state,
      dueBy,
      people,
    };
  });
}

/* Totals for a list of owed shifts: notes expected, written and still missing past their deadline. */
export function owedTotals(list: OwedShift[]) {
  let expected = 0;
  let written = 0;
  let overdue = 0;
  for (const shift of list) {
    expected += shift.people.length;
    const done = shift.people.filter(person => person.logId).length;
    written += done;
    if (shift.state === "overdue") overdue += shift.people.length - done;
  }
  return { expected, written, missing: expected - written, overdue };
}
