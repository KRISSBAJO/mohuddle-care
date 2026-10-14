import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { addDays, dateKey, monthRange, zonedTime } from "@/lib/format";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ensureMedicationRecords } from "./hub";

const currentMonth = () => dateKey().slice(0, 7);

/* Money and issue figures for every home, for the homes list. */
export async function homeSummaries(homeIds: string[]) {
  if (!homeIds.length) return new Map<string, { spentCents: number; pendingCount: number; openIssues: number; urgentIssues: number }>();
  const { from, to } = monthRange(currentMonth());
  const spend = await db
    .select({
      homeId: schema.homeExpenses.homeId,
      spent: sql<number>`coalesce(sum(${schema.homeExpenses.amountCents}) filter (where ${schema.homeExpenses.status} = 'approved'), 0)`,
      pending: sql<number>`count(*) filter (where ${schema.homeExpenses.status} = 'pending')`,
    })
    .from(schema.homeExpenses)
    .where(and(inArray(schema.homeExpenses.homeId, homeIds), gte(schema.homeExpenses.spentOn, from), lt(schema.homeExpenses.spentOn, to)))
    .groupBy(schema.homeExpenses.homeId);
  const issues = await db
    .select({
      homeId: schema.homeIssues.homeId,
      open: count(),
      urgent: sql<number>`count(*) filter (where ${schema.homeIssues.priority} = 'urgent')`,
    })
    .from(schema.homeIssues)
    .where(and(inArray(schema.homeIssues.homeId, homeIds), ne(schema.homeIssues.status, "resolved")))
    .groupBy(schema.homeIssues.homeId);
  return new Map(
    homeIds.map(id => {
      const s = spend.find(row => row.homeId === id);
      const i = issues.find(row => row.homeId === id);
      return [id, { spentCents: Number(s?.spent ?? 0), pendingCount: Number(s?.pending ?? 0), openIssues: Number(i?.open ?? 0), urgentIssues: Number(i?.urgent ?? 0) }];
    }),
  );
}

