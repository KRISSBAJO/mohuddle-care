import "server-only";
import { and, count, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { dateKey } from "@/lib/format";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ensureMedicationRecords } from "./hub";

/* Every option the people list understands. Anything else in the address bar falls back to a default. */
export const peopleSorts = { name: "Name", age: "Age", service: "Service", home: "Home", admitted: "Support started", lastLog: "Last log" } as const;
export const peopleStatusFilters = { current: "Currently supported", discharged: "Discharged", all: "Everyone" } as const;
export const peopleAttentionFilters = {
  any: "Anything today",
  "no-log": "No log today",
  "late-meds": "Late medication",
  incident: "Open incident",
  allergies: "Has allergies",
} as const;
export const peoplePageSizes = [10, 25, 50] as const;

export type PeopleQuery = {
  q: string;
  service: string;
  home: string;
  status: keyof typeof peopleStatusFilters;
  attention: keyof typeof peopleAttentionFilters;
  sort: keyof typeof peopleSorts;
  dir: "asc" | "desc";
  page: number;
  per: (typeof peoplePageSizes)[number];
};

export const peopleDefaults: PeopleQuery = { q: "", service: "", home: "", status: "current", attention: "any", sort: "name", dir: "asc", page: 1, per: 25 };

export function parsePeopleQuery(params: Record<string, string | string[] | undefined>): PeopleQuery {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const among = <T extends string>(value: string | undefined, allowed: T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const per = Number(one("per"));
  return {
    q: (one("q") ?? "").trim().slice(0, 120),
    service: (schema.serviceType.enumValues as readonly string[]).includes(one("service") ?? "") ? one("service")! : "",
    home: /^[0-9a-f-]{36}$|^none$/.test(one("home") ?? "") ? one("home")! : "",
    status: among(one("status"), Object.keys(peopleStatusFilters) as PeopleQuery["status"][], "current"),
    attention: among(one("attention"), Object.keys(peopleAttentionFilters) as PeopleQuery["attention"][], "any"),
    sort: among(one("sort"), Object.keys(peopleSorts) as PeopleQuery["sort"][], "name"),
    dir: one("dir") === "desc" ? "desc" : "asc",
    page: Math.max(1, Math.min(10_000, Math.floor(Number(one("page")) || 1))),
    per: (peoplePageSizes as readonly number[]).includes(per) ? (per as PeopleQuery["per"]) : 25,
  };
}

export async function searchPeople(query: PeopleQuery) {
  const settings = await getSettings();
  const today = dateKey();
  // Today's doses only exist once something has asked for them; the list counts late ones, so ask.
  await ensureMedicationRecords(today);
  const lateBefore = new Date(Date.now() - settings.med_late_minutes * 60_000);
  const personId = schema.individuals.id;

  const lastLog = sql<string | null>`(select max(l.log_date) from daily_logs l where l.individual_id = ${personId})`;
  const loggedToday = sql<boolean>`exists (select 1 from daily_logs l where l.individual_id = ${personId} and l.log_date = ${today})`;
  // Same rule as the Today page: any dose still unsigned after the late window, from any day.
  const lateDoses = sql<number>`(select count(*) from med_administrations a where a.individual_id = ${personId} and a.status = 'due' and a.scheduled_for <= ${lateBefore.toISOString()})`;
  const openIncidents = sql<number>`(select count(*) from incidents i where i.individual_id = ${personId} and i.status <> 'closed')`;
  const activeGoals = sql<number>`(select count(*) from plan_goals g where g.individual_id = ${personId} and g.status = 'active')`;
  const activeMeds = sql<number>`(select count(*) from medications m where m.individual_id = ${personId} and m.active)`;

  const conditions: (SQL | undefined)[] = [];
  if (query.status === "current") conditions.push(eq(schema.individuals.active, true));
  if (query.status === "discharged") conditions.push(eq(schema.individuals.active, false));
  if (query.q) {
    const term = `%${query.q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    conditions.push(
      or(
        ilike(sql`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`, term),
        ilike(schema.homes.name, term),
        ilike(schema.individuals.guardianName, term),
      ),
    );
  }
  if (query.service) conditions.push(eq(schema.individuals.serviceType, query.service as (typeof schema.serviceType.enumValues)[number]));
  if (query.home === "none") conditions.push(isNull(schema.individuals.homeId));
  else if (query.home) conditions.push(eq(schema.individuals.homeId, query.home));
  if (query.attention === "no-log") conditions.push(sql`not ${loggedToday}`);
  if (query.attention === "late-meds") conditions.push(sql`${lateDoses} > 0`);
  if (query.attention === "incident") conditions.push(sql`${openIncidents} > 0`);
  if (query.attention === "allergies") conditions.push(sql`${schema.individuals.allergies} <> ''`);
  const where = and(...conditions);

  const direction = query.dir === "desc" ? sql`desc` : sql`asc`;
  const nameOrder = [sql`${schema.individuals.firstName} asc`, sql`${schema.individuals.lastName} asc`];
  const order = {
    name: [sql`${schema.individuals.firstName} ${direction}`, sql`${schema.individuals.lastName} ${direction}`],
    // Ascending age means youngest first, which is the latest date of birth first.
    age: [sql`${schema.individuals.dob} ${query.dir === "asc" ? sql`desc` : sql`asc`} nulls last`, ...nameOrder],
    service: [sql`${schema.individuals.serviceType} ${direction}`, ...nameOrder],
    home: [sql`${schema.homes.name} ${direction} nulls last`, ...nameOrder],
    admitted: [sql`${schema.individuals.admittedAt} ${direction} nulls last`, ...nameOrder],
    lastLog: [sql`${lastLog} ${direction} nulls first`, ...nameOrder],
  }[query.sort];

  const [{ n: total }] = await db
    .select({ n: count() })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(where);
  const pages = Math.max(1, Math.ceil(total / query.per));
  const page = Math.min(query.page, pages);

  const rows = await db
    .select({
      id: schema.individuals.id,
      firstName: schema.individuals.firstName,
      lastName: schema.individuals.lastName,
      dob: schema.individuals.dob,
      serviceType: schema.individuals.serviceType,
      admittedAt: schema.individuals.admittedAt,
      allergies: schema.individuals.allergies,
      active: schema.individuals.active,
      dischargedAt: schema.individuals.dischargedAt,
      home: schema.homes.name,
      lastLog,
      loggedToday,
      lateDoses,
      openIncidents,
      activeGoals,
      activeMeds,
    })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(where)
    .orderBy(...order)
    .limit(query.per)
    .offset((page - 1) * query.per);

  // Totals for the summary tiles, always across people currently supported.
  const [summary] = await db
    .select({
      current: sql<number>`count(*) filter (where ${schema.individuals.active})`,
      discharged: sql<number>`count(*) filter (where not ${schema.individuals.active})`,
      noLog: sql<number>`count(*) filter (where ${schema.individuals.active} and not ${loggedToday})`,
      late: sql<number>`count(*) filter (where ${schema.individuals.active} and ${lateDoses} > 0)`,
      incident: sql<number>`count(*) filter (where ${schema.individuals.active} and ${openIncidents} > 0)`,
    })
    .from(schema.individuals);

  return {
    rows: rows.map(row => ({ ...row, lateDoses: Number(row.lateDoses), openIncidents: Number(row.openIncidents), activeGoals: Number(row.activeGoals), activeMeds: Number(row.activeMeds) })),
    total,
    page,
    pages,
    today,
    logDueHour: settings.daily_log_due_hour,
    summary: {
      current: Number(summary.current),
      discharged: Number(summary.discharged),
      noLog: Number(summary.noLog),
      late: Number(summary.late),
      incident: Number(summary.incident),
    },
  };
}
