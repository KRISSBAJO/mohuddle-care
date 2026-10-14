import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, max, or, sql, type SQL } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { coverage, dayList, isConcern, paginate, percent, type Coverage } from "@/lib/log-browser";
import { db, schema } from "@/server/db";
import { goalsForLogs } from "@/server/queries/logs";
import { notesOwed, type OwedShift } from "@/server/queries/notes-owed";
import { personDoses } from "@/server/queries/person";

const staffName = sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`;
const centralDay = (column: SQL | typeof schema.incidents.occurredAt | typeof schema.appointments.scheduledAt) => sql<string>`to_char(${column} at time zone 'America/Chicago', 'YYYY-MM-DD')`;
const concernSql = sql<number>`count(*) filter (where ${schema.dailyLogs.mood} in ('low', 'distressed') or ${schema.dailyLogs.seizure} is true or ${schema.dailyLogs.behaviourOccurred} is true)`;
export const isUuid = (value: string | undefined): value is string => Boolean(value && /^[0-9a-f-]{36}$/.test(value));

export type DayCell = { day: string; expected: number; matched: number; notes: number; open: boolean; concern: boolean; state: Coverage };

/* Shift-by-shift coverage for one home over some days: for each person and day, notes owed and notes written. */
function coverageMap(shifts: OwedShift[]) {
  const map = new Map<string, { expected: number; matched: number; open: boolean; owedBy: { staffId: string; staff: string; pattern: string; state: OwedShift["state"] }[] }>();
  for (const shift of shifts) {
    for (const person of shift.people) {
      const key = `${person.id}|${shift.day}`;
      const entry = map.get(key) ?? { expected: 0, matched: 0, open: false, owedBy: [] };
      entry.expected += 1;
      if (person.logId) entry.matched += 1;
      else {
        if (shift.state !== "overdue") entry.open = true;
        entry.owedBy.push({ staffId: shift.staffId, staff: shift.staff, pattern: shift.pattern, state: shift.state });
      }
      map.set(key, entry);
    }
  }
  return map;
}

function cell(day: string, cover: ReturnType<typeof coverageMap> extends Map<string, infer V> ? V | undefined : never, notes: number, concern: boolean): DayCell {
  const expected = cover?.expected ?? 0;
  const matched = cover?.matched ?? 0;
  return { day, expected, matched, notes, open: cover?.open ?? false, concern, state: coverage(expected, expected ? matched : notes, cover?.open ?? false) };
}

/* ---------- Level 1: every home ---------- */

export type HomeSummary = {
  id: string | null;
  name: string;
  type: string | null;
  residents: number;
  week: { day: string; expected: number; matched: number; notes: number }[];
  today: { expected: number; matched: number; notes: number };
  weekPercent: number | null;
  weekNotes: number;
  overdue: number;
  concerns: number;
  latest: Date | null;
};

/* The last seven days for each home: notes owed and written, overdue notes and notes that need a second look. */
export async function homesOverview(): Promise<HomeSummary[]> {
  const today = dateKey();
  const from = addDays(today, -6);
  const days = dayList(from, today);
  const [homes, people, notes, owed] = await Promise.all([
    db.select({ id: schema.homes.id, name: schema.homes.name, type: schema.homes.type }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name)),
    db.select({ homeId: schema.individuals.homeId, n: count() }).from(schema.individuals).where(eq(schema.individuals.active, true)).groupBy(schema.individuals.homeId),
    db
      .select({ homeId: schema.individuals.homeId, day: schema.dailyLogs.logDate, n: count(), concerns: concernSql, latest: max(schema.dailyLogs.createdAt) })
      .from(schema.dailyLogs)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
      .where(gte(schema.dailyLogs.logDate, from))
      .groupBy(schema.individuals.homeId, schema.dailyLogs.logDate),
    notesOwed({ from: zonedTime(from, "00:00") }),
  ]);

  const summarise = (id: string | null, name: string, type: string | null): HomeSummary => {
    const shifts = owed.filter(shift => shift.homeId === id);
    const week = days.map(day => {
      const onDay = shifts.filter(shift => shift.day === day);
      return {
        day,
        expected: onDay.reduce((sum, shift) => sum + shift.people.length, 0),
        matched: onDay.reduce((sum, shift) => sum + shift.people.filter(person => person.logId).length, 0),
        notes: notes.filter(row => row.homeId === id && row.day === day).reduce((sum, row) => sum + row.n, 0),
      };
    });
    const expected = week.reduce((sum, d) => sum + d.expected, 0);
    const matched = week.reduce((sum, d) => sum + d.matched, 0);
    const mine = notes.filter(row => row.homeId === id);
    const latest = mine.reduce<Date | null>((best, row) => (row.latest && (!best || new Date(row.latest) > best) ? new Date(row.latest) : best), null);
    return {
      id,
      name,
      type,
      residents: people.find(row => row.homeId === id)?.n ?? 0,
      week,
      today: week[week.length - 1],
      weekPercent: percent(matched, expected),
      weekNotes: mine.reduce((sum, row) => sum + row.n, 0),
      overdue: shifts.filter(shift => shift.state === "overdue").reduce((sum, shift) => sum + shift.people.filter(person => !person.logId).length, 0),
      concerns: mine.reduce((sum, row) => sum + Number(row.concerns), 0),
      latest,
    };
  };

  const list = homes.map(home => summarise(home.id, home.name, home.type));
  const outside = summarise(null, "Not in one of our homes", null);
  if (outside.residents || outside.weekNotes) list.push(outside);
  return list;
}

/* ---------- Level 2: the people in one home ---------- */

export const peopleSorts = { name: "Name", last: "Last note", gaps: "Gaps", concerns: "Concerns", written: "Notes written" } as const;
export type PeopleSort = keyof typeof peopleSorts;
export const windowSizes = [7, 14, 30] as const;

export type PersonStrip = {
  id: string;
  first: string;
  last: string;
  active: boolean;
  cells: DayCell[];
  written: number;
  expected: number;
  matched: number;
  gaps: number;
  concerns: number;
  lastNote: string | null;
  lastMood: string | null;
};

export async function homePeople(homeId: string | null, options: { end: string; days: number; q: string; sort: PeopleSort; dir: "asc" | "desc"; status: "current" | "all" }) {
  const from = addDays(options.end, -(options.days - 1));
  const days = dayList(from, options.end);
  const people = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, active: schema.individuals.active })
    .from(schema.individuals)
    .where(
      and(
        homeId ? eq(schema.individuals.homeId, homeId) : isNull(schema.individuals.homeId),
        options.status === "current" ? eq(schema.individuals.active, true) : undefined,
        options.q ? or(ilike(schema.individuals.firstName, `%${options.q}%`), ilike(schema.individuals.lastName, `%${options.q}%`), sql`(${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}) ilike ${`%${options.q}%`}`) : undefined,
      ),
    )
    .orderBy(asc(schema.individuals.firstName), asc(schema.individuals.lastName));
  const ids = people.map(person => person.id);
  if (!ids.length) return { rows: [] as PersonStrip[], days, from };

  const [notes, lasts, owed] = await Promise.all([
    db
      .select({ individualId: schema.dailyLogs.individualId, day: schema.dailyLogs.logDate, mood: schema.dailyLogs.mood, seizure: schema.dailyLogs.seizure, behaviourOccurred: schema.dailyLogs.behaviourOccurred })
      .from(schema.dailyLogs)
      .where(and(inArray(schema.dailyLogs.individualId, ids), gte(schema.dailyLogs.logDate, from), lte(schema.dailyLogs.logDate, options.end)))
      .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt)),
    db.select({ individualId: schema.dailyLogs.individualId, last: max(schema.dailyLogs.logDate) }).from(schema.dailyLogs).where(inArray(schema.dailyLogs.individualId, ids)).groupBy(schema.dailyLogs.individualId),
    homeId ? notesOwed({ from: zonedTime(from, "00:00"), to: zonedTime(addDays(options.end, 1), "00:00"), homeId }) : Promise.resolve([] as OwedShift[]),
  ]);
  const cover = coverageMap(owed);

  const rows = people.map((person): PersonStrip => {
    const mine = notes.filter(note => note.individualId === person.id);
    const cells = days.map(day => {
      const onDay = mine.filter(note => note.day === day);
      return cell(day, cover.get(`${person.id}|${day}`), onDay.length, onDay.some(isConcern));
    });
    return {
      ...person,
      cells,
      written: mine.length,
      expected: cells.reduce((sum, c) => sum + c.expected, 0),
      matched: cells.reduce((sum, c) => sum + c.matched, 0),
      gaps: cells.filter(c => c.state === "missing" || c.state === "partial").length,
      concerns: mine.filter(isConcern).length,
      lastNote: lasts.find(row => row.individualId === person.id)?.last ?? null,
      lastMood: mine[0]?.mood ?? null,
    };
  });

  const compare: Record<PeopleSort, (a: PersonStrip, b: PersonStrip) => number> = {
    name: (a, b) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`),
    last: (a, b) => (a.lastNote ?? "").localeCompare(b.lastNote ?? ""),
    gaps: (a, b) => a.gaps - b.gaps,
    concerns: (a, b) => a.concerns - b.concerns,
    written: (a, b) => a.written - b.written,
  };
  rows.sort((a, b) => compare[options.sort](a, b) * (options.dir === "asc" ? 1 : -1) || compare.name(a, b));
  return { rows, days, from };
}

