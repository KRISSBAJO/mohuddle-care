import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { hasPassword } from "@/server/accounts";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";

export const listHomes = () => db.select().from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name));

export const listStaff = () =>
  db.select().from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.firstName), asc(schema.staff.lastName));

export function listIndividuals() {
  return db
    .select({
      id: schema.individuals.id,
      firstName: schema.individuals.firstName,
      lastName: schema.individuals.lastName,
      dob: schema.individuals.dob,
      serviceType: schema.individuals.serviceType,
      homeId: schema.individuals.homeId,
      home: schema.homes.name,
      active: schema.individuals.active,
    })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(eq(schema.individuals.active, true))
    .orderBy(asc(schema.individuals.firstName), asc(schema.individuals.lastName));
}

export async function individualDetail(id: string) {
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, id)).limit(1);
  if (!person) return null;
  const [home] = person.homeId ? await db.select().from(schema.homes).where(eq(schema.homes.id, person.homeId)).limit(1) : [];
  const goals = await db.select().from(schema.planGoals).where(eq(schema.planGoals.individualId, id)).orderBy(asc(schema.planGoals.status), asc(schema.planGoals.targetDate));
  const meds = await db.select().from(schema.medications).where(and(eq(schema.medications.individualId, id), eq(schema.medications.active, true))).orderBy(asc(schema.medications.name));
  const stoppedMeds = await db
    .select()
    .from(schema.medications)
    .where(and(eq(schema.medications.individualId, id), eq(schema.medications.active, false)))
    .orderBy(desc(schema.medications.stoppedAt))
    .limit(20);
  const logs = await db
    .select({
      id: schema.dailyLogs.id,
      logDate: schema.dailyLogs.logDate,
      mood: schema.dailyLogs.mood,
      notes: schema.dailyLogs.notes,
      activities: schema.dailyLogs.activities,
      health: schema.dailyLogs.health,
      goalProgress: schema.dailyLogs.goalProgress,
      staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
    })
    .from(schema.dailyLogs)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
    .where(eq(schema.dailyLogs.individualId, id))
    .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt))
    .limit(14);
  const incidents = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.individualId, id))
    .orderBy(desc(schema.incidents.occurredAt))
    .limit(10);
  return { person, home: home ?? null, goals, meds, stoppedMeds, logs, incidents };
}

export function listDailyLogs(day?: string) {
  const query = db
    .select({
      id: schema.dailyLogs.id,
      logDate: schema.dailyLogs.logDate,
      mood: schema.dailyLogs.mood,
      notes: schema.dailyLogs.notes,
      activities: schema.dailyLogs.activities,
      createdAt: schema.dailyLogs.createdAt,
      shift: schema.dailyLogs.shift,
      shiftName: schema.dailyLogs.shiftName,
      individualId: schema.individuals.id,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      home: schema.homes.name,
      staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
    })
    .from(schema.dailyLogs)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
    .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt))
    .limit(60);
  return day ? query.where(eq(schema.dailyLogs.logDate, day)) : query;
}

/* Makes sure every active medication has a due record for each of its times today, then returns the day's MAR. */
export async function ensureMedicationRecords(day = dateKey()) {
  const meds = await db
    .select({
      id: schema.medications.id,
      individualId: schema.medications.individualId,
      times: schema.medications.times,
      startedAt: schema.medications.startedAt,
    })
    .from(schema.medications)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.medications.individualId))
    .where(and(eq(schema.medications.active, true), eq(schema.individuals.active, true)));
  // A medication only has doses from the moment it started. Older rows have no start and keep every dose.
  const rows = meds.flatMap(med =>
    med.times
      .map(time => ({ medicationId: med.id, individualId: med.individualId, scheduledFor: zonedTime(day, time) }))
      .filter(dose => !med.startedAt || dose.scheduledFor.getTime() >= med.startedAt.getTime()),
  );
  if (rows.length) await db.insert(schema.medAdministrations).values(rows).onConflictDoNothing();
}

export async function medicationRecordForDay(day = dateKey()) {
  await ensureMedicationRecords(day);
  const dayStart = zonedTime(day, "00:00");
  const dayEnd = zonedTime(addDays(day, 1), "00:00");

  return db
    .select({
      id: schema.medAdministrations.id,
      scheduledFor: schema.medAdministrations.scheduledFor,
      recordedAt: schema.medAdministrations.recordedAt,
      status: schema.medAdministrations.status,
      note: schema.medAdministrations.note,
      medication: schema.medications.name,
      dose: schema.medications.dose,
      route: schema.medications.route,
      instructions: schema.medications.instructions,
      individualId: schema.individuals.id,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      home: schema.homes.name,
      staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
    })
    .from(schema.medAdministrations)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.medAdministrations.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
    .where(and(gte(schema.medAdministrations.scheduledFor, dayStart), lt(schema.medAdministrations.scheduledFor, dayEnd)))
    .orderBy(asc(schema.medAdministrations.scheduledFor), asc(schema.individuals.firstName));
}

export function shiftsForWeek(weekStartDay: string) {
  const start = zonedTime(weekStartDay, "00:00");
  const end = zonedTime(addDays(weekStartDay, 7), "00:00");
  return db
    .select({
      id: schema.shifts.id,
      homeId: schema.shifts.homeId,
      staffId: schema.shifts.staffId,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
      kind: schema.shifts.kind,
      status: schema.shifts.status,
      note: schema.shifts.note,
      staffFirst: schema.staff.firstName,
      staffLast: schema.staff.lastName,
    })
    .from(schema.shifts)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.shifts.staffId))
    .where(and(gte(schema.shifts.startsAt, start), lt(schema.shifts.startsAt, end)))
    .orderBy(asc(schema.shifts.startsAt));
}

