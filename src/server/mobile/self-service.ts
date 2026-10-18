import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { addDays, dateKey, weekStart, zonedTime } from "@/lib/format";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { leaveBalance, myTimeOff } from "@/server/queries/pay";
import { periodOn, sheetFor } from "@/server/queries/payroll";
import { staffTime } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export async function staffSelfService(user: SessionUser, weekDay: string, periodDay: string, now: number) {
  if (!user.staffId) return null;
  const settings = await getSettings();
  const today = dateKey(new Date(now));
  const week = weekStart(weekDay);
  const period = await periodOn(periodDay > today ? today : periodDay, settings);
  const [shifts, history, balance, requests, sheet, homes] = await Promise.all([
    db.select({ id: schema.shifts.id, home: schema.homes.name, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, status: schema.shifts.status, note: schema.shifts.note, pattern: schema.shiftPatterns.name }).from(schema.shifts).innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId)).leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId)).where(and(eq(schema.shifts.staffId, user.staffId), gte(schema.shifts.startsAt, zonedTime(week, "00:00")), lt(schema.shifts.startsAt, zonedTime(addDays(week, 7), "00:00")))).orderBy(asc(schema.shifts.startsAt)),
    staffTime(user.staffId, now), leaveBalance(user.staffId), myTimeOff(user.staffId), sheetFor(user.staffId, period, settings),
    db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name)),
  ]);
  return {
    today, week, shifts, homes,
    punches: history.rows.map(({ id, clockInAt, clockOutAt, home, flags }) => ({ id, clockInAt, clockOutAt, home, flags })),
    corrections: history.corrections.map(({ id, clockInAt, clockOutAt, reason, status, decisionNote }) => ({ id, clockInAt, clockOutAt, reason, status, decisionNote })),
    leave: { balanceMinutes: balance, types: [...settings.time_off_types, ...settings.time_off_unpaid_types], balanceTypes: settings.time_off_balance_types, noticeDays: settings.time_off_notice_days, requests: requests.map(request => ({ id: request.id, type: request.type, startDate: request.startDate, endDate: request.endDate, minutes: request.minutes, paid: request.paid, reason: request.reason, status: request.status, decisionNote: request.decisionNote, canCancel: request.status === "pending" || (request.status === "approved" && request.startDate > today) })) },
    timesheet: { start: period.start, end: period.end, status: sheet.sheet?.status ?? "open", locked: sheet.period.status === "locked", canSign: period.end <= today && sheet.period.status !== "locked" && (!sheet.sheet || sheet.sheet.status === "open") && sheet.totals.open === 0, signedName: sheet.sheet?.signedName ?? "", returnNote: sheet.sheet?.returnNote ?? "", totals: sheet.totals, lines: sheet.lines, adjustments: sheet.adjustments.map(item => ({ minutes: item.adjustment.minutes, reason: item.adjustment.reason })) },
  };
}