/* ---------- Level 3: one person, day by day ---------- */

export const dayFilters = { all: "Every day", gaps: "Missing notes", concern: "Needs a look", written: "Days with notes" } as const;
export type DayFilter = keyof typeof dayFilters;
export const dayPageSizes = [14, 31, 62] as const;

export type DayNote = { id: string; mood: string; shiftName: string; shift: string | null; staff: string | null; createdAt: Date; signedAt: Date | null; summary: string; concern: boolean; late: boolean };
export type DayRow = DayCell & { notes: number; list: DayNote[]; incidents: number; appointments: number; owedBy: { staffId: string; staff: string; pattern: string; state: OwedShift["state"] }[] };

export async function personDays(person: { id: string; homeId: string | null; admittedAt: string | null }, options: { from: string; to: string; filter: DayFilter; dir: "asc" | "desc"; page: number; per: number }) {
  const start = person.admittedAt && person.admittedAt > options.from ? person.admittedAt : options.from;
  const days = dayList(start, options.to);
  const rangeStart = zonedTime(start, "00:00");
  const rangeEnd = zonedTime(addDays(options.to, 1), "00:00");
  const [notes, owed, incidents, appointments] = await Promise.all([
    db
      .select({
        id: schema.dailyLogs.id,
        day: schema.dailyLogs.logDate,
        mood: schema.dailyLogs.mood,
        seizure: schema.dailyLogs.seizure,
        behaviourOccurred: schema.dailyLogs.behaviourOccurred,
        shiftName: schema.dailyLogs.shiftName,
        shift: schema.dailyLogs.shift,
        createdAt: schema.dailyLogs.createdAt,
        signedAt: schema.dailyLogs.signedAt,
        summary: sql<string>`left(coalesce(nullif(${schema.dailyLogs.notes}, ''), ${schema.dailyLogs.activities}), 220)`,
        staff: staffName,
      })
      .from(schema.dailyLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
      .where(and(eq(schema.dailyLogs.individualId, person.id), gte(schema.dailyLogs.logDate, start), lte(schema.dailyLogs.logDate, options.to)))
      .orderBy(asc(schema.dailyLogs.createdAt)),
    person.homeId ? notesOwed({ from: rangeStart, to: rangeEnd, homeId: person.homeId }) : Promise.resolve([] as OwedShift[]),
    db
      .select({ day: centralDay(schema.incidents.occurredAt), n: count() })
      .from(schema.incidents)
      .where(and(eq(schema.incidents.individualId, person.id), gte(schema.incidents.occurredAt, rangeStart), lt(schema.incidents.occurredAt, rangeEnd)))
      .groupBy(centralDay(schema.incidents.occurredAt)),
    db
      .select({ day: centralDay(schema.appointments.scheduledAt), n: count() })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.individualId, person.id), gte(schema.appointments.scheduledAt, rangeStart), lt(schema.appointments.scheduledAt, rangeEnd)))
      .groupBy(centralDay(schema.appointments.scheduledAt)),
  ]);
  const cover = coverageMap(owed);

  const all = days.map((day): DayRow => {
    const list = notes
      .filter(note => note.day === day)
      .map(note => ({ id: note.id, mood: note.mood, shiftName: note.shiftName, shift: note.shift, staff: note.staff, createdAt: note.createdAt, signedAt: note.signedAt, summary: note.summary, concern: isConcern(note), late: dateKey(note.createdAt) > day }));
    const found = cover.get(`${person.id}|${day}`);
    return {
      ...cell(day, found, list.length, list.some(note => note.concern)),
      list,
      incidents: incidents.find(row => row.day === day)?.n ?? 0,
      appointments: appointments.find(row => row.day === day)?.n ?? 0,
      owedBy: found?.owedBy ?? [],
    };
  });
  const totals = {
    days: all.length,
    withNotes: all.filter(row => row.notes > 0).length,
    notes: notes.length,
    expected: all.reduce((sum, row) => sum + row.expected, 0),
    matched: all.reduce((sum, row) => sum + row.matched, 0),
    gaps: all.filter(row => row.state === "missing" || row.state === "partial").length,
    concerns: all.filter(row => row.concern).length,
  };
  const filtered = all.filter(row =>
    options.filter === "gaps" ? row.state === "missing" || row.state === "partial" : options.filter === "concern" ? row.concern || row.incidents > 0 : options.filter === "written" ? row.notes > 0 : true,
  );
  if (options.dir === "desc") filtered.reverse();
  return { ...paginate(filtered, options.page, options.per), totals, start };
}

