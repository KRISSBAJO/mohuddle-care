import "server-only";
import { and, count, eq, ilike, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { hasPassword } from "@/server/accounts";
import { addDays, dateKey } from "@/lib/format";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

/* Every option the staff list understands. Anything else in the address bar falls back to a default. */
export const staffSorts = { name: "Name", role: "Job", home: "Home", hired: "Hire date", expiry: "Next expiry" } as const;
export const staffLoginFilters = { any: "Any login", none: "No login", invited: "Invited", on: "Login on", off: "Login off" } as const;
export const staffCredFilters = { any: "Any credentials", expired: "Expired", expiring: "Expiring soon", missing: "None recorded" } as const;
export const staffStatusFilters = { current: "Current staff", left: "Left", all: "Everyone" } as const;
export const staffPageSizes = [10, 25, 50] as const;

export type StaffQuery = {
  q: string;
  role: string;
  home: string;
  status: keyof typeof staffStatusFilters;
  login: keyof typeof staffLoginFilters;
  cred: keyof typeof staffCredFilters;
  sort: keyof typeof staffSorts;
  dir: "asc" | "desc";
  page: number;
  per: (typeof staffPageSizes)[number];
};

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function parseStaffQuery(params: Record<string, string | string[] | undefined>): StaffQuery {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const per = Number(one("per"));
  return {
    q: (one("q") ?? "").trim().slice(0, 120),
    role: (schema.staffRole.enumValues as readonly string[]).includes(one("role") ?? "") ? one("role")! : "",
    home: /^[0-9a-f-]{36}$|^none$/.test(one("home") ?? "") ? one("home")! : "",
    status: pick(one("status"), Object.keys(staffStatusFilters) as StaffQuery["status"][], "current"),
    login: pick(one("login"), Object.keys(staffLoginFilters) as StaffQuery["login"][], "any"),
    cred: pick(one("cred"), Object.keys(staffCredFilters) as StaffQuery["cred"][], "any"),
    sort: pick(one("sort"), Object.keys(staffSorts) as StaffQuery["sort"][], "name"),
    dir: one("dir") === "desc" ? "desc" : "asc",
    page: Math.max(1, Math.min(10_000, Math.floor(Number(one("page")) || 1))),
    per: (staffPageSizes as readonly number[]).includes(per) ? (per as StaffQuery["per"]) : 25,
  };
}

export async function searchStaff(query: StaffQuery) {
  const settings = await getSettings();
  const today = dateKey();
  const warnBy = addDays(today, settings.credential_warning_days);
  const staffId = schema.staff.id;

  const soonest = sql<string | null>`(select min(c.expires_at) from credentials c where c.staff_id = ${staffId})`;
  const hasExpired = sql`exists (select 1 from credentials c where c.staff_id = ${staffId} and c.expires_at < ${today})`;
  const hasExpiring = sql`exists (select 1 from credentials c where c.staff_id = ${staffId} and c.expires_at >= ${today} and c.expires_at <= ${warnBy})`;
  const hasNone = sql`not exists (select 1 from credentials c where c.staff_id = ${staffId})`;

  const conditions: (SQL | undefined)[] = [];
  if (query.status === "current") conditions.push(eq(schema.staff.active, true));
  if (query.status === "left") conditions.push(eq(schema.staff.active, false));
  if (query.q) {
    const term = `%${query.q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    conditions.push(
      or(
        ilike(sql`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`, term),
        ilike(schema.staff.email, term),
        ilike(schema.staff.phone, term),
      ),
    );
  }
  if (query.role) conditions.push(eq(schema.staff.role, query.role as (typeof schema.staffRole.enumValues)[number]));
  if (query.home === "none") conditions.push(isNull(schema.staff.homeId));
  else if (query.home) conditions.push(eq(schema.staff.homeId, query.home));
  if (query.login === "none") conditions.push(isNull(schema.users.id));
  if (query.login === "invited") conditions.push(and(eq(schema.users.active, true), not(hasPassword)));
  if (query.login === "on") conditions.push(and(eq(schema.users.active, true), hasPassword));
  if (query.login === "off") conditions.push(eq(schema.users.active, false));
  if (query.cred === "expired") conditions.push(hasExpired);
  if (query.cred === "expiring") conditions.push(hasExpiring);
  if (query.cred === "missing") conditions.push(hasNone);
  const where = and(...conditions);

  const direction = query.dir === "desc" ? sql`desc` : sql`asc`;
  const nameOrder = [sql`${schema.staff.firstName} asc`, sql`${schema.staff.lastName} asc`];
  const order = {
    name: [sql`${schema.staff.firstName} ${direction}`, sql`${schema.staff.lastName} ${direction}`],
    role: [sql`${schema.staff.role} ${direction}`, ...nameOrder],
    home: [sql`${schema.homes.name} ${direction} nulls last`, ...nameOrder],
    hired: [sql`${schema.staff.hiredAt} ${direction} nulls last`, ...nameOrder],
    expiry: [sql`${soonest} ${direction} nulls last`, ...nameOrder],
  }[query.sort];

  const base = () =>
    db
      .select({ n: count() })
      .from(schema.staff)
      .leftJoin(schema.homes, eq(schema.homes.id, schema.staff.homeId))
      .leftJoin(schema.users, eq(schema.users.staffId, schema.staff.id));
  const [{ n: total }] = await base().where(where);
  const pages = Math.max(1, Math.ceil(total / query.per));
  const page = Math.min(query.page, pages);

  const rows = await db
    .select({
      id: schema.staff.id,
      firstName: schema.staff.firstName,
      lastName: schema.staff.lastName,
      role: schema.staff.role,
      email: schema.staff.email,
      phone: schema.staff.phone,
      active: schema.staff.active,
      hiredAt: schema.staff.hiredAt,
      home: schema.homes.name,
      loginRole: schema.users.role,
      loginActive: schema.users.active,
      loginReady: hasPassword,
      hasLogin: sql<boolean>`${schema.users.id} is not null`,
      soonest,
    })
    .from(schema.staff)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.staff.homeId))
    .leftJoin(schema.users, eq(schema.users.staffId, schema.staff.id))
    .where(where)
    .orderBy(...order)
    .limit(query.per)
    .offset((page - 1) * query.per);

  const credentials = rows.length
    ? await db.select().from(schema.credentials).where(inArray(schema.credentials.staffId, rows.map(row => row.id)))
    : [];

  // Totals for the summary tiles, always across current staff regardless of filters.
  const [summary] = await db
    .select({
      current: sql<number>`count(*) filter (where ${schema.staff.active})`,
      left: sql<number>`count(*) filter (where not ${schema.staff.active})`,
      noLogin: sql<number>`count(*) filter (where ${schema.staff.active} and ${schema.users.id} is null)`,
      expired: sql<number>`count(*) filter (where ${schema.staff.active} and ${hasExpired})`,
      expiring: sql<number>`count(*) filter (where ${schema.staff.active} and ${hasExpiring})`,
    })
    .from(schema.staff)
    .leftJoin(schema.users, eq(schema.users.staffId, schema.staff.id));

  return {
    rows: rows.map(row => ({
      ...row,
      credentials: credentials
        .filter(cred => cred.staffId === row.id)
        .sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999")),
    })),
    total,
    page,
    pages,
    today,
    warningDays: settings.credential_warning_days,
    summary: {
      current: Number(summary.current),
      left: Number(summary.left),
      noLogin: Number(summary.noLogin),
      expired: Number(summary.expired),
      expiring: Number(summary.expiring),
    },
  };
}

/* What a staff member's page shows beyond their record: their next shifts and recent logging. */
export async function staffActivity(id: string) {
  const now = new Date();
  const shifts = await db
    .select({
      id: schema.shifts.id,
      startsAt: schema.shifts.startsAt,
      endsAt: schema.shifts.endsAt,
      kind: schema.shifts.kind,
      status: schema.shifts.status,
      home: schema.homes.name,
    })
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .where(and(eq(schema.shifts.staffId, id), sql`${schema.shifts.endsAt} >= ${now}`))
    .orderBy(schema.shifts.startsAt)
    .limit(6);
  const [logs] = await db
    .select({
      recent: sql<number>`count(*) filter (where ${schema.dailyLogs.logDate} >= ${addDays(dateKey(), -30)})`,
      last: sql<string | null>`max(${schema.dailyLogs.logDate})`,
    })
    .from(schema.dailyLogs)
    .where(eq(schema.dailyLogs.staffId, id));
  return { shifts, logsLast30Days: Number(logs.recent), lastLog: logs.last };
}