export function listTasks(status: "open" | "done" = "open") {
  return db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      details: schema.tasks.details,
      dueAt: schema.tasks.dueAt,
      priority: schema.tasks.priority,
      status: schema.tasks.status,
      completedAt: schema.tasks.completedAt,
      assignee: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
      home: schema.homes.name,
      person: sql<string | null>`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`,
    })
    .from(schema.tasks)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.tasks.assignedTo))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.tasks.homeId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.tasks.individualId))
    .where(eq(schema.tasks.status, status))
    .orderBy(status === "open" ? asc(schema.tasks.dueAt) : desc(schema.tasks.completedAt))
    .limit(100);
}

export async function staffWithCredentials() {
  const people = await listStaff();
  const creds = people.length
    ? await db.select().from(schema.credentials).where(inArray(schema.credentials.staffId, people.map(person => person.id))).orderBy(asc(schema.credentials.expiresAt))
    : [];
  const homes = await listHomes();
  const homeName = new Map(homes.map(home => [home.id, home.name]));
  const logins = people.length
    ? await db
        .select({ staffId: schema.users.staffId, role: schema.users.role, active: schema.users.active, hasPassword: hasPassword })
        .from(schema.users)
        .where(inArray(schema.users.staffId, people.map(person => person.id)))
    : [];
  return people.map(person => ({
    ...person,
    home: person.homeId ? homeName.get(person.homeId) ?? null : null,
    credentials: creds.filter(cred => cred.staffId === person.id),
    login: logins.find(login => login.staffId === person.id) ?? null,
  }));
}

export async function homesWithOccupancy() {
  const homes = await listHomes();
  const residents = await db
    .select({ homeId: schema.individuals.homeId, first: schema.individuals.firstName, last: schema.individuals.lastName, id: schema.individuals.id })
    .from(schema.individuals)
    .where(eq(schema.individuals.active, true));
  return homes.map(home => ({ ...home, residents: residents.filter(person => person.homeId === home.id) }));
}

export const listEnquiries = () => db.select().from(schema.enquiries).orderBy(asc(schema.enquiries.handled), desc(schema.enquiries.createdAt)).limit(200);

export const listFormerStaff = () =>
  db.select().from(schema.staff).where(eq(schema.staff.active, false)).orderBy(asc(schema.staff.firstName), asc(schema.staff.lastName));

export async function staffDetail(id: string) {
  const [member] = await db.select().from(schema.staff).where(eq(schema.staff.id, id)).limit(1);
  if (!member) return null;
  const [home] = member.homeId ? await db.select().from(schema.homes).where(eq(schema.homes.id, member.homeId)).limit(1) : [];
  const credentials = await db.select().from(schema.credentials).where(eq(schema.credentials.staffId, id)).orderBy(asc(schema.credentials.expiresAt));
  const [login] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      active: schema.users.active,
      hasPassword: hasPassword,
    })
    .from(schema.users)
    .where(eq(schema.users.staffId, id))
    .limit(1);
  const [pendingLink] = login
    ? await db
        .select({ expiresAt: schema.loginTokens.expiresAt, purpose: schema.loginTokens.purpose })
        .from(schema.loginTokens)
        .where(and(eq(schema.loginTokens.userId, login.id), isNull(schema.loginTokens.usedAt), gte(schema.loginTokens.expiresAt, new Date())))
        .orderBy(desc(schema.loginTokens.createdAt))
        .limit(1)
    : [];
  const now = new Date();
  // Phones signed in to the Mohuddle app, so a lost one can be signed out.
  const phones = login
    ? await db
        .select({ device: schema.sessions.device, signedInAt: schema.sessions.createdAt, lastSeenAt: schema.sessions.lastSeenAt })
        .from(schema.sessions)
        .where(and(eq(schema.sessions.userId, login.id), isNotNull(schema.sessions.device), gte(schema.sessions.expiresAt, now)))
        .orderBy(desc(schema.sessions.lastSeenAt))
    : [];
  const [upcoming] = await db
    .select({ n: count() })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.staffId, id), gte(schema.shifts.startsAt, now), inArray(schema.shifts.status, ["scheduled", "confirmed"])));
  const [openTasks] = await db.select({ n: count() }).from(schema.tasks).where(and(eq(schema.tasks.assignedTo, id), eq(schema.tasks.status, "open")));
  return {
    member,
    home: home ?? null,
    credentials,
    login: login ?? null,
    pendingLink: pendingLink ?? null,
    phones,
    upcomingShifts: upcoming.n,
    openTasks: openTasks.n,
  };
}

export async function homeDetail(id: string) {
  const [home] = await db.select().from(schema.homes).where(eq(schema.homes.id, id)).limit(1);
  if (!home) return null;
  const residents = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName })
    .from(schema.individuals)
    .where(and(eq(schema.individuals.homeId, id), eq(schema.individuals.active, true)));
  const [upcoming] = await db
    .select({ n: count() })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.homeId, id), gte(schema.shifts.startsAt, new Date()), inArray(schema.shifts.status, ["open", "scheduled", "confirmed"])));
  const [based] = await db.select({ n: count() }).from(schema.staff).where(and(eq(schema.staff.homeId, id), eq(schema.staff.active, true)));
  return { home, residents, upcomingShifts: upcoming.n, staffBased: based.n };
}

export const listClosedHomes = () => db.select().from(schema.homes).where(eq(schema.homes.active, false)).orderBy(asc(schema.homes.name));

export async function medicationDetail(id: string) {
  const rows = await db
    .select({ med: schema.medications, first: schema.individuals.firstName, last: schema.individuals.lastName })
    .from(schema.medications)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.medications.individualId))
    .where(eq(schema.medications.id, id))
    .limit(1);
  return rows[0] ?? null;
}
