import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { addDays, zonedTime } from "@/lib/format";
import { grossPay, timeOffInPeriod, type Differential, type Rate } from "@/lib/pay";
import type { Period } from "@/lib/payroll";
import { db, schema } from "@/server/db";
import type { StaffSheet } from "@/server/queries/payroll";
import type { Settings } from "@/server/settings";

const staffName = sql<string>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`;

export function ratesFor(staffIds: string[]) {
  if (!staffIds.length) return Promise.resolve([] as (typeof schema.payRates.$inferSelect)[]);
  return db.select().from(schema.payRates).where(inArray(schema.payRates.staffId, staffIds)).orderBy(desc(schema.payRates.effectiveFrom), desc(schema.payRates.createdAt));
}

export async function activeDifferentials(): Promise<Differential[]> {
  const rows = await db.select().from(schema.payDifferentials).where(eq(schema.payDifferentials.active, true));
  return rows.map(row => ({ id: row.id, name: row.name, kind: row.kind, startTime: row.startTime, endTime: row.endTime, days: row.days, homeId: row.homeId, centsPerHour: row.centsPerHour }));
}

export function listDifferentials() {
  return db
    .select({ differential: schema.payDifferentials, home: schema.homes.name })
    .from(schema.payDifferentials)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.payDifferentials.homeId))
    .orderBy(desc(schema.payDifferentials.active), asc(schema.payDifferentials.name));
}

/* Approved time off overlapping a period, spread over its days. */
export async function timeOffIn(period: Period, staffIds?: string[]) {
  const rows = await db
    .select()
    .from(schema.timeOffRequests)
    .where(
      and(
        eq(schema.timeOffRequests.status, "approved"),
        lte(schema.timeOffRequests.startDate, period.end),
        gte(schema.timeOffRequests.endDate, period.start),
        staffIds ? inArray(schema.timeOffRequests.staffId, staffIds) : undefined,
      ),
    );
  return rows.map(request => ({ request, days: timeOffInPeriod(request, period) }));
}

/* Paid time-off minutes per staff member inside a period. */
export async function paidTimeOffMinutes(period: Period, staffIds?: string[]) {
  const map = new Map<string, number>();
  for (const { request, days } of await timeOffIn(period, staffIds)) {
    if (!request.paid) continue;
    map.set(request.staffId, (map.get(request.staffId) ?? 0) + days.reduce((sum, item) => sum + item.minutes, 0));
  }
  return map;
}

/* The estimated gross pay for one timesheet. For administrators only. */
export async function payFor(sheet: StaffSheet, staffId: string, settings: Settings, cache?: { rates: (typeof schema.payRates.$inferSelect)[]; differentials: Differential[]; timeOff: Awaited<ReturnType<typeof timeOffIn>> }) {
  const period = { start: sheet.period.startDate, end: sheet.period.endDate };
  const [rates, differentials, timeOff] = cache ? [cache.rates.filter(rate => rate.staffId === staffId), cache.differentials, cache.timeOff.filter(item => item.request.staffId === staffId)] : await Promise.all([ratesFor([staffId]), activeDifferentials(), timeOffIn(period, [staffId])]);
  const rateList: Rate[] = rates.map(rate => ({ effectiveFrom: rate.effectiveFrom, centsPerHour: rate.centsPerHour }));
  return grossPay({
    lines: sheet.lines,
    allLines: sheet.allLines,
    rates: rateList,
    differentials,
    rules: { overtimePercent: settings.overtime_pay_percent, holidayPercent: settings.holiday_pay_percent, weekStartsOn: settings.workweek_starts_on },
    timeOff: timeOff.filter(item => item.request.paid).flatMap(item => item.days),
    adjustments: sheet.adjustments.map(({ adjustment }) => ({ minutes: adjustment.minutes, overtime: adjustment.overtime, day: adjustment.relatesTo ?? period.end })),
  });
}

/* ---------- Leave balance ---------- */

export async function leaveBalances(staffIds: string[]) {
  if (!staffIds.length) return new Map<string, number>();
  const rows = await db
    .select({ staffId: schema.leaveLedger.staffId, minutes: sql<number>`coalesce(sum(${schema.leaveLedger.minutes}), 0)::int` })
    .from(schema.leaveLedger)
    .where(inArray(schema.leaveLedger.staffId, staffIds))
    .groupBy(schema.leaveLedger.staffId);
  return new Map(rows.map(row => [row.staffId, row.minutes]));
}

export async function leaveBalance(staffId: string) {
  return (await leaveBalances([staffId])).get(staffId) ?? 0;
}

export function ledgerFor(staffId: string, limit = 30) {
  return db
    .select({ entry: schema.leaveLedger, by: schema.users.name })
    .from(schema.leaveLedger)
    .leftJoin(schema.users, eq(schema.users.id, schema.leaveLedger.createdBy))
    .where(eq(schema.leaveLedger.staffId, staffId))
    .orderBy(desc(schema.leaveLedger.onDate), desc(schema.leaveLedger.createdAt))
    .limit(limit);
}

/* ---------- Time off requests ---------- */

export function myTimeOff(staffId: string) {
  return db.select().from(schema.timeOffRequests).where(eq(schema.timeOffRequests.staffId, staffId)).orderBy(desc(schema.timeOffRequests.startDate)).limit(30);
}

export async function timeOffBoard(today: string) {
  const [pending, upcoming, recent] = await Promise.all([
    db
      .select({ request: schema.timeOffRequests, staff: staffName, homeId: schema.staff.homeId })
      .from(schema.timeOffRequests)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.timeOffRequests.staffId))
      .where(eq(schema.timeOffRequests.status, "pending"))
      .orderBy(asc(schema.timeOffRequests.startDate)),
    db
      .select({ request: schema.timeOffRequests, staff: staffName })
      .from(schema.timeOffRequests)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.timeOffRequests.staffId))
      .where(and(eq(schema.timeOffRequests.status, "approved"), gte(schema.timeOffRequests.endDate, today)))
      .orderBy(asc(schema.timeOffRequests.startDate)),
    db
      .select({ request: schema.timeOffRequests, staff: staffName })
      .from(schema.timeOffRequests)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.timeOffRequests.staffId))
      .where(and(inArray(schema.timeOffRequests.status, ["approved", "declined", "cancelled"]), gte(schema.timeOffRequests.createdAt, new Date(Date.now() - 60 * 86_400_000))))
      .orderBy(desc(schema.timeOffRequests.decidedAt))
      .limit(20),
  ]);
  const ids = [...new Set(pending.map(row => row.request.staffId))];
  const [balances, shifts] = await Promise.all([leaveBalances(ids), ids.length ? shiftsDuring(pending.map(row => ({ staffId: row.request.staffId, start: row.request.startDate, end: row.request.endDate }))) : Promise.resolve(new Map<string, number>())]);
  return { pending: pending.map(row => ({ ...row, balance: balances.get(row.request.staffId) ?? 0, shifts: shifts.get(`${row.request.staffId}|${row.request.startDate}|${row.request.endDate}`) ?? 0 })), upcoming, recent };
}

/* How many of someone's scheduled shifts fall on the days they asked off. */
async function shiftsDuring(asks: { staffId: string; start: string; end: string }[]) {
  const map = new Map<string, number>();
  for (const ask of asks) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.staffId, ask.staffId),
          inArray(schema.shifts.status, ["scheduled", "confirmed"]),
          gte(schema.shifts.startsAt, zonedTime(ask.start, "00:00")),
          lte(schema.shifts.startsAt, zonedTime(addDays(ask.end, 1), "00:00")),
        ),
      );
    map.set(`${ask.staffId}|${ask.start}|${ask.end}`, row.n);
  }
  return map;
}
