import "server-only";
import { and, count, desc, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

/* Every option the incidents list understands. Anything else in the address bar falls back to a default. */
export const incidentSorts = {
  occurred: "When it happened",
  severity: "Severity",
  deadline: "Filing deadline",
  status: "Status",
  category: "Category",
  person: "Person",
  home: "Home",
} as const;
export const incidentPeriods = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "Any time" } as const;
export const incidentAttention = {
  any: "Anything",
  "filing-overdue": "Not filed, overdue",
  "filing-due": "Not filed, still in time",
  serious: "High or critical, not closed",
  "no-actions": "No actions recorded",
} as const;
export const incidentStatusFilters = { all: "Any status", active: "Open or under review", open: "Open", under_review: "Under review", closed: "Closed" } as const;
export const incidentPageSizes = [10, 25, 50] as const;

export type IncidentQuery = {
  q: string;
  status: keyof typeof incidentStatusFilters;
  category: string;
  severity: string;
  home: string;
  person: string;
  reportable: "any" | "yes" | "no";
  period: keyof typeof incidentPeriods;
  attention: keyof typeof incidentAttention;
  sort: keyof typeof incidentSorts;
  dir: "asc" | "desc";
  page: number;
  per: (typeof incidentPageSizes)[number];
};

export const incidentDefaults: IncidentQuery = {
  q: "",
  status: "all",
  category: "",
  severity: "",
  home: "",
  person: "",
  reportable: "any",
  period: "90",
  attention: "any",
  sort: "occurred",
  dir: "desc",
  page: 1,
  per: 25,
};

/* The direction each sort starts in when none is given: newest, most severe and soonest first. */
export const naturalDir = (sort: IncidentQuery["sort"]): "asc" | "desc" => (["deadline", "category", "person", "home", "status"].includes(sort) ? "asc" : "desc");

