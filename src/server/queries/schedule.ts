import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import type { SchedHome, SchedShift, SchedStaff, ScheduleRules } from "@/lib/schedule";
import { activePatterns } from "@/server/queries/patterns";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

/*
 * Everything the schedule screen needs for one week, as plain data for the browser.
 * Shifts from the day before and after are included so rest and double-booking checks
 * see across the week's edges.
 */
export async function scheduleData(start: string) {
  const settings = await getSettings();
  const today = dateKey();
  const homes = await db
    .select({ id: schema.homes.id, name: schema.homes.name, type: schema.homes.type, staffedPatterns: schema.homes.staffedPatterns, openDays: schema.homes.openDays })
    .from(schema.homes)
    .where(eq(schema.homes.active, true))
    .orderBy(asc(schema.homes.name));
  const rows = await db
    .select()
    .from(schema.shifts)
    .where(and(gte(schema.shifts.startsAt, zonedTime(addDays(start, -1), "00:00")), lt(schema.shifts.startsAt, zonedTime(addDays(start, 8), "00:00"))))
    .orderBy(asc(schema.shifts.startsAt));
  const shifts: SchedShift[] = rows.map(row => ({
    id: row.id,
    homeId: row.homeId,
    staffId: row.staffId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    kind: row.kind,
    patternId: row.patternId,
    status: row.status,
    note: row.note,
  }));

  const people = await db
    .select({ id: schema.staff.id, firstName: schema.staff.firstName, lastName: schema.staff.lastName, role: schema.staff.role, homeId: schema.staff.homeId })
    .from(schema.staff)
    .where(eq(schema.staff.active, true))
    .orderBy(asc(schema.staff.firstName), asc(schema.staff.lastName));
  const expired = people.length
    ? await db
        .select({ staffId: schema.credentials.staffId, type: schema.credentials.type })
        .from(schema.credentials)
        .where(and(inArray(schema.credentials.staffId, people.map(person => person.id)), lt(schema.credentials.expiresAt, today)))
    : [];
  const staff: SchedStaff[] = people.map(person => ({
    ...person,
    expiredCredentials: [...new Set(expired.filter(cred => cred.staffId === person.id).map(cred => cred.type))],
  }));

  // People who have left but still appear on shifts in this window, so their names show.
  const known = new Set(staff.map(person => person.id));
  const formerIds = [...new Set(shifts.map(shift => shift.staffId).filter((id): id is string => Boolean(id) && !known.has(id!)))];
  const former = formerIds.length
    ? await db.select({ id: schema.staff.id, firstName: schema.staff.firstName, lastName: schema.staff.lastName }).from(schema.staff).where(inArray(schema.staff.id, formerIds))
    : [];

  const rules: ScheduleRules = {
    coverageMinimum: settings.shift_coverage_minimum,
    overtimeHours: settings.overtime_weekly_hours,
    minRestHours: settings.min_rest_hours,
    patterns: await activePatterns(),
  };
  return { homes: homes as SchedHome[], shifts, staff, former, rules, today };
}
