import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { parseHolidays, periodFor, timesheet, workweekStart, type Period, type PeriodType, type Punch, type SheetRules } from "@/lib/payroll";
import { db, schema } from "@/server/db";
import { paidTimeOffMinutes } from "@/server/queries/pay";
import type { Settings } from "@/server/settings";

export type PeriodRow = typeof schema.payPeriods.$inferSelect;
export type SheetRow = typeof schema.timesheets.$inferSelect;
export const isDay = (value: string | undefined | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export function sheetRules(settings: Settings): SheetRules {
  return { rounding: settings.time_rounding_minutes, overtimeAfterHours: settings.overtime_after_hours, weekStartsOn: settings.workweek_starts_on, holidays: parseHolidays(settings.paid_holidays), payFromShiftStart: settings.clock_pay_early_from === "shift" };
}

/* The pay period for a day under the current settings, unless a stored period already covers it. */
export async function periodOn(day: string, settings: Settings): Promise<Period & { row: PeriodRow | null }> {
  const [stored] = await db.select().from(schema.payPeriods).where(and(lte(schema.payPeriods.startDate, day), gte(schema.payPeriods.endDate, day))).orderBy(desc(schema.payPeriods.startDate)).limit(1);
  if (stored) return { start: stored.startDate, end: stored.endDate, row: stored };
  const period = periodFor(day, settings.pay_period_type as PeriodType, settings.pay_period_anchor);
  // After a change of pay period type, a new period never overlaps one already stored: it starts after
  // the last stored period before the day, and ends before the next one after it.
  const [before] = await db.select({ end: schema.payPeriods.endDate }).from(schema.payPeriods).where(lt(schema.payPeriods.endDate, day)).orderBy(desc(schema.payPeriods.endDate)).limit(1);
  const [after] = await db.select({ start: schema.payPeriods.startDate }).from(schema.payPeriods).where(gte(schema.payPeriods.startDate, day)).orderBy(asc(schema.payPeriods.startDate)).limit(1);
  const start = before && period.start <= before.end ? addDays(before.end, 1) : period.start;
  const end = after && period.end >= after.start ? addDays(after.start, -1) : period.end;
  return { start, end, row: null };
}

/* The stored row for a period, created the first time anyone needs it. */
export async function ensurePeriod(period: Period): Promise<PeriodRow> {
  await db.insert(schema.payPeriods).values({ startDate: period.start, endDate: period.end }).onConflictDoNothing();
  const [row] = await db.select().from(schema.payPeriods).where(eq(schema.payPeriods.startDate, period.start)).limit(1);
  return row;
}

/* Whether a day falls in a locked pay period: punches there cannot change, only be adjusted later. */
export async function lockedOn(day: string) {
  const [row] = await db
    .select({ id: schema.payPeriods.id, start: schema.payPeriods.startDate, end: schema.payPeriods.endDate })
    .from(schema.payPeriods)
    .where(and(eq(schema.payPeriods.status, "locked"), lte(schema.payPeriods.startDate, day), gte(schema.payPeriods.endDate, day)))
    .limit(1);
  return row ?? null;
}

/* Every punch in the workweeks that touch a period, so overtime is counted right at both ends. */
async function punchesAround(period: Period, weekStartsOn: number, staffIds?: string[]) {
  const from = zonedTime(workweekStart(period.start, weekStartsOn), "00:00");
  const to = zonedTime(addDays(workweekStart(period.end, weekStartsOn), 7), "00:00");
  const rows = await db
    .select({
      id: schema.timeEntries.id,
      staffId: schema.timeEntries.staffId,
      clockInAt: schema.timeEntries.clockInAt,
      clockOutAt: schema.timeEntries.clockOutAt,
      homeId: schema.timeEntries.homeId,
      home: schema.homes.name,
      shiftStart: schema.shifts.startsAt,
      flags: schema.timeEntries.flags,
      reviewedAt: schema.timeEntries.reviewedAt,
      mealMinutes: sql<number>`coalesce((select sum(extract(epoch from (coalesce(b.end_at, now()) - b.start_at)) / 60) from time_breaks b where b.entry_id = ${schema.timeEntries.id} and b.kind = 'meal'), 0)::int`,
    })
    .from(schema.timeEntries)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.timeEntries.homeId))
    .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
    .where(and(gte(schema.timeEntries.clockInAt, from), lt(schema.timeEntries.clockInAt, to), staffIds ? inArray(schema.timeEntries.staffId, staffIds) : undefined))
    .orderBy(asc(schema.timeEntries.clockInAt));
  return rows;
}

