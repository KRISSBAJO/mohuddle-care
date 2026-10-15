import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { addDays, dateKey, zone, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { ensureMedicationRecords } from "@/server/queries/hub";
import { goalsForLogs } from "@/server/queries/logs";

const staffName = sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`;

/* Everything the page header and tab badges need, in one round of small queries. */
export async function personHeader(id: string, lateMinutes: number) {
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, id)).limit(1);
  if (!person) return null;
  const today = dateKey();
  if (person.active) await ensureMedicationRecords(today);
  const now = Date.now();
  const [home, goalRows, medRows, incidentRows, taskRows, lastLog, doses, appointmentRows] = await Promise.all([
    person.homeId ? db.select().from(schema.homes).where(eq(schema.homes.id, person.homeId)).limit(1).then(rows => rows[0] ?? null) : null,
    db.select({ status: schema.planGoals.status, n: count() }).from(schema.planGoals).where(eq(schema.planGoals.individualId, id)).groupBy(schema.planGoals.status),
    db.select({ n: count() }).from(schema.medications).where(and(eq(schema.medications.individualId, id), eq(schema.medications.active, true))),
    db
      .select({ open: sql<number>`count(*) filter (where ${schema.incidents.status} <> 'closed')`.mapWith(Number), total: count() })
      .from(schema.incidents)
      .where(eq(schema.incidents.individualId, id)),
    db
      .select({
        open: sql<number>`count(*) filter (where ${schema.tasks.status} = 'open')`.mapWith(Number),
        overdue: sql<number>`count(*) filter (where ${schema.tasks.status} = 'open' and ${schema.tasks.dueAt} < now())`.mapWith(Number),
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.individualId, id)),
    db.select({ day: schema.dailyLogs.logDate }).from(schema.dailyLogs).where(eq(schema.dailyLogs.individualId, id)).orderBy(desc(schema.dailyLogs.logDate)).limit(1),
    db
      .select({ status: schema.medAdministrations.status, at: schema.medAdministrations.scheduledFor })
      .from(schema.medAdministrations)
      .where(and(eq(schema.medAdministrations.individualId, id), gte(schema.medAdministrations.scheduledFor, zonedTime(today, "00:00")), lt(schema.medAdministrations.scheduledFor, zonedTime(addDays(today, 1), "00:00")))),
    db
      .select({
        upcoming: sql<number>`count(*) filter (where ${schema.appointments.scheduledAt} >= now())`.mapWith(Number),
        toDocument: sql<number>`count(*) filter (where ${schema.appointments.scheduledAt} < now())`.mapWith(Number),
      })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.individualId, id), eq(schema.appointments.status, "scheduled"))),
  ]);
  const manager = home?.managerStaffId
    ? await db.select({ id: schema.staff.id, firstName: schema.staff.firstName, lastName: schema.staff.lastName, phone: schema.staff.phone }).from(schema.staff).where(eq(schema.staff.id, home.managerStaffId)).limit(1).then(rows => rows[0] ?? null)
    : null;
  const goals = Object.fromEntries(goalRows.map(row => [row.status, row.n])) as Partial<Record<"active" | "met" | "paused", number>>;
  return {
    person,
    home,
    manager,
    counts: {
      activeGoals: goals.active ?? 0,
      metGoals: goals.met ?? 0,
      activeMeds: medRows[0]?.n ?? 0,
      openIncidents: incidentRows[0]?.open ?? 0,
      incidents: incidentRows[0]?.total ?? 0,
      openTasks: taskRows[0]?.open ?? 0,
      overdueTasks: taskRows[0]?.overdue ?? 0,
      lastLog: lastLog[0]?.day ?? null,
      upcomingAppointments: appointmentRows[0]?.upcoming ?? 0,
      appointmentsToDocument: appointmentRows[0]?.toDocument ?? 0,
      dosesToday: doses.length,
      dosesDone: doses.filter(dose => dose.status !== "due").length,
      dosesLate: doses.filter(dose => dose.status === "due" && dose.at.getTime() < now - lateMinutes * 60_000).length,
    },
  };
}

/* One person's doses on one day, with who recorded each. */
export function personDoses(id: string, day: string) {
  return db
    .select({
      id: schema.medAdministrations.id,
      scheduledFor: schema.medAdministrations.scheduledFor,
      status: schema.medAdministrations.status,
      recordedAt: schema.medAdministrations.recordedAt,
      note: schema.medAdministrations.note,
      medication: schema.medications.name,
      dose: schema.medications.dose,
      route: schema.medications.route,
      instructions: schema.medications.instructions,
      staff: staffName,
    })
    .from(schema.medAdministrations)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
    .where(and(eq(schema.medAdministrations.individualId, id), gte(schema.medAdministrations.scheduledFor, zonedTime(day, "00:00")), lt(schema.medAdministrations.scheduledFor, zonedTime(addDays(day, 1), "00:00"))))
    .orderBy(asc(schema.medAdministrations.scheduledFor), asc(schema.medications.name));
}

export type MoodDay = { day: string; mood: (typeof schema.mood.enumValues)[number] | null };

/* The last N days, oldest first, with the mood of the latest log that day or null when nobody wrote one. */
export async function moodSeries(id: string, days: number): Promise<MoodDay[]> {
  const today = dateKey();
  const from = addDays(today, -(days - 1));
  const rows = await db
    .select({ day: schema.dailyLogs.logDate, mood: schema.dailyLogs.mood })
    .from(schema.dailyLogs)
    .where(and(eq(schema.dailyLogs.individualId, id), gte(schema.dailyLogs.logDate, from), lte(schema.dailyLogs.logDate, today)))
    .orderBy(asc(schema.dailyLogs.logDate), asc(schema.dailyLogs.createdAt));
  const byDay = new Map(rows.map(row => [row.day, row.mood]));
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(from, index);
    return { day, mood: byDay.get(day) ?? null };
  });
}

/* The overview: today, the people around this person, and what happened lately. */
export async function personOverview(id: string, homeId: string | null) {
  const today = dateKey();
  const since = new Date(Date.now() - 60 * 86_400_000);
  const [doses, mood, goals, recentLogs, recentIncidents, exceptions, team, onShift, tasks] = await Promise.all([
    personDoses(id, today),
    moodSeries(id, 30),
    db.select().from(schema.planGoals).where(and(eq(schema.planGoals.individualId, id), eq(schema.planGoals.status, "active"))).orderBy(asc(schema.planGoals.targetDate)).limit(5),
    db
      .select({ id: schema.dailyLogs.id, day: schema.dailyLogs.logDate, at: schema.dailyLogs.createdAt, mood: schema.dailyLogs.mood, text: sql<string>`coalesce(nullif(${schema.dailyLogs.activities}, ''), nullif(${schema.dailyLogs.notes}, ''), '')`, staff: staffName })
      .from(schema.dailyLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
      .where(eq(schema.dailyLogs.individualId, id))
      .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt))
      .limit(6),
    db.select().from(schema.incidents).where(eq(schema.incidents.individualId, id)).orderBy(desc(schema.incidents.occurredAt)).limit(4),
    db
      .select({ id: schema.medAdministrations.id, at: schema.medAdministrations.scheduledFor, status: schema.medAdministrations.status, note: schema.medAdministrations.note, medication: schema.medications.name, staff: staffName })
      .from(schema.medAdministrations)
      .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
      .where(and(eq(schema.medAdministrations.individualId, id), inArray(schema.medAdministrations.status, ["refused", "missed", "held"]), gte(schema.medAdministrations.scheduledFor, since)))
      .orderBy(desc(schema.medAdministrations.scheduledFor))
      .limit(4),
    careTeam(id, since),
    homeId
      ? db
          .select({ id: schema.shifts.id, kind: schema.shifts.kind, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, status: schema.shifts.status, staffId: schema.staff.id, staff: staffName, phone: schema.staff.phone })
          .from(schema.shifts)
          .leftJoin(schema.staff, eq(schema.staff.id, schema.shifts.staffId))
          .where(and(eq(schema.shifts.homeId, homeId), lt(schema.shifts.startsAt, zonedTime(addDays(today, 1), "00:00")), gte(schema.shifts.endsAt, zonedTime(today, "00:00")), ne(schema.shifts.status, "missed")))
          .orderBy(asc(schema.shifts.startsAt))
      : [],
    db.select().from(schema.tasks).where(and(eq(schema.tasks.individualId, id), eq(schema.tasks.status, "open"))).orderBy(sql`${schema.tasks.dueAt} asc nulls last`).limit(4),
  ]);

  type Activity = { key: string; at: Date; kind: "log" | "incident" | "dose"; title: string; body: string; href?: string; tone: "good" | "warn" | "bad" | "neutral" | "plum" };
  const activity: Activity[] = [
    ...recentLogs.map(log => ({ key: `log-${log.id}`, at: log.at, kind: "log" as const, title: `Daily log · mood ${log.mood}`, body: [log.text, log.staff].filter(Boolean).join(" — "), tone: log.mood === "low" || log.mood === "distressed" ? ("warn" as const) : ("good" as const) })),
    ...recentIncidents.map(incident => ({ key: `inc-${incident.id}`, at: incident.occurredAt, kind: "incident" as const, title: `Incident · ${incident.category.replace("_", " ")}`, body: incident.description, href: `/app/incidents/${incident.id}`, tone: "bad" as const })),
    ...exceptions.map(dose => ({ key: `dose-${dose.id}`, at: dose.at, kind: "dose" as const, title: `${dose.medication} ${dose.status}`, body: [dose.note, dose.staff].filter(Boolean).join(" — "), tone: "plum" as const })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return { doses, mood, goals, activity, team, onShift, tasks };
}

/* Staff who have worked most closely with this person lately, from logs written and doses recorded. */
async function careTeam(id: string, since: Date) {
  const rows = await db.execute<{ id: string; first_name: string; last_name: string; role: string; phone: string; logs: number; doses: number; last_at: string }>(sql`
    select s.id, s.first_name, s.last_name, s.role, s.phone,
           count(*) filter (where w.kind = 'log')::int as logs,
           count(*) filter (where w.kind = 'dose')::int as doses,
           max(w.at) as last_at
    from (
      select staff_id, 'log' as kind, created_at as at from daily_logs where individual_id = ${id} and created_at >= ${since}
      union all
      select staff_id, 'dose' as kind, recorded_at as at from med_administrations where individual_id = ${id} and recorded_at >= ${since}
    ) w
    join staff s on s.id = w.staff_id
    group by s.id
    order by count(*) desc, max(w.at) desc
    limit 6
  `);
  return rows.rows.map(row => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, role: row.role, phone: row.phone, logs: Number(row.logs), doses: Number(row.doses), lastAt: new Date(row.last_at) }));
}

/* Goals and the progress notes staff wrote about them in daily logs. */
export async function personCarePlan(id: string) {
  const today = dateKey();
  const [goals, progress, logCount, worked] = await Promise.all([
    db.select().from(schema.planGoals).where(eq(schema.planGoals.individualId, id)).orderBy(sql`case ${schema.planGoals.status} when 'active' then 0 when 'paused' then 1 else 2 end`, sql`${schema.planGoals.targetDate} asc nulls last`, asc(schema.planGoals.createdAt)),
    db
      .select({ id: schema.dailyLogs.id, day: schema.dailyLogs.logDate, text: schema.dailyLogs.goalProgress, staff: staffName })
      .from(schema.dailyLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
      .where(and(eq(schema.dailyLogs.individualId, id), ne(schema.dailyLogs.goalProgress, "")))
      .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt))
      .limit(15),
    db.select({ n: count() }).from(schema.dailyLogs).where(and(eq(schema.dailyLogs.individualId, id), gte(schema.dailyLogs.logDate, addDays(today, -29)))),
    // Days each goal was worked on this month or week, whichever began first, for "documented 1 of 3".
    db
      .selectDistinct({ goalId: schema.dailyLogGoals.goalId, day: schema.dailyLogs.logDate })
      .from(schema.dailyLogGoals)
      .innerJoin(schema.dailyLogs, eq(schema.dailyLogs.id, schema.dailyLogGoals.logId))
      .where(and(eq(schema.dailyLogs.individualId, id), eq(schema.dailyLogGoals.offered, "yes"), gte(schema.dailyLogs.logDate, addDays(today, -31)))),
  ]);
  return { goals, progress, logsLast30: logCount[0]?.n ?? 0, worked };
}

export type MarCell = { id: string; status: (typeof schema.medStatus.enumValues)[number]; recordedAt: Date | null; note: string; staff: string | null };

/* A medication administration record: one row per medication and time, one column per day. */
export async function personMedications(id: string, endDay: string, days: number) {
  const startDay = addDays(endDay, -(days - 1));
  const from = zonedTime(startDay, "00:00");
  const to = zonedTime(addDays(endDay, 1), "00:00");
  const [active, stopped, doses] = await Promise.all([
    db.select().from(schema.medications).where(and(eq(schema.medications.individualId, id), eq(schema.medications.active, true))).orderBy(asc(schema.medications.name)),
    db.select().from(schema.medications).where(and(eq(schema.medications.individualId, id), eq(schema.medications.active, false))).orderBy(desc(schema.medications.stoppedAt)).limit(30),
    db
      .select({
        id: schema.medAdministrations.id,
        medicationId: schema.medAdministrations.medicationId,
        scheduledFor: schema.medAdministrations.scheduledFor,
        status: schema.medAdministrations.status,
        recordedAt: schema.medAdministrations.recordedAt,
        note: schema.medAdministrations.note,
        name: schema.medications.name,
        dose: schema.medications.dose,
        staff: staffName,
      })
      .from(schema.medAdministrations)
      .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
      .where(and(eq(schema.medAdministrations.individualId, id), gte(schema.medAdministrations.scheduledFor, from), lt(schema.medAdministrations.scheduledFor, to)))
      .orderBy(asc(schema.medications.name), asc(schema.medAdministrations.scheduledFor)),
  ]);
  const columns = Array.from({ length: days }, (_, index) => addDays(startDay, index));
  const timeOf = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const rows = new Map<string, { key: string; medicationId: string; name: string; dose: string; time: string; cells: Record<string, MarCell> }>();
  for (const dose of doses) {
    const time = timeOf(dose.scheduledFor);
    const key = `${dose.medicationId}-${time}`;
    const row = rows.get(key) ?? { key, medicationId: dose.medicationId, name: dose.name, dose: dose.dose, time, cells: {} };
    row.cells[dateKey(dose.scheduledFor)] = { id: dose.id, status: dose.status, recordedAt: dose.recordedAt, note: dose.note, staff: dose.staff };
    rows.set(key, row);
  }
  const now = Date.now();
  const past = doses.filter(dose => dose.scheduledFor.getTime() <= now);
  const tally = { given: 0, refused: 0, held: 0, missed: 0, unrecorded: 0 };
  for (const dose of past) {
    if (dose.status === "due") tally.unrecorded += 1;
    else tally[dose.status] += 1;
  }
  return {
    active,
    stopped,
    columns,
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.time.localeCompare(b.time)),
    tally,
    pastTotal: past.length,
    exceptions: doses.filter(dose => dose.status === "refused" || dose.status === "missed" || dose.status === "held").reverse(),
  };
}

/* Health in one place: what staff observed, behaviour notes, medication exceptions and health-related incidents. */
export async function personHealth(id: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [observations, behaviours, exceptions, incidents] = await Promise.all([
    db
      .select({ id: schema.dailyLogs.id, day: schema.dailyLogs.logDate, text: schema.dailyLogs.health, mood: schema.dailyLogs.mood, staff: staffName })
      .from(schema.dailyLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
      .where(and(eq(schema.dailyLogs.individualId, id), ne(schema.dailyLogs.health, "")))
      .orderBy(desc(schema.dailyLogs.logDate))
      .limit(20),
    db
      .select({ id: schema.dailyLogs.id, day: schema.dailyLogs.logDate, text: schema.dailyLogs.behaviours, mood: schema.dailyLogs.mood, staff: staffName })
      .from(schema.dailyLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
      .where(and(eq(schema.dailyLogs.individualId, id), ne(schema.dailyLogs.behaviours, "")))
      .orderBy(desc(schema.dailyLogs.logDate))
      .limit(20),
    db
      .select({ status: schema.medAdministrations.status, n: count() })
      .from(schema.medAdministrations)
      .where(and(eq(schema.medAdministrations.individualId, id), gte(schema.medAdministrations.scheduledFor, since), lte(schema.medAdministrations.scheduledFor, new Date())))
      .groupBy(schema.medAdministrations.status),
    db
      .select()
      .from(schema.incidents)
      .where(and(eq(schema.incidents.individualId, id), inArray(schema.incidents.category, ["injury", "medication_error", "behavioural"])))
      .orderBy(desc(schema.incidents.occurredAt))
      .limit(10),
  ]);
  return { observations, behaviours, doseCounts: Object.fromEntries(exceptions.map(row => [row.status, row.n])) as Partial<Record<string, number>>, incidents };
}

export const logMoodFilters = { any: "Any mood", great: "Great", good: "Good", okay: "Okay", low: "Low", distressed: "Distressed", concern: "Low or distressed" } as const;
export const logPageSizes = [10, 25, 50] as const;

/* Every daily log for the person, newest first, with paging and a mood filter. */
export async function personLogs(id: string, options: { mood: keyof typeof logMoodFilters; page: number; per: number }) {
  const moodWhere =
    options.mood === "any"
      ? undefined
      : options.mood === "concern"
        ? inArray(schema.dailyLogs.mood, ["low", "distressed"])
        : eq(schema.dailyLogs.mood, options.mood);
  const where = and(eq(schema.dailyLogs.individualId, id), moodWhere);
  const [[{ total }], moods] = await Promise.all([
    db.select({ total: count() }).from(schema.dailyLogs).where(where),
    db.select({ mood: schema.dailyLogs.mood, n: count() }).from(schema.dailyLogs).where(and(eq(schema.dailyLogs.individualId, id), gte(schema.dailyLogs.logDate, addDays(dateKey(), -29)))).groupBy(schema.dailyLogs.mood),
  ]);
  const pages = Math.max(1, Math.ceil(total / options.per));
  const page = Math.min(options.page, pages);
  const rows = await db
    .select({ log: schema.dailyLogs, staff: staffName })
    .from(schema.dailyLogs)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
    .where(where)
    .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.createdAt))
    .limit(options.per)
    .offset((page - 1) * options.per);
  const goals = await goalsForLogs(rows.map(row => row.log.id));
  return { rows, goals, total, page, pages, moods: Object.fromEntries(moods.map(row => [row.mood, row.n])) as Partial<Record<string, number>> };
}

/* Every incident about this person, with who reported it and the filing state. */
export function personIncidents(id: string) {
  return db
    .select({
      id: schema.incidents.id,
      occurredAt: schema.incidents.occurredAt,
      category: schema.incidents.category,
      severity: schema.incidents.severity,
      status: schema.incidents.status,
      reportable: schema.incidents.reportable,
      stateFiledAt: schema.incidents.stateFiledAt,
      description: schema.incidents.description,
      actionsTaken: schema.incidents.actionsTaken,
      createdAt: schema.incidents.createdAt,
      home: schema.homes.name,
      reporter: staffName,
    })
    .from(schema.incidents)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.incidents.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.incidents.reportedBy))
    .where(eq(schema.incidents.individualId, id))
    .orderBy(desc(schema.incidents.occurredAt));
}

/* Tasks linked to the person: open ones first by due time, then the most recently finished. */
export async function personTasks(id: string) {
  const rows = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      details: schema.tasks.details,
      dueAt: schema.tasks.dueAt,
      priority: schema.tasks.priority,
      status: schema.tasks.status,
      completedAt: schema.tasks.completedAt,
      createdAt: schema.tasks.createdAt,
      assignee: staffName,
    })
    .from(schema.tasks)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.tasks.assignedTo))
    .where(eq(schema.tasks.individualId, id))
    .orderBy(sql`case ${schema.tasks.status} when 'open' then 0 else 1 end`, sql`${schema.tasks.dueAt} asc nulls last`, desc(schema.tasks.completedAt))
    .limit(100);
  return { open: rows.filter(row => row.status === "open"), done: rows.filter(row => row.status === "done").slice(0, 20) };
}

export type HistoryEvent = { at: Date; title: string; detail: string; by?: string | null; kind: "start" | "end" | "edit" | "goal" | "med" | "incident" };

/* The life of the record: support starting and ending, goals, medication orders, incidents and edits. */
export async function personHistory(id: string, person: typeof schema.individuals.$inferSelect) {
  const [goals, meds, incidents, edits] = await Promise.all([
    db.select().from(schema.planGoals).where(eq(schema.planGoals.individualId, id)),
    db.select().from(schema.medications).where(eq(schema.medications.individualId, id)),
    db.select({ id: schema.incidents.id, at: schema.incidents.occurredAt, category: schema.incidents.category, severity: schema.incidents.severity }).from(schema.incidents).where(eq(schema.incidents.individualId, id)),
    db
      .select({ at: schema.auditLog.at, action: schema.auditLog.action, by: schema.users.name })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
      .where(and(eq(schema.auditLog.entity, "individual"), eq(schema.auditLog.entityId, id)))
      .orderBy(desc(schema.auditLog.at))
      .limit(40),
  ]);
  const editText: Record<string, [string, HistoryEvent["kind"]]> = {
    create: ["Record created", "start"],
    update: ["Details edited", "edit"],
    "individual:discharge": ["Support ended", "end"],
    "individual:readmit": ["Readmitted", "start"],
  };
  const events: HistoryEvent[] = [
    ...(person.admittedAt ? [{ at: new Date(`${person.admittedAt}T12:00:00Z`), title: "Support started", detail: "Admitted to our services.", kind: "start" as const }] : []),
    ...goals.map(goal => ({ at: goal.createdAt, title: "Goal added", detail: goal.title + (goal.status !== "active" ? ` (now ${goal.status})` : ""), kind: "goal" as const })),
    ...meds.flatMap(med => [
      ...(med.startedAt ? [{ at: med.startedAt, title: "Medication started", detail: `${med.name} ${med.dose}, ${med.times.join(", ")}`, kind: "med" as const }] : []),
      ...(med.stoppedAt ? [{ at: med.stoppedAt, title: "Medication stopped", detail: `${med.name} ${med.dose}${med.stopReason ? `. ${med.stopReason}` : ""}`, kind: "med" as const }] : []),
    ]),
    ...incidents.map(incident => ({ at: incident.at, title: "Incident", detail: `${incident.category.replace("_", " ")}, ${incident.severity} severity`, kind: "incident" as const })),
    ...edits.map(edit => {
      const [title, kind] = editText[edit.action] ?? [edit.action, "edit" as const];
      return { at: edit.at, title, detail: "", by: edit.by, kind };
    }),
  ];
  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 80);
}
