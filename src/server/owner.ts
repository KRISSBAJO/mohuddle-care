import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { DEFAULT_DOCUMENT_TYPES, DEFAULT_NOTE_SECTIONS, DEFAULT_SHIFT_PATTERNS } from "@/lib/agency-defaults";
import { DEFAULT_TEMPLATES } from "@/lib/default-sign-templates";
import { NOTE_LIBRARY } from "@/lib/note-library";
import { emailLoginLink, issueLoginLink, loginUsedElsewhere } from "./accounts";
import { emailNote } from "./email";
import { asAgency, db, schema, systemDb } from "./db";

/*
 * The owner console: Mohuddle's own view across every agency. Only logins flagged as owners may use
 * it (scripts/make-owner.ts). It works through the database owner, so every function here checks
 * nothing about agencies itself; the console's pages and actions call requireOwner() (guard.ts) first.
 */

export async function isOwner(loginId: string) {
  const [row] = await systemDb.select({ isOwner: schema.logins.isOwner }).from(schema.logins).where(eq(schema.logins.id, loginId)).limit(1);
  return row?.isOwner ?? false;
}

// Web address names that would clash with Mohuddle's own addresses.
const RESERVED = new Set(["app", "www", "api", "admin", "owner", "mohuddle", "mail", "email", "docs", "help", "support", "status", "login", "static", "assets", "cdn", "dev", "test", "staging", "demo"]);

/* Why a web address name cannot be used, or null when it can. */
export function slugProblem(slug: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return "Use 3 to 40 lowercase letters, numbers and dashes, starting and ending with a letter or number.";
  if (slug.includes("--")) return "Use single dashes only.";
  if (RESERVED.has(slug)) return "That name is kept for Mohuddle itself. Choose another.";
  return null;
}

/* Every agency, with how big it is and when someone last used it. */
export async function listAgencies() {
  // The counts name "agencies"."id" in full: inside a subquery a bare "id" would mean the subquery's own table.
  const a = schema.agencies;
  return systemDb
    .select({
      id: a.id,
      slug: a.slug,
      name: a.name,
      active: a.active,
      createdAt: a.createdAt,
      logins: sql<number>`(select count(*)::int from ${schema.users} u where u.agency_id = "agencies"."id" and u.active)`,
      staff: sql<number>`(select count(*)::int from ${schema.staff} s where s.agency_id = "agencies"."id" and s.active)`,
      people: sql<number>`(select count(*)::int from ${schema.individuals} i where i.agency_id = "agencies"."id" and i.active)`,
      homes: sql<number>`(select count(*)::int from ${schema.homes} h where h.agency_id = "agencies"."id" and h.active)`,
      lastSeen: sql<Date | null>`(select max(s.last_seen_at) from ${schema.sessions} s where s.agency_id = "agencies"."id")`,
    })
    .from(a)
    .orderBy(desc(a.active), asc(a.name));
}

/* One agency's profile and its administrators. */
export async function agencyDetail(id: string) {
  const [agency] = await systemDb.select().from(schema.agencies).where(eq(schema.agencies.id, id)).limit(1);
  if (!agency) return null;
  const admins = await systemDb
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, active: schema.users.active, hasPassword: schema.logins.hasPassword })
    .from(schema.users)
    .innerJoin(schema.logins, eq(schema.logins.id, schema.users.loginId))
    .where(and(eq(schema.users.agencyId, id), eq(schema.users.role, "admin")))
    .orderBy(asc(schema.users.name));
  return { agency, admins };
}

export type AgencyProfile = { name: string; legalName: string; phone: string; email: string; address: string; cityStateZip: string; timezone: string };