export function parseIncidentQuery(params: Record<string, string | string[] | undefined>): IncidentQuery {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const among = <T extends string>(value: string | undefined, allowed: T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const uuidOrEmpty = (value: string | undefined, extra: string[] = []) => (value && (/^[0-9a-f-]{36}$/.test(value) || extra.includes(value)) ? value : "");
  const sort = among(one("sort"), Object.keys(incidentSorts) as IncidentQuery["sort"][], "occurred");
  const per = Number(one("per"));
  const dir = one("dir");
  return {
    q: (one("q") ?? "").trim().slice(0, 120),
    status: among(one("status"), Object.keys(incidentStatusFilters) as IncidentQuery["status"][], "all"),
    category: (schema.incidentCategory.enumValues as readonly string[]).includes(one("category") ?? "") ? one("category")! : "",
    severity: (schema.incidentSeverity.enumValues as readonly string[]).includes(one("severity") ?? "") ? one("severity")! : "",
    home: uuidOrEmpty(one("home"), ["none"]),
    person: uuidOrEmpty(one("person")),
    reportable: among(one("reportable"), ["any", "yes", "no"], "any"),
    period: among(one("period"), Object.keys(incidentPeriods) as IncidentQuery["period"][], "90"),
    attention: among(one("attention"), Object.keys(incidentAttention) as IncidentQuery["attention"][], "any"),
    sort,
    dir: dir === "asc" || dir === "desc" ? dir : naturalDir(sort),
    page: Math.max(1, Math.min(10_000, Math.floor(Number(one("page")) || 1))),
    per: (incidentPageSizes as readonly number[]).includes(per) ? (per as IncidentQuery["per"]) : 25,
  };
}

/* The filters as SQL, shared by the list, its count and the CSV export. */
async function incidentWhere(query: IncidentQuery) {
  const settings = await getSettings();
  const i = schema.incidents;
  const now = new Date();
  const deadline = sql`(${i.occurredAt} + make_interval(hours => ${settings.incident_report_hours}))`;
  const conditions: (SQL | undefined)[] = [];
  if (query.status === "active") conditions.push(sql`${i.status} <> 'closed'`);
  else if (query.status !== "all") conditions.push(eq(i.status, query.status));
  if (query.category) conditions.push(eq(i.category, query.category as (typeof schema.incidentCategory.enumValues)[number]));
  if (query.severity) conditions.push(eq(i.severity, query.severity as (typeof schema.incidentSeverity.enumValues)[number]));
  if (query.home === "none") conditions.push(isNull(i.homeId));
  else if (query.home) conditions.push(eq(i.homeId, query.home));
  if (query.person) conditions.push(eq(i.individualId, query.person));
  if (query.reportable === "yes") conditions.push(eq(i.reportable, true));
  if (query.reportable === "no") conditions.push(eq(i.reportable, false));
  if (query.period !== "all") conditions.push(gte(i.occurredAt, new Date(now.getTime() - Number(query.period) * 86_400_000)));
  if (query.q) {
    const term = `%${query.q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    conditions.push(
      sql`(${i.description} ilike ${term} or ${i.actionsTaken} ilike ${term} or (${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}) ilike ${term} or ${schema.homes.name} ilike ${term})`,
    );
  }
  // A reportable incident is waiting to be filed until a filing date is recorded, whatever its status.
  if (query.attention === "filing-overdue") conditions.push(sql`${i.reportable} and ${i.stateFiledAt} is null and ${deadline} < ${now.toISOString()}`);
  if (query.attention === "filing-due") conditions.push(sql`${i.reportable} and ${i.stateFiledAt} is null and ${deadline} >= ${now.toISOString()}`);
  if (query.attention === "serious") conditions.push(sql`${i.severity} in ('high', 'critical') and ${i.status} <> 'closed'`);
  if (query.attention === "no-actions") conditions.push(sql`trim(${i.actionsTaken}) = ''`);
  return { where: and(...conditions), deadline, hours: settings.incident_report_hours };
}

function baseSelect(deadline: SQL) {
  const i = schema.incidents;
  return db
    .select({
      id: i.id,
      occurredAt: i.occurredAt,
      createdAt: i.createdAt,
      closedAt: i.closedAt,
      category: i.category,
      severity: i.severity,
      status: i.status,
      reportable: i.reportable,
      stateFiledAt: i.stateFiledAt,
      stateReference: i.stateReference,
      description: i.description,
      actionsTaken: i.actionsTaken,
      individualId: i.individualId,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      homeId: i.homeId,
      home: schema.homes.name,
      reporter: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
      deadline: sql<string>`${deadline}`,
    })
    .from(i)
    .leftJoin(schema.individuals, eq(schema.individuals.id, i.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, i.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, i.reportedBy));
}

function orderFor(query: IncidentQuery, deadline: SQL) {
  const i = schema.incidents;
  const dir = query.dir === "desc" ? sql`desc` : sql`asc`;
  const newest = sql`${i.occurredAt} desc`;
  const severityRank = sql`case ${i.severity} when 'critical' then 4 when 'high' then 3 when 'moderate' then 2 else 1 end`;
  const statusRank = sql`case ${i.status} when 'open' then 1 when 'under_review' then 2 else 3 end`;
  return {
    occurred: [sql`${i.occurredAt} ${dir}`],
    severity: [sql`${severityRank} ${dir}`, newest],
    // Only reportable incidents that are not closed have a live deadline; the rest go last.
    deadline: [sql`case when ${i.reportable} and ${i.stateFiledAt} is null then 0 else 1 end asc`, sql`${deadline} ${dir}`, newest],
    status: [sql`${statusRank} ${dir}`, newest],
    category: [sql`${i.category}::text ${dir}`, newest],
    person: [sql`${schema.individuals.firstName} ${dir} nulls last`, sql`${schema.individuals.lastName} ${dir}`, newest],
    home: [sql`${schema.homes.name} ${dir} nulls last`, newest],
  }[query.sort];
}

export async function searchIncidents(query: IncidentQuery) {
  const { where, deadline, hours } = await incidentWhere(query);
  const [{ n: total }] = await db
    .select({ n: count() })
    .from(schema.incidents)
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.incidents.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.incidents.homeId))
    .where(where);
  const pages = Math.max(1, Math.ceil(total / query.per));
  const page = Math.min(query.page, pages);
  const rows = await baseSelect(deadline)
    .where(where)
    .orderBy(...orderFor(query, deadline))
    .limit(query.per)
    .offset((page - 1) * query.per);

  // Totals for the tiles and the category chart, across everything, whatever the filters.
  const now = new Date().toISOString();
  const i = schema.incidents;
  const [summary] = await db
    .select({
      open: sql<number>`count(*) filter (where ${i.status} = 'open')`,
      review: sql<number>`count(*) filter (where ${i.status} = 'under_review')`,
      overdue: sql<number>`count(*) filter (where ${i.reportable} and ${i.stateFiledAt} is null and ${deadline} < ${now})`,
      dueSoon: sql<number>`count(*) filter (where ${i.reportable} and ${i.stateFiledAt} is null and ${deadline} >= ${now})`,
      serious: sql<number>`count(*) filter (where ${i.severity} in ('high', 'critical') and ${i.status} <> 'closed')`,
      last30: sql<number>`count(*) filter (where ${i.occurredAt} >= now() - interval '30 days')`,
      prior30: sql<number>`count(*) filter (where ${i.occurredAt} >= now() - interval '60 days' and ${i.occurredAt} < now() - interval '30 days')`,
    })
    .from(i);
  const byCategory = await db
    .select({ category: i.category, n: count() })
    .from(i)
    .where(gte(i.occurredAt, sql`now() - interval '90 days'`))
    .groupBy(i.category)
    .orderBy(desc(count()));

  const num = (value: unknown) => Number(value ?? 0);
  return {
    rows: rows.map(row => ({ ...row, deadline: new Date(row.deadline) })),
    total,
    page,
    pages,
    hours,
    summary: {
      open: num(summary.open),
      review: num(summary.review),
      overdue: num(summary.overdue),
      dueSoon: num(summary.dueSoon),
      serious: num(summary.serious),
      last30: num(summary.last30),
      prior30: num(summary.prior30),
    },
    byCategory: byCategory.map(row => ({ category: row.category, n: num(row.n) })),
  };
}

/* The filtered list without paging, for the spreadsheet export. Capped so one request stays small. */
export async function exportIncidents(query: IncidentQuery) {
  const { where, deadline } = await incidentWhere(query);
  const rows = await baseSelect(deadline).where(where).orderBy(...orderFor(query, deadline)).limit(5000);
  return rows.map(row => ({ ...row, deadline: new Date(row.deadline) }));
}

export const incidentFilterOptions = async () => {
  const homes = await db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).orderBy(schema.homes.name);
  const people = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName })
    .from(schema.individuals)
    .orderBy(schema.individuals.firstName, schema.individuals.lastName);
  return { homes, people };
};

/* Everything the incident page shows: the report, the person, the timeline and related incidents. */
export async function incidentRecord(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const settings = await getSettings();
  const i = schema.incidents;
  const [row] = await db
    .select({
      incident: i,
      person: schema.individuals,
      home: schema.homes.name,
      reporter: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
      filedBy: sql<string | null>`(select u.name from users u where u.id = ${i.stateFiledBy})`,
    })
    .from(i)
    .leftJoin(schema.individuals, eq(schema.individuals.id, i.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, i.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, i.reportedBy))
    .where(eq(i.id, id))
    .limit(1);
  if (!row) return null;

  const notes = await db
    .select({ id: schema.incidentNotes.id, kind: schema.incidentNotes.kind, body: schema.incidentNotes.body, at: schema.incidentNotes.createdAt, by: schema.users.name })
    .from(schema.incidentNotes)
    .leftJoin(schema.users, eq(schema.users.id, schema.incidentNotes.userId))
    .where(eq(schema.incidentNotes.incidentId, id));
  // Status changes made before the timeline existed were only in the audit log.
  const legacy = await db
    .select({ id: schema.auditLog.id, action: schema.auditLog.action, at: schema.auditLog.at, by: schema.users.name })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(and(eq(schema.auditLog.entity, "incident"), eq(schema.auditLog.entityId, id), sql`${schema.auditLog.action} in ('incident:under_review', 'incident:closed', 'incident:open')`));
  const legacyText: Record<string, string> = { "incident:under_review": "Review started.", "incident:closed": "Closed.", "incident:open": "Reopened." };
  const timeline = [
    { id: "reported", kind: "reported", body: "Incident reported.", at: row.incident.createdAt, by: row.reporter },
    ...notes,
    ...legacy.map(entry => ({ id: entry.id, kind: entry.action.replace("incident:", ""), body: legacyText[entry.action], at: entry.at, by: entry.by })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const others = row.person
    ? await db
        .select({ id: i.id, occurredAt: i.occurredAt, category: i.category, severity: i.severity, status: i.status })
        .from(i)
        .where(and(eq(i.individualId, row.person.id), sql`${i.id} <> ${id}`))
        .orderBy(desc(i.occurredAt))
        .limit(5)
    : [];

  return {
    ...row,
    deadline: new Date(row.incident.occurredAt.getTime() + settings.incident_report_hours * 3_600_000),
    hours: settings.incident_report_hours,
    timeline,
    others,
  };
}
