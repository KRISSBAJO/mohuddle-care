import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { addDays, dateKey, weekStart, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { notesOwed } from "@/server/queries/notes-owed";

const hoursOf = (shift: { startsAt: Date; endsAt: Date }) => (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;

/* Shifts from some days back to some days ahead, with their home and pattern. */
export function staffShifts(id: string, from: Date, to: Date) {
  return db
    .select({
      id: schema.shifts.id,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
      kind: schema.shifts.kind,
      status: schema.shifts.status,
      homeId: schema.shifts.homeId,
      home: schema.homes.name,
      pattern: schema.shiftPatterns.name,
    })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(and(eq(schema.shifts.staffId, id), gte(schema.shifts.startsAt, from), lt(schema.shifts.startsAt, to)))
    .orderBy(asc(schema.shifts.startsAt));
}

/* The figures across the top of a staff member's page, and what the overview tab shows. */
export async function staffSummary(id: string) {
  const today = dateKey();
  const monday = weekStart(today);
  const [week, owed, tasks, notes] = await Promise.all([
    staffShifts(id, zonedTime(monday, "00:00"), zonedTime(addDays(monday, 7), "00:00")),
    notesOwed({ from: zonedTime(addDays(today, -13), "00:00"), staffId: id }),
    db
      .select({ id: schema.tasks.id, title: schema.tasks.title, dueAt: schema.tasks.dueAt, priority: schema.tasks.priority, person: sql<string | null>`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}` })
      .from(schema.tasks)
      .leftJoin(schema.individuals, eq(schema.individuals.id, schema.tasks.individualId))
      .where(and(eq(schema.tasks.assignedTo, id), eq(schema.tasks.status, "open")))
      .orderBy(sql`${schema.tasks.dueAt} asc nulls last`)
      .limit(6),
    db
      .select({ n: sql<number>`count(*)::int`, last: sql<string | null>`max(${schema.dailyLogs.logDate})` })
      .from(schema.dailyLogs)
      .where(and(eq(schema.dailyLogs.staffId, id), gte(schema.dailyLogs.logDate, addDays(today, -29)))),
  ]);
  const worked = week.filter(shift => shift.status !== "missed");
  const missing = owed.flatMap(shift => shift.people.filter(person => !person.logId).map(person => ({ ...person, shift })));
  return {
    weekHours: worked.reduce((sum, shift) => sum + hoursOf(shift), 0),
    weekShifts: worked,
    owed,
    notesMissing: missing.length,
    notesOverdue: missing.filter(item => item.shift.state === "overdue").length,
    tasks,
    notes30: notes[0]?.n ?? 0,
    lastNote: notes[0]?.last ?? null,
  };
}

/* Notes this person wrote, newest first, for the Daily notes tab. */
export function notesWrittenBy(id: string, limit = 30) {
  return db
    .select({
      id: schema.dailyLogs.id,
      logDate: schema.dailyLogs.logDate,
      mood: schema.dailyLogs.mood,
      shiftName: schema.dailyLogs.shiftName,
      createdAt: schema.dailyLogs.createdAt,
      signedAt: schema.dailyLogs.signedAt,
      individualId: schema.individuals.id,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
    })
    .from(schema.dailyLogs)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
    .where(eq(schema.dailyLogs.staffId, id))
    .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt))
    .limit(limit);
}

/* Weeks of shifts around today, for the Schedule tab: each week with its hours. */
export async function staffWeeks(id: string, weeksBack: number, weeksAhead: number) {
  const monday = weekStart(dateKey());
  const from = addDays(monday, -7 * weeksBack);
  const to = addDays(monday, 7 * (weeksAhead + 1));
  const shifts = await staffShifts(id, zonedTime(from, "00:00"), zonedTime(to, "00:00"));
  const weeks: { start: string; shifts: typeof shifts; hours: number }[] = [];
  for (let start = from; start < to; start = addDays(start, 7)) {
    const inWeek = shifts.filter(shift => dateKey(shift.startsAt) >= start && dateKey(shift.startsAt) < addDays(start, 7));
    weeks.push({ start, shifts: inWeek, hours: inWeek.filter(shift => shift.status !== "missed").reduce((sum, shift) => sum + hoursOf(shift), 0) });
  }
  return weeks.reverse();
}

/* Homes they have worked at in the last 90 days, most shifts first. */
export async function homesWorked(id: string) {
  return db
    .select({ homeId: schema.shifts.homeId, home: schema.homes.name, n: sql<number>`count(*)::int` })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .where(and(eq(schema.shifts.staffId, id), gte(schema.shifts.startsAt, zonedTime(addDays(dateKey(), -89), "00:00")), ne(schema.shifts.status, "missed"), inArray(schema.shifts.status, ["scheduled", "confirmed", "completed"])))
    .groupBy(schema.shifts.homeId, schema.homes.name)
    .orderBy(desc(sql`count(*)`));
}