/* What a new agency starts with. Runs as that agency, so every row lands there and nowhere else. */
async function setUpDefaults() {
  await db.transaction(async tx => {
    const types = await tx.insert(schema.documentTypes).values(DEFAULT_DOCUMENT_TYPES).returning({ id: schema.documentTypes.id, name: schema.documentTypes.name });
    await tx.insert(schema.signTemplates).values(
      DEFAULT_TEMPLATES.map(template => ({ title: template.title, category: template.category, body: template.body, initialEach: true, typeId: types.find(type => type.name === template.typeName)?.id ?? null })),
    );
    await tx.insert(schema.shiftPatterns).values(DEFAULT_SHIFT_PATTERNS);
    await tx.insert(schema.noteRequirements).values([
      ...DEFAULT_NOTE_SECTIONS.map(section => ({ scope: "all" as const, kind: "section" as const, section, enabled: true })),
      ...NOTE_LIBRARY.map(item => ({ scope: "all" as const, kind: "item" as const, enabled: false, required: true, fieldType: "yes_no", ...item })),
    ]);
  });
}

export type AdminResult = { error?: string; link?: string; expiresAt?: Date; note?: string; emailed?: string };

/*
 * Gives someone an administrator login in an agency, with a staff record. Someone who already signs
 * in to Mohuddle for another agency keeps their password and simply gains this agency.
 */
export async function addAgencyAdmin(agencyId: string, input: { name: string; email: string }): Promise<AdminResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const [login] = await systemDb.select({ id: schema.logins.id, hasPassword: schema.logins.hasPassword }).from(schema.logins).where(eq(schema.logins.email, email)).limit(1);
  const shared = login ? await loginUsedElsewhere(login.id, agencyId) : false;
  if (shared && !login.hasPassword) return { error: "This email has an unfinished invitation from another agency. Ask them to finish setting it up first." };
  return asAgency(agencyId, async () => {
    const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (taken) return { error: "This email already has a login in this agency." };
    const loginId = login?.id ?? (await systemDb.insert(schema.logins).values({ email }).returning({ id: schema.logins.id }))[0].id;
    const [first, ...rest] = name.split(/\s+/);
    return db.transaction(async tx => {
      let [member] = await tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.email, email)).limit(1);
      if (!member) [member] = await tx.insert(schema.staff).values({ firstName: first, lastName: rest.join(" ") || "-", role: "admin", email }).returning({ id: schema.staff.id });
      const [user] = await tx.insert(schema.users).values({ email, name, role: "admin", staffId: member.id, loginId }).returning({ id: schema.users.id });
      await tx.insert(schema.auditLog).values({ action: "owner:admin:add", entity: "user", entityId: user.id });
      if (shared) return { note: `${name} already signs in to Mohuddle for another agency. They use the password they have, and can now switch to this agency.` } as AdminResult;
      const link = await issueLoginLink(tx, user.id, "invite", null);
      return { link: link.url, expiresAt: link.expiresAt } as AdminResult;
    }).then(async result => (result.link ? { ...result, emailed: emailNote(email, await emailLoginLink("invite", { email, name }, { url: result.link, expiresAt: result.expiresAt! }, null)) } : result));
  });
}

/*
 * A new setup link for an agency's administrator, replacing any unused one. Not for a login another
 * agency also uses: that password is theirs to change, from their Account page.
 */
export async function newAdminLink(agencyId: string, userId: string): Promise<AdminResult> {
  const [admin] = await systemDb
    .select({ loginId: schema.users.loginId, active: schema.users.active, email: schema.users.email, name: schema.users.name, hasPassword: schema.logins.hasPassword })
    .from(schema.users)
    .innerJoin(schema.logins, eq(schema.logins.id, schema.users.loginId))
    .where(and(eq(schema.users.id, userId), eq(schema.users.agencyId, agencyId), eq(schema.users.role, "admin")))
    .limit(1);
  if (!admin) return { error: "Unknown administrator." };
  if (!admin.active) return { error: "This login is turned off." };
  if (await loginUsedElsewhere(admin.loginId, agencyId)) return { error: "This person also works for another agency, so only they can change their password." };
  const purpose = admin.hasPassword ? "reset" : "invite";
  return asAgency(agencyId, async () => {
    const link = await db.transaction(async tx => {
      const issued = await issueLoginLink(tx, userId, purpose, null);
      await tx.insert(schema.auditLog).values({ action: "owner:admin:link", entity: "user", entityId: userId });
      return issued;
    });
    const emailed = await emailLoginLink(purpose, { email: admin.email, name: admin.name }, link, null);
    return { link: link.url, expiresAt: link.expiresAt, emailed: emailNote(admin.email, emailed) };
  });
}