/* ---------- Level 4: one person, one day ---------- */

export async function personDay(person: { id: string; homeId: string | null }, day: string) {
  const start = zonedTime(day, "00:00");
  const end = zonedTime(addDays(day, 1), "00:00");
  const [logs, owed, doses, incidents, appointments] = await Promise.all([
    db
      .select({ log: schema.dailyLogs, staff: staffName })
      .from(schema.dailyLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
      .where(and(eq(schema.dailyLogs.individualId, person.id), eq(schema.dailyLogs.logDate, day)))
      .orderBy(asc(schema.dailyLogs.timeIn), asc(schema.dailyLogs.createdAt)),
    person.homeId ? notesOwed({ from: start, to: end, homeId: person.homeId }) : Promise.resolve([] as OwedShift[]),
    personDoses(person.id, day),
    db
      .select({ id: schema.incidents.id, occurredAt: schema.incidents.occurredAt, category: schema.incidents.category, severity: schema.incidents.severity, status: schema.incidents.status, description: schema.incidents.description })
      .from(schema.incidents)
      .where(and(eq(schema.incidents.individualId, person.id), gte(schema.incidents.occurredAt, start), lt(schema.incidents.occurredAt, end)))
      .orderBy(asc(schema.incidents.occurredAt)),
    db
      .select({ id: schema.appointments.id, scheduledAt: schema.appointments.scheduledAt, type: schema.appointments.type, provider: schema.appointments.provider, status: schema.appointments.status })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.individualId, person.id), gte(schema.appointments.scheduledAt, start), lt(schema.appointments.scheduledAt, end)))
      .orderBy(asc(schema.appointments.scheduledAt)),
  ]);
  const goals = await goalsForLogs(logs.map(row => row.log.id));
  const shifts = owed
    .filter(shift => shift.people.some(p => p.id === person.id))
    .map(shift => ({ ...shift, logId: shift.people.find(p => p.id === person.id)?.logId ?? null }));
  return { logs, goals, shifts, doses, incidents, appointments };
}

