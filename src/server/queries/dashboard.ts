import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ensureMedicationRecords } from "./hub";

/* Everything the Today page shows, in one trip per table. */
export async function todayOverview() {
  const today = dateKey();
  const now = new Date();
  const dayStart = zonedTime(today, "00:00");
  const dayEnd = zonedTime(addDays(today, 1), "00:00");
  const settings = await getSettings();
  await ensureMedicationRecords(today);
  const warnBy = addDays(today, settings.credential_warning_days);
  const lateBefore = new Date(now.getTime() - settings.med_late_minutes * 60_000);

  const [census] = await db.select({ n: count() }).from(schema.individuals).where(eq(schema.individuals.active, true));
  const [homesCount] = await db.select({ n: count() }).from(schema.homes).where(eq(schema.homes.active, true));

  const onShift = await db
    .select({
      id: schema.shifts.id,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
      kind: schema.shifts.kind,
      status: schema.shifts.status,
      home: schema.homes.name,
      homeId: schema.homes.id,
      staffFirst: schema.staff.firstName,
      staffLast: schema.staff.lastName,
      staffPhone: schema.staff.phone,
      pattern: schema.shiftPatterns.name,
    })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.shifts.staffId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(and(lte(schema.shifts.startsAt, now), gte(schema.shifts.endsAt, now), inArray(schema.shifts.status, ["open", "scheduled", "confirmed"])))
    .orderBy(asc(schema.homes.name));

  const openShifts = await db
    .select({ id: schema.shifts.id, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, kind: schema.shifts.kind, home: schema.homes.name, homeId: schema.homes.id, pattern: schema.shiftPatterns.name })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
    .where(and(or(eq(schema.shifts.status, "open"), isNull(schema.shifts.staffId)), gte(schema.shifts.endsAt, now), lt(schema.shifts.startsAt, zonedTime(addDays(today, 7), "00:00"))))
    .orderBy(asc(schema.shifts.startsAt))
    .limit(8);

  const medsToday = await db
    .select({ status: schema.medAdministrations.status, n: count() })
    .from(schema.medAdministrations)
    .where(and(gte(schema.medAdministrations.scheduledFor, dayStart), lt(schema.medAdministrations.scheduledFor, dayEnd)))
    .groupBy(schema.medAdministrations.status);

  const lateMeds = await db
    .select({
      id: schema.medAdministrations.id,
      scheduledFor: schema.medAdministrations.scheduledFor,
      medication: schema.medications.name,
      dose: schema.medications.dose,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      individualId: schema.individuals.id,
      home: schema.homes.name,
    })
    .from(schema.medAdministrations)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.medAdministrations.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(and(eq(schema.medAdministrations.status, "due"), lte(schema.medAdministrations.scheduledFor, lateBefore)))
    .orderBy(asc(schema.medAdministrations.scheduledFor))
    .limit(8);

  const [lateCount] = await db.select({ n: count() }).from(schema.medAdministrations)
    .where(and(eq(schema.medAdministrations.status, "due"), lte(schema.medAdministrations.scheduledFor, lateBefore)));

  const openIncidents = await db
    .select({
      id: schema.incidents.id,
      occurredAt: schema.incidents.occurredAt,
      category: schema.incidents.category,
      severity: schema.incidents.severity,
      status: schema.incidents.status,
      reportable: schema.incidents.reportable,
      stateFiledAt: schema.incidents.stateFiledAt,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      home: schema.homes.name,
    })
    .from(schema.incidents)
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.incidents.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.incidents.homeId))
    .where(inArray(schema.incidents.status, ["open", "under_review"]))
    .orderBy(desc(schema.incidents.occurredAt))
    .limit(6);

  const expiring = await db
    .select({
      id: schema.credentials.id,
      type: schema.credentials.type,
      expiresAt: schema.credentials.expiresAt,
      first: schema.staff.firstName,
      last: schema.staff.lastName,
      staffId: schema.staff.id,
    })
    .from(schema.credentials)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.credentials.staffId))
    .where(and(eq(schema.staff.active, true), lte(schema.credentials.expiresAt, warnBy)))
    .orderBy(asc(schema.credentials.expiresAt))
    .limit(8);

  const loggedToday = await db
    .select({ individualId: schema.dailyLogs.individualId })
    .from(schema.dailyLogs)
    .where(eq(schema.dailyLogs.logDate, today));
  const loggedSet = new Set(loggedToday.map(row => row.individualId));
  const residents = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, home: schema.homes.name })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(eq(schema.individuals.active, true))
    .orderBy(asc(schema.individuals.firstName));
  const awaitingLog = residents.filter(person => !loggedSet.has(person.id));

  const tasksDue = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      dueAt: schema.tasks.dueAt,
      priority: schema.tasks.priority,
      assignee: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
    })
    .from(schema.tasks)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.tasks.assignedTo))
    .where(and(eq(schema.tasks.status, "open"), or(isNull(schema.tasks.dueAt), lt(schema.tasks.dueAt, dayEnd))))
    .orderBy(asc(schema.tasks.dueAt))
    .limit(8);

  const [newEnquiries] = await db.select({ n: count() }).from(schema.enquiries).where(eq(schema.enquiries.handled, false));
  const [incidentCount] = await db.select({ n: count() }).from(schema.incidents).where(inArray(schema.incidents.status, ["open", "under_review"]));
  const [credentialCount] = await db.select({ n: count() }).from(schema.credentials).innerJoin(schema.staff, eq(schema.staff.id, schema.credentials.staffId))
    .where(and(eq(schema.staff.active, true), lte(schema.credentials.expiresAt, warnBy)));

  const meds = Object.fromEntries(medsToday.map(row => [row.status, row.n])) as Partial<Record<string, number>>;
  const medsTotal = medsToday.reduce((sum, row) => sum + row.n, 0);

  return {
    today,
    settings,
    census: census.n,
    homes: homesCount.n,
    onShift,
    openShifts,
    meds: { total: medsTotal, given: meds.given ?? 0, due: meds.due ?? 0, late: lateCount.n },
    lateMeds,
    openIncidents,
    incidentCount: incidentCount.n,
    credentialCount: credentialCount.n,
    expiring,
    awaitingLog,
    loggedCount: residents.filter(person => loggedSet.has(person.id)).length,
    tasksDue,
    newEnquiries: newEnquiries.n,
  };
}