/* A new agency, set up with the defaults and its first administrator. */
export async function createAgency(slug: string, profile: AgencyProfile, admin: { name: string; email: string }) {
  const problem = slugProblem(slug);
  if (problem) return { error: problem };
  const [clash] = await systemDb.select({ id: schema.agencies.id }).from(schema.agencies).where(eq(schema.agencies.slug, slug)).limit(1);
  if (clash) return { error: "Another agency already uses that web address." };
  const [agency] = await systemDb.insert(schema.agencies).values({ slug, ...profile }).returning({ id: schema.agencies.id });
  try {
    await asAgency(agency.id, setUpDefaults);
  } catch (error) {
    // The defaults went in as one transaction, so nothing else refers to the agency yet.
    await systemDb.delete(schema.agencies).where(eq(schema.agencies.id, agency.id));
    throw error;
  }
  const first = await addAgencyAdmin(agency.id, admin);
  return { agencyId: agency.id, admin: first };
}

const PROFILE_WORDS: Record<keyof AgencyProfile, string> = { name: "name", legalName: "legal name", phone: "phone", email: "office email", address: "address", cityStateZip: "city, state and ZIP", timezone: "time zone" };

/* Saves an agency's profile and says what changed, in words. */
export async function updateAgencyProfile(id: string, profile: AgencyProfile) {
  const [before] = await systemDb.select().from(schema.agencies).where(eq(schema.agencies.id, id)).limit(1);
  await systemDb.update(schema.agencies).set(profile).where(eq(schema.agencies.id, id));
  return before ? (Object.keys(PROFILE_WORDS) as (keyof AgencyProfile)[]).filter(key => before[key] !== profile[key]).map(key => PROFILE_WORDS[key]) : [];
}

/* One line in the owner activity log. */
export async function recordOwnerEvent(owner: { loginId: string; name: string; email: string }, action: string, agencyId: string | null, detail = "") {
  await systemDb.insert(schema.ownerEvents).values({ loginId: owner.loginId, ownerName: `${owner.name} (${owner.email})`, action, agencyId, detail: detail.slice(0, 500) });
}

/* The owner activity log, newest first, optionally for one agency. */
export function ownerEvents(agencyId?: string) {
  return systemDb
    .select({ id: schema.ownerEvents.id, at: schema.ownerEvents.at, ownerName: schema.ownerEvents.ownerName, action: schema.ownerEvents.action, detail: schema.ownerEvents.detail, agencyId: schema.ownerEvents.agencyId, agency: schema.agencies.name })
    .from(schema.ownerEvents)
    .leftJoin(schema.agencies, eq(schema.agencies.id, schema.ownerEvents.agencyId))
    .where(agencyId ? eq(schema.ownerEvents.agencyId, agencyId) : undefined)
    .orderBy(desc(schema.ownerEvents.at))
    .limit(300);
}

/* Turning an agency off stops every sign-in and signs out everyone there now. Its records stay. */
export async function setAgencyActive(id: string, active: boolean) {
  await systemDb.update(schema.agencies).set({ active }).where(eq(schema.agencies.id, id));
  if (!active) await systemDb.delete(schema.sessions).where(eq(schema.sessions.agencyId, id));
}

export const productEnquiries = () => systemDb.select().from(schema.productEnquiries).orderBy(asc(schema.productEnquiries.handled), desc(schema.productEnquiries.createdAt)).limit(300);

export async function markProductEnquiry(id: string, handled: boolean) {
  await systemDb.update(schema.productEnquiries).set({ handled }).where(eq(schema.productEnquiries.id, id));
}