type Around = Awaited<ReturnType<typeof punchesAround>>[number];
const asPunch = (row: Around): Punch => ({ id: row.id, clockInAt: row.clockInAt, clockOutAt: row.clockOutAt, mealMinutes: row.mealMinutes, homeId: row.homeId, home: row.home, shiftStart: row.shiftStart });

/* One person's timesheet for a period: lines, totals, adjustments and where it stands. */
export async function sheetFor(staffId: string, period: Period, settings: Settings) {
  const row = await ensurePeriod(period);
  const [punches, adjustments, [sheet], [member]] = await Promise.all([
    punchesAround(period, settings.workweek_starts_on, [staffId]),
    db
      .select({ adjustment: schema.timeAdjustments, by: schema.users.name })
      .from(schema.timeAdjustments)
      .leftJoin(schema.users, eq(schema.users.id, schema.timeAdjustments.createdBy))
      .where(and(eq(schema.timeAdjustments.periodId, row.id), eq(schema.timeAdjustments.staffId, staffId)))
      .orderBy(asc(schema.timeAdjustments.createdAt)),
    db.select().from(schema.timesheets).where(and(eq(schema.timesheets.periodId, row.id), eq(schema.timesheets.staffId, staffId))).limit(1),
    db.select({ first: schema.staff.firstName, last: schema.staff.lastName, employeeNumber: schema.staff.employeeNumber, email: schema.staff.email }).from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1),
  ]);
  const computed = timesheet(punches.map(asPunch), period, sheetRules(settings), adjustments.map(item => ({ minutes: item.adjustment.minutes, overtime: item.adjustment.overtime })));
  const timeOff = (await paidTimeOffMinutes(period, [staffId])).get(staffId) ?? 0;
  const result = { ...computed, totals: { ...computed.totals, timeOff, paid: computed.totals.total + timeOff } };
  const inPeriod = punches.filter(item => dateKey(item.clockInAt) >= period.start && dateKey(item.clockInAt) <= period.end);
  return {
    period: row,
    member: member ?? null,
    sheet: sheet ?? null,
    ...result,
    flags: Object.fromEntries(inPeriod.map(item => [item.id, { flags: item.flags, reviewed: Boolean(item.reviewedAt) }])),
    unreviewed: inPeriod.filter(item => item.flags.length && !item.reviewedAt).length,
    adjustments,
  };
}

export type StaffSheet = Awaited<ReturnType<typeof sheetFor>>;