/* ---------- Every note, as one searchable list ---------- */

export const noteSorts = { date: "Date", person: "Person", home: "Home", staff: "Written by", mood: "Mood" } as const;
export type NoteSort = keyof typeof noteSorts;
export const notePageSizes = [25, 50, 100] as const;
export const moodFilters = { any: "Any mood", concern: "Needs a look", great: "Great", good: "Good", okay: "Okay", low: "Low", distressed: "Distressed" } as const;
export type MoodFilter = keyof typeof moodFilters;

export async function allNotes(options: { q: string; home: string; mood: MoodFilter; from: string; to: string; sort: NoteSort; dir: "asc" | "desc"; page: number; per: number }) {
  const where = and(
    options.q
      ? or(
          sql`(${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}) ilike ${`%${options.q}%`}`,
          sql`(${schema.staff.firstName} || ' ' || ${schema.staff.lastName}) ilike ${`%${options.q}%`}`,
          ilike(schema.dailyLogs.notes, `%${options.q}%`),
        )
      : undefined,
    options.home === "none" ? isNull(schema.individuals.homeId) : isUuid(options.home) ? eq(schema.individuals.homeId, options.home) : undefined,
    options.mood === "any"
      ? undefined
      : options.mood === "concern"
        ? or(inArray(schema.dailyLogs.mood, ["low", "distressed"]), eq(schema.dailyLogs.seizure, true), eq(schema.dailyLogs.behaviourOccurred, true))
        : eq(schema.dailyLogs.mood, options.mood),
    options.from ? gte(schema.dailyLogs.logDate, options.from) : undefined,
    options.to ? lte(schema.dailyLogs.logDate, options.to) : undefined,
  );
  const base = () =>
    db
      .select({
        id: schema.dailyLogs.id,
        logDate: schema.dailyLogs.logDate,
        mood: schema.dailyLogs.mood,
        seizure: schema.dailyLogs.seizure,
        behaviourOccurred: schema.dailyLogs.behaviourOccurred,
        shiftName: schema.dailyLogs.shiftName,
        shift: schema.dailyLogs.shift,
        createdAt: schema.dailyLogs.createdAt,
        signedAt: schema.dailyLogs.signedAt,
        summary: sql<string>`left(coalesce(nullif(${schema.dailyLogs.notes}, ''), ${schema.dailyLogs.activities}), 160)`,
        individualId: schema.individuals.id,
        first: schema.individuals.firstName,
        last: schema.individuals.lastName,
        homeId: schema.homes.id,
        home: schema.homes.name,
        staff: staffName,
      })
      .from(schema.dailyLogs)
      .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
      .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId));
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.dailyLogs)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
    .where(where);
  const pages = Math.max(1, Math.ceil(total / options.per));
  const page = Math.min(Math.max(1, options.page), pages);
  const direction = options.dir === "asc" ? asc : desc;
  const order = {
    date: [direction(schema.dailyLogs.logDate), direction(schema.dailyLogs.createdAt)],
    person: [direction(schema.individuals.firstName), direction(schema.individuals.lastName), desc(schema.dailyLogs.logDate)],
    home: [direction(schema.homes.name), desc(schema.dailyLogs.logDate)],
    staff: [direction(schema.staff.firstName), direction(schema.staff.lastName), desc(schema.dailyLogs.logDate)],
    mood: [direction(sql`array_position(array['distressed','low','okay','good','great']::text[], ${schema.dailyLogs.mood}::text)`), desc(schema.dailyLogs.logDate)],
  }[options.sort];
  const rows = await base()
    .where(where)
    .orderBy(...order)
    .limit(options.per)
    .offset((page - 1) * options.per);
  return { rows, total, page, pages };
}