/* Everything on a home's overview tab. */
export async function homeHub(id: string) {
  const [home] = await db.select().from(schema.homes).where(eq(schema.homes.id, id)).limit(1);
  if (!home) return null;
  const today = dateKey();
  const now = new Date();
  const settings = await getSettings();

  const [manager] = home.managerStaffId
    ? await db.select().from(schema.staff).where(eq(schema.staff.id, home.managerStaffId)).limit(1)
    : [];

  const residents = await db
    .select({
      id: schema.individuals.id,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      allergies: schema.individuals.allergies,
      serviceType: schema.individuals.serviceType,
      meds: sql<number>`(select count(*) from medications m where m.individual_id = ${schema.individuals.id} and m.active)`,
      loggedToday: sql<boolean>`exists (select 1 from daily_logs l where l.individual_id = ${schema.individuals.id} and l.log_date = ${today})`,
    })
    .from(schema.individuals)
    .where(and(eq(schema.individuals.homeId, id), eq(schema.individuals.active, true)))
    .orderBy(asc(schema.individuals.firstName));

  const team = await db
    .select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName, role: schema.staff.role, phone: schema.staff.phone })
    .from(schema.staff)
    .where(and(eq(schema.staff.homeId, id), eq(schema.staff.active, true)))
    .orderBy(asc(schema.staff.firstName));

  const shiftsToday = await db
    .select({
      id: schema.shifts.id,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
      kind: schema.shifts.kind,
      status: schema.shifts.status,
      first: schema.staff.firstName,
      last: schema.staff.lastName,
      phone: schema.staff.phone,
    })
    .from(schema.shifts)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.shifts.staffId))
    .where(and(eq(schema.shifts.homeId, id), lt(schema.shifts.startsAt, zonedTime(addDays(today, 1), "00:00")), gte(schema.shifts.endsAt, zonedTime(today, "00:00")), ne(schema.shifts.status, "missed")))
    .orderBy(asc(schema.shifts.startsAt));

  await ensureMedicationRecords(today);
  const residentIds = residents.map(person => person.id);
  const lateBefore = new Date(now.getTime() - settings.med_late_minutes * 60_000);
  const [meds] = residentIds.length
    ? await db
        .select({
          total: count(),
          given: sql<number>`count(*) filter (where ${schema.medAdministrations.status} = 'given')`,
          late: sql<number>`count(*) filter (where ${schema.medAdministrations.status} = 'due' and ${schema.medAdministrations.scheduledFor} <= ${lateBefore.toISOString()})`,
          nextDue: sql<string | null>`min(${schema.medAdministrations.scheduledFor}) filter (where ${schema.medAdministrations.status} = 'due' and ${schema.medAdministrations.scheduledFor} > ${now.toISOString()})`,
        })
        .from(schema.medAdministrations)
        .where(
          and(
            inArray(schema.medAdministrations.individualId, residentIds),
            gte(schema.medAdministrations.scheduledFor, zonedTime(today, "00:00")),
            lt(schema.medAdministrations.scheduledFor, zonedTime(addDays(today, 1), "00:00")),
          ),
        )
    : [{ total: 0, given: 0, late: 0, nextDue: null }];

  const money = (await homeSummaries([id])).get(id)!;
  const recentIssues = await db
    .select()
    .from(schema.homeIssues)
    .where(and(eq(schema.homeIssues.homeId, id), ne(schema.homeIssues.status, "resolved")))
    .orderBy(sql`case ${schema.homeIssues.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, desc(schema.homeIssues.createdAt))
    .limit(5);

  return {
    home,
    manager: manager ?? null,
    residents: residents.map(person => ({ ...person, meds: Number(person.meds) })),
    team,
    shiftsToday,
    meds: { total: Number(meds.total), given: Number(meds.given), late: Number(meds.late), nextDue: meds.nextDue ? new Date(meds.nextDue) : null },
    money,
    recentIssues,
  };
}

/* A home's medication rounds for a day: every dose for the people living there, by time. */
export async function homeMedRounds(id: string, day: string) {
  await ensureMedicationRecords(day);
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
      individualId: schema.individuals.id,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      allergies: schema.individuals.allergies,
      staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
    })
    .from(schema.medAdministrations)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.medAdministrations.individualId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.medAdministrations.staffId))
    .where(
      and(
        eq(schema.individuals.homeId, id),
        gte(schema.medAdministrations.scheduledFor, zonedTime(day, "00:00")),
        lt(schema.medAdministrations.scheduledFor, zonedTime(addDays(day, 1), "00:00")),
      ),
    )
    .orderBy(asc(schema.medAdministrations.scheduledFor), asc(schema.individuals.firstName), asc(schema.medications.name));
}

/* A home's expenses for one month, with totals by category and status. */
export async function homeExpenseMonth(id: string, month: string) {
  const { from, to } = monthRange(month);
  const reviewer = sql<string | null>`(select u.name from users u where u.id = ${schema.homeExpenses.reviewedBy})`;
  const rows = await db
    .select({
      expense: schema.homeExpenses,
      submitter: schema.users.name,
      reviewer,
    })
    .from(schema.homeExpenses)
    .leftJoin(schema.users, eq(schema.users.id, schema.homeExpenses.submittedBy))
    .where(and(eq(schema.homeExpenses.homeId, id), gte(schema.homeExpenses.spentOn, from), lt(schema.homeExpenses.spentOn, to)))
    .orderBy(desc(schema.homeExpenses.spentOn), desc(schema.homeExpenses.createdAt));
  const approved = rows.filter(row => row.expense.status === "approved");
  const byCategory = new Map<string, number>();
  for (const row of approved) byCategory.set(row.expense.category, (byCategory.get(row.expense.category) ?? 0) + row.expense.amountCents);
  return {
    rows,
    spentCents: approved.reduce((sum, row) => sum + row.expense.amountCents, 0),
    pendingCents: rows.filter(row => row.expense.status === "pending").reduce((sum, row) => sum + row.expense.amountCents, 0),
    pendingCount: rows.filter(row => row.expense.status === "pending").length,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/* A home's issues, newest first within priority; resolved ones last. */
export async function homeIssueList(id: string, status: "active" | "resolved" | "all") {
  const where =
    status === "active"
      ? and(eq(schema.homeIssues.homeId, id), ne(schema.homeIssues.status, "resolved"))
      : status === "resolved"
        ? and(eq(schema.homeIssues.homeId, id), eq(schema.homeIssues.status, "resolved"))
        : eq(schema.homeIssues.homeId, id);
  const rows = await db
    .select({
      issue: schema.homeIssues,
      reporter: schema.users.name,
      assignee: sql<string | null>`(select s.first_name || ' ' || s.last_name from staff s where s.id = ${schema.homeIssues.assignedTo})`,
    })
    .from(schema.homeIssues)
    .leftJoin(schema.users, eq(schema.users.id, schema.homeIssues.reportedBy))
    .where(where)
    .orderBy(
      sql`case ${schema.homeIssues.status} when 'resolved' then 1 else 0 end`,
      sql`case ${schema.homeIssues.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
      desc(schema.homeIssues.createdAt),
    )
    .limit(200);
  const [counts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${schema.homeIssues.status} = 'open')`,
      progress: sql<number>`count(*) filter (where ${schema.homeIssues.status} = 'in_progress')`,
      resolved: sql<number>`count(*) filter (where ${schema.homeIssues.status} = 'resolved')`,
      overdue: sql<number>`count(*) filter (where ${schema.homeIssues.status} <> 'resolved' and ${schema.homeIssues.dueOn} < ${dateKey()})`,
    })
    .from(schema.homeIssues)
    .where(eq(schema.homeIssues.homeId, id));
  return { rows, counts: { open: Number(counts.open), progress: Number(counts.progress), resolved: Number(counts.resolved), overdue: Number(counts.overdue) } };
}

export { currentMonth };

