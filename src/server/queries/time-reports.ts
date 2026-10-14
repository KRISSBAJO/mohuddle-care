import "server-only";
import { and, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { timeOffInPeriod } from "@/lib/pay";
import { timesheet, type Punch } from "@/lib/payroll";
import { db, schema } from "@/server/db";
import { sheetRules } from "@/server/queries/payroll";
import type { Settings } from "@/server/settings";

type StaffRow = { staffId: string; name: string; minutes: number; overtime: number; punches: number; late: number; lateMinutes: number; exceptions: number; noShows: number; scheduled: number; timeOff: number };
type HomeRow = { homeId: string | null; home: string; minutes: number; punches: number; late: number; exceptions: number; handovers: number; noShows: number };

/* Attendance and hours between two days (inclusive), by staff member and by home. */
export async function timeReport(from: string, to: string, settings: Settings) {
  const start = zonedTime(from, "00:00");
  const end = zonedTime(addDays(to, 1), "00:00");
  const now = new Date();
  const [entries, shifts, handovers, offs, people, homes] = await Promise.all([
    db
      .select({
        id: schema.timeEntries.id,
        staffId: schema.timeEntries.staffId,
        homeId: schema.timeEntries.homeId,
        shiftId: schema.timeEntries.shiftId,
        clockInAt: schema.timeEntries.clockInAt,
        clockOutAt: schema.timeEntries.clockOutAt,
        lateMinutes: schema.timeEntries.lateMinutes,
        flags: schema.timeEntries.flags,
        shiftStart: schema.shifts.startsAt,
      })
      .from(schema.timeEntries)
      .leftJoin(schema.shifts, eq(schema.shifts.id, schema.timeEntries.shiftId))
      .where(and(gte(schema.timeEntries.clockInAt, start), lt(schema.timeEntries.clockInAt, end))),
    db
      .select({ id: schema.shifts.id, staffId: schema.shifts.staffId, homeId: schema.shifts.homeId, startsAt: schema.shifts.startsAt, status: schema.shifts.status })
      .from(schema.shifts)
      .where(and(isNotNull(schema.shifts.staffId), ne(schema.shifts.status, "open"), gte(schema.shifts.startsAt, start), lt(schema.shifts.startsAt, end), lt(schema.shifts.endsAt, now))),
    db.select({ entryId: schema.handovers.entryId }).from(schema.handovers).where(and(gte(schema.handovers.createdAt, start), lt(schema.handovers.createdAt, end))),
    db.select().from(schema.timeOffRequests).where(and(eq(schema.timeOffRequests.status, "approved"), lt(schema.timeOffRequests.startDate, addDays(to, 1)), gte(schema.timeOffRequests.endDate, from))),
    db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff),
    db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes),
  ]);
  const meals = entries.length
    ? await db.select({ entryId: schema.timeBreaks.entryId, startAt: schema.timeBreaks.startAt, endAt: schema.timeBreaks.endAt }).from(schema.timeBreaks).where(and(inArray(schema.timeBreaks.entryId, entries.map(entry => entry.id)), eq(schema.timeBreaks.kind, "meal")))
    : [];
  const mealMinutes = (entryId: string) => meals.filter(meal => meal.entryId === entryId && meal.endAt).reduce((sum, meal) => sum + Math.round((meal.endAt!.getTime() - meal.startAt.getTime()) / 60_000), 0);
  const withHandover = new Set(handovers.map(row => row.entryId));
  const nameOf = new Map(people.map(person => [person.id, `${person.first} ${person.last}`]));
  const homeOf = new Map(homes.map(home => [home.id, home.name]));
  const clocked = (shift: (typeof shifts)[number]) => entries.some(entry => entry.shiftId === shift.id || (!entry.shiftId && entry.staffId === shift.staffId && entry.homeId === shift.homeId && Math.abs(entry.clockInAt.getTime() - shift.startsAt.getTime()) < 4 * 3_600_000));
  // A shift marked missed is a no-show, and so is any other worked shift nobody clocked in to.
  const noShows = shifts.filter(shift => shift.status === "missed" || !clocked(shift));

  const staff = new Map<string, StaffRow>();
  const staffRow = (staffId: string) => {
    if (!staff.has(staffId)) staff.set(staffId, { staffId, name: nameOf.get(staffId) ?? "Unknown", minutes: 0, overtime: 0, punches: 0, late: 0, lateMinutes: 0, exceptions: 0, noShows: 0, scheduled: 0, timeOff: 0 });
    return staff.get(staffId)!;
  };
  const home = new Map<string, HomeRow>();
  const homeRow = (homeId: string | null) => {
    const key = homeId ?? "none";
    if (!home.has(key)) home.set(key, { homeId, home: homeId ? homeOf.get(homeId) ?? "Unknown" : "No home", minutes: 0, punches: 0, late: 0, exceptions: 0, handovers: 0, noShows: 0 });
    return home.get(key)!;
  };

  const rules = sheetRules(settings);
  const period = { start: from, end: to };
  const byStaff = new Map<string, Punch[]>();
  for (const entry of entries) {
    byStaff.set(entry.staffId, [...(byStaff.get(entry.staffId) ?? []), { id: entry.id, clockInAt: entry.clockInAt, clockOutAt: entry.clockOutAt, mealMinutes: mealMinutes(entry.id), homeId: entry.homeId, home: null, shiftStart: entry.shiftStart }]);
    const s = staffRow(entry.staffId);
    const h = homeRow(entry.homeId);
    s.punches += 1;
    h.punches += 1;
    if (entry.lateMinutes > 0) {
      s.late += 1;
      s.lateMinutes += entry.lateMinutes;
      h.late += 1;
    }
    if (entry.flags.length) {
      s.exceptions += 1;
      h.exceptions += 1;
    }
    if (entry.clockOutAt && withHandover.has(entry.id)) h.handovers += 1;
  }
  for (const [staffId, punches] of byStaff) {
    const sheet = timesheet(punches, period, rules);
    const s = staffRow(staffId);
    s.minutes = sheet.totals.regular + sheet.totals.overtime;
    s.overtime = sheet.totals.overtime;
    for (const line of sheet.lines) homeRow(line.homeId).minutes += line.minutes;
  }
  for (const shift of shifts) staffRow(shift.staffId!).scheduled += 1;
  for (const shift of noShows) {
    staffRow(shift.staffId!).noShows += 1;
    homeRow(shift.homeId).noShows += 1;
  }
  for (const request of offs) staffRow(request.staffId).timeOff += timeOffInPeriod(request, period).reduce((sum, day) => sum + day.minutes, 0);

  const closedWithHome = entries.filter(entry => entry.clockOutAt && entry.homeId).length;
  return {
    staff: [...staff.values()].sort((a, b) => b.minutes - a.minutes),
    homes: [...home.values()].sort((a, b) => b.minutes - a.minutes),
    totals: {
      minutes: [...staff.values()].reduce((sum, row) => sum + row.minutes, 0),
      overtime: [...staff.values()].reduce((sum, row) => sum + row.overtime, 0),
      punches: entries.length,
      late: entries.filter(entry => entry.lateMinutes > 0).length,
      exceptions: entries.filter(entry => entry.flags.length).length,
      noShows: noShows.length,
      scheduled: shifts.length,
      handoverRate: closedWithHome ? Math.round((entries.filter(entry => entry.clockOutAt && entry.homeId && withHandover.has(entry.id)).length / closedWithHome) * 100) : null,
    },
    today: dateKey(now),
  };
}