/* Everyone with time in a period, with their totals and where their timesheet stands. */
export async function periodOverview(period: Period, settings: Settings) {
  const row = await ensurePeriod(period);
  const [punches, sheets, adjustments] = await Promise.all([
    punchesAround(period, settings.workweek_starts_on),
    db.select().from(schema.timesheets).where(eq(schema.timesheets.periodId, row.id)),
    db.select().from(schema.timeAdjustments).where(eq(schema.timeAdjustments.periodId, row.id)),
  ]);
  const inPeriod = (item: Around) => dateKey(item.clockInAt) >= period.start && dateKey(item.clockInAt) <= period.end;
  const timeOff = await paidTimeOffMinutes(period);
  const staffIds = [...new Set([...punches.filter(inPeriod).map(item => item.staffId), ...sheets.map(item => item.staffId), ...adjustments.map(item => item.staffId), ...timeOff.keys()])];
  const people = staffIds.length
    ? await db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName, employeeNumber: schema.staff.employeeNumber, email: schema.staff.email }).from(schema.staff).where(inArray(schema.staff.id, staffIds))
    : [];
  const rules = sheetRules(settings);
  const rows = people
    .map(person => {
      const mine = punches.filter(item => item.staffId === person.id);
      const result = timesheet(mine.map(asPunch), period, rules, adjustments.filter(item => item.staffId === person.id).map(item => ({ minutes: item.minutes, overtime: item.overtime })));
      return {
        ...person,
        totals: { ...result.totals, timeOff: timeOff.get(person.id) ?? 0, paid: result.totals.total + (timeOff.get(person.id) ?? 0) },
        sheet: sheets.find(item => item.staffId === person.id) ?? null,
        unreviewed: mine.filter(item => inPeriod(item) && item.flags.length && !item.reviewedAt).length,
      };
    })
    .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`));
  const sum = (pick: (totals: (typeof rows)[number]["totals"]) => number) => rows.reduce((total, item) => total + pick(item.totals), 0);
  return {
    period: row,
    rows,
    totals: { regular: sum(t => t.regular), overtime: sum(t => t.overtime), total: sum(t => t.total), holiday: sum(t => t.holiday), open: sum(t => t.open), timeOff: sum(t => t.timeOff) },
    signed: rows.filter(item => item.sheet?.status === "signed").length,
    approved: rows.filter(item => item.sheet?.status === "approved").length,
    unreviewed: rows.reduce((total, item) => total + item.unreviewed, 0),
  };
}

/* A staff member's recent pay periods, newest first, with their totals. */
export async function myPeriods(staffId: string, settings: Settings, today: string, count = 6) {
  const list: (Period & { row: PeriodRow | null })[] = [];
  let day = today;
  for (let i = 0; i < count; i++) {
    const period = await periodOn(day, settings);
    list.push(period);
    day = addDays(period.start, -1);
  }
  const results = [];
  for (const period of list) {
    const sheet = await sheetFor(staffId, period, settings);
    results.push({ start: period.start, end: period.end, status: sheet.sheet?.status ?? "open", locked: sheet.period.status === "locked", totals: sheet.totals });
  }
  return results;
}

/* Recent periods for the manager's period picker. */
export function storedPeriods(limit = 12) {
  return db.select().from(schema.payPeriods).orderBy(desc(schema.payPeriods.startDate)).limit(limit);
}

/* Minutes worked so far in the current workweek, per staff member, for the overtime warning. */
export async function workweekMinutes(settings: Settings, today: string) {
  const start = workweekStart(today, settings.workweek_starts_on);
  const period = { start, end: addDays(start, 6) };
  const punches = await punchesAround(period, settings.workweek_starts_on);
  const rules = { ...sheetRules(settings), overtimeAfterHours: 10_000 };
  const byStaff = new Map<string, Around[]>();
  for (const punch of punches) byStaff.set(punch.staffId, [...(byStaff.get(punch.staffId) ?? []), punch]);
  return [...byStaff.entries()].map(([staffId, rows]) => {
    // Open punches count up to now, so the warning comes during the shift that crosses the line.
    const now = new Date();
    const closed = rows.map(row => ({ ...asPunch(row), clockOutAt: row.clockOutAt ?? now }));
    return { staffId, start, minutes: timesheet(closed, period, rules).totals.total };
  });
}

/* Ended, unlocked periods where someone with punches has not signed yet. */
export async function unsignedSheets(settings: Settings, today: string) {
  // The most recent period that has finished: the one holding yesterday, or the one before it.
  let period = await periodOn(addDays(today, -1), settings);
  if (period.end >= today) period = await periodOn(addDays(period.start, -1), settings);
  const row = await ensurePeriod(period);
  if (row.status === "locked") return { period, hasTime: false, staffIds: [] as string[] };
  const [punches, sheets] = await Promise.all([
    db
      .selectDistinct({ staffId: schema.timeEntries.staffId })
      .from(schema.timeEntries)
      .where(and(gte(schema.timeEntries.clockInAt, zonedTime(period.start, "00:00")), lt(schema.timeEntries.clockInAt, zonedTime(addDays(period.end, 1), "00:00")))),
    db.select({ staffId: schema.timesheets.staffId, status: schema.timesheets.status }).from(schema.timesheets).where(eq(schema.timesheets.periodId, row.id)),
  ]);
  return { period, hasTime: punches.length > 0, staffIds: punches.map(item => item.staffId).filter(id => !sheets.some(sheet => sheet.staffId === id && sheet.status !== "open")) };
}

/* Punches still open inside a period: a period cannot be signed or locked while one is. */
export async function openPunchesIn(period: Period, staffId?: string) {
  const rows = await db
    .select({ id: schema.timeEntries.id })
    .from(schema.timeEntries)
    .where(
      and(
        isNull(schema.timeEntries.clockOutAt),
        gte(schema.timeEntries.clockInAt, zonedTime(period.start, "00:00")),
        lt(schema.timeEntries.clockInAt, zonedTime(addDays(period.end, 1), "00:00")),
        staffId ? eq(schema.timeEntries.staffId, staffId) : undefined,
      ),
    );
  return rows.length;
}


/* Estimated gross pay for everyone in a period, for administrators. */
export async function periodPay(period: Period, staffIds: string[], settings: Settings) {
  const { activeDifferentials, payFor, ratesFor, timeOffIn } = await import("@/server/queries/pay");
  const [rates, differentials, timeOff] = await Promise.all([ratesFor(staffIds), activeDifferentials(), timeOffIn(period, staffIds)]);
  const result = new Map<string, Awaited<ReturnType<typeof payFor>>>();
  for (const staffId of staffIds) result.set(staffId, await payFor(await sheetFor(staffId, period, settings), staffId, settings, { rates, differentials, timeOff }));
  return result;
}
