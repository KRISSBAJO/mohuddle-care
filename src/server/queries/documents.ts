import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { addDays, dateKey } from "@/lib/format";
import { appliesToRole, docState, requirementState, type RequirementState } from "@/lib/documents";
import { db, schema } from "@/server/db";

type Category = "staff" | "person" | "business";
const live = inArray(schema.documents.status, ["submitted", "approved", "rejected"]);

export function documentTypes(category?: Category, includeRetired = false) {
  return db
    .select()
    .from(schema.documentTypes)
    .where(and(category ? eq(schema.documentTypes.category, category) : undefined, includeRetired ? undefined : eq(schema.documentTypes.active, true)))
    .orderBy(asc(schema.documentTypes.category), asc(schema.documentTypes.sortOrder), asc(schema.documentTypes.name));
}

type Type = typeof schema.documentTypes.$inferSelect;
type Doc = typeof schema.documents.$inferSelect;
export type Cell = { state: RequirementState; doc: Doc | null };

/* For each required type, where one owner stands: the current document, any open request, and the state. */
function cells(types: Type[], docs: Doc[], openItems: { typeId: string | null }[], today: string) {
  const result: Record<string, Cell> = {};
  for (const type of types) {
    const mine = docs.filter(doc => doc.typeId === type.id);
    const requested = openItems.some(item => item.typeId === type.id);
    const state = requirementState(mine, today, type.reminderDays, requested);
    const best =
      mine.find(doc => ["valid", "expiring"].includes(docState(doc, today, type.reminderDays))) ??
      mine.find(doc => doc.status === "submitted") ??
      mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      null;
    result[type.id] = { state, doc: best };
  }
  return result;
}

async function openItemsFor(where: "staff" | "person", ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ typeId: schema.documentRequestItems.typeId, staffId: schema.documentRequests.staffId, individualId: schema.documentRequests.individualId })
    .from(schema.documentRequestItems)
    .innerJoin(schema.documentRequests, eq(schema.documentRequests.id, schema.documentRequestItems.requestId))
    .where(
      and(
        inArray(schema.documentRequestItems.status, ["pending", "rejected"]),
        isNull(schema.documentRequests.revokedAt),
        where === "staff" ? inArray(schema.documentRequests.staffId, ids) : inArray(schema.documentRequests.individualId, ids),
      ),
    );
}

/* Every active staff member against the documents their role requires. */
export async function staffCompliance() {
  const today = dateKey();
  const [types, people] = await Promise.all([
    documentTypes("staff"),
    db
      .select({ id: schema.staff.id, firstName: schema.staff.firstName, lastName: schema.staff.lastName, role: schema.staff.role, home: schema.homes.name, hiredAt: schema.staff.hiredAt })
      .from(schema.staff)
      .leftJoin(schema.homes, eq(schema.homes.id, schema.staff.homeId))
      .where(eq(schema.staff.active, true))
      .orderBy(asc(schema.staff.firstName), asc(schema.staff.lastName)),
  ]);
  const required = types.filter(type => type.required);
  const ids = people.map(person => person.id);
  const [docs, items] = await Promise.all([
    ids.length ? db.select().from(schema.documents).where(and(inArray(schema.documents.staffId, ids), live)) : [],
    openItemsFor("staff", ids),
  ]);
  const rows = people.map(person => {
    const applicable = required.filter(type => appliesToRole(type.roles, person.role));
    const map = cells(applicable, docs.filter(doc => doc.staffId === person.id), items.filter(item => item.staffId === person.id), today);
    const states = Object.values(map).map(cell => cell.state);
    const ok = states.filter(state => state === "valid" || state === "expiring").length;
    return { person, cells: map, applicable: applicable.map(type => type.id), ok, total: states.length, problems: states.filter(state => state === "missing" || state === "expired" || state === "rejected").length };
  });
  return { types: required, rows };
}

/* Every person supported against the documents everyone needs. */
export async function peopleCompliance() {
  const today = dateKey();
  const [types, people] = await Promise.all([
    documentTypes("person"),
    db
      .select({ id: schema.individuals.id, firstName: schema.individuals.firstName, lastName: schema.individuals.lastName, home: schema.homes.name })
      .from(schema.individuals)
      .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
      .where(eq(schema.individuals.active, true))
      .orderBy(asc(schema.individuals.firstName)),
  ]);
  const required = types.filter(type => type.required);
  const ids = people.map(person => person.id);
  const [docs, items] = await Promise.all([ids.length ? db.select().from(schema.documents).where(and(inArray(schema.documents.individualId, ids), live)) : [], openItemsFor("person", ids)]);
  const rows = people.map(person => {
    const map = cells(required, docs.filter(doc => doc.individualId === person.id), items.filter(item => item.individualId === person.id), today);
    const states = Object.values(map).map(cell => cell.state);
    return { person, cells: map, ok: states.filter(state => state === "valid" || state === "expiring").length, total: states.length, problems: states.filter(state => state === "missing" || state === "expired").length };
  });
  return { types: required, rows };
}

/* The agency's own documents, and each home's, against the business types. */
export async function businessCompliance() {
  const today = dateKey();
  const [types, homes, docs] = await Promise.all([
    documentTypes("business"),
    db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name)),
    db.select().from(schema.documents).where(and(eq(schema.documents.ownerKind, "business"), live)),
  ]);
  const agencyTypes = types.filter(type => !type.perHome);
  const homeTypes = types.filter(type => type.perHome);
  return {
    agencyTypes,
    homeTypes,
    agency: cells(agencyTypes, docs.filter(doc => !doc.homeId), [], today),
    homes: homes.map(home => ({ home, cells: cells(homeTypes, docs.filter(doc => doc.homeId === home.id), [], today) })),
    otherAgency: docs.filter(doc => !doc.homeId && !doc.typeId),
  };
}

/* Documents for one owner, newest first, including replaced versions for the history. */
export async function ownerDocuments(owner: { kind: "staff"; id: string } | { kind: "person"; id: string } | { kind: "business"; homeId: string | null }) {
  const where =
    owner.kind === "staff"
      ? eq(schema.documents.staffId, owner.id)
      : owner.kind === "person"
        ? eq(schema.documents.individualId, owner.id)
        : owner.homeId
          ? eq(schema.documents.homeId, owner.homeId)
          : and(eq(schema.documents.ownerKind, "business"), isNull(schema.documents.homeId));
  return db.select().from(schema.documents).where(where).orderBy(desc(schema.documents.createdAt));
}

/* Requests sent for one staff member or person, with how far each has got. */
export async function requestsFor(owner: { staffId?: string; individualId?: string } = {}) {
  const requests = await db
    .select({
      request: schema.documentRequests,
      staffFirst: schema.staff.firstName,
      staffLast: schema.staff.lastName,
      personFirst: schema.individuals.firstName,
      personLast: schema.individuals.lastName,
    })
    .from(schema.documentRequests)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.documentRequests.staffId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.documentRequests.individualId))
    .where(and(owner.staffId ? eq(schema.documentRequests.staffId, owner.staffId) : undefined, owner.individualId ? eq(schema.documentRequests.individualId, owner.individualId) : undefined))
    .orderBy(desc(schema.documentRequests.createdAt))
    .limit(100);
  const ids = requests.map(row => row.request.id);
  const items = ids.length ? await db.select().from(schema.documentRequestItems).where(inArray(schema.documentRequestItems.requestId, ids)).orderBy(asc(schema.documentRequestItems.sortOrder)) : [];
  return requests.map(row => ({ ...row, items: items.filter(item => item.requestId === row.request.id) }));
}

const owners = {
  staffFirst: schema.staff.firstName,
  staffLast: schema.staff.lastName,
  personFirst: schema.individuals.firstName,
  personLast: schema.individuals.lastName,
  home: schema.homes.name,
  type: schema.documentTypes.name,
};

function withOwners() {
  return db
    .select({ doc: schema.documents, ...owners })
    .from(schema.documents)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.documents.staffId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.documents.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.documents.homeId))
    .leftJoin(schema.documentTypes, eq(schema.documentTypes.id, schema.documents.typeId));
}

export const reviewQueue = () => withOwners().where(eq(schema.documents.status, "submitted")).orderBy(asc(schema.documents.createdAt));

/* Approved documents that expire within the window, or already have. */
export function expiringDocuments(days: number) {
  return withOwners()
    .where(and(eq(schema.documents.status, "approved"), lte(schema.documents.expiresOn, addDays(dateKey(), days))))
    .orderBy(asc(schema.documents.expiresOn));
}

/* Search every live document by title, file name, owner or type. */
export function searchDocuments(term: string) {
  const like = `%${term}%`;
  return withOwners()
    .where(
      and(
        ne(schema.documents.status, "superseded"),
        or(
          sql`${schema.documents.title} ilike ${like}`,
          sql`${schema.documents.fileName} ilike ${like}`,
          sql`(${schema.staff.firstName} || ' ' || ${schema.staff.lastName}) ilike ${like}`,
          sql`(${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}) ilike ${like}`,
          sql`${schema.homes.name} ilike ${like}`,
        ),
      ),
    )
    .orderBy(desc(schema.documents.createdAt))
    .limit(60);
}

/* One document with everything its page needs: owner, type, versions, request and who opened it. */
export async function documentDetail(id: string) {
  const reviewer = aliasedTable(schema.users, "reviewer");
  const [row] = await db
    .select({ doc: schema.documents, ...owners, typeRow: schema.documentTypes, reviewer: reviewer.name })
    .from(schema.documents)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.documents.staffId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, schema.documents.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.documents.homeId))
    .leftJoin(schema.documentTypes, eq(schema.documentTypes.id, schema.documents.typeId))
    .leftJoin(reviewer, eq(reviewer.id, schema.documents.reviewedBy))
    .where(eq(schema.documents.id, id))
    .limit(1);
  if (!row) return null;
  const { doc } = row;
  const sameOwner =
    doc.ownerKind === "staff" ? eq(schema.documents.staffId, doc.staffId!) : doc.ownerKind === "person" ? eq(schema.documents.individualId, doc.individualId!) : doc.homeId ? eq(schema.documents.homeId, doc.homeId) : isNull(schema.documents.homeId);
  const [versions, access, signature] = await Promise.all([
    doc.typeId
      ? db.select().from(schema.documents).where(and(eq(schema.documents.typeId, doc.typeId), eq(schema.documents.ownerKind, doc.ownerKind), sameOwner)).orderBy(desc(schema.documents.createdAt))
      : [],
    db
      .select({ at: schema.auditLog.at, action: schema.auditLog.action, who: schema.users.name })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
      .where(and(eq(schema.auditLog.entity, "document"), eq(schema.auditLog.entityId, id)))
      .orderBy(desc(schema.auditLog.at))
      .limit(30),
    db.select().from(schema.signatures).where(eq(schema.signatures.documentId, id)).limit(1),
  ]);
  return { ...row, versions, access, signature: signature[0] ?? null };
}

/* The numbers on the document center's overview. */
export async function documentCounts() {
  const today = dateKey();
  const [[review], [expiring], [expired], [requests]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.documents).where(eq(schema.documents.status, "submitted")),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.documents).where(and(eq(schema.documents.status, "approved"), gte(schema.documents.expiresOn, today), lte(schema.documents.expiresOn, addDays(today, 30)))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.documents).where(and(eq(schema.documents.status, "approved"), sql`${schema.documents.expiresOn} < ${today}`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.documentRequests)
      .where(and(isNull(schema.documentRequests.revokedAt), isNull(schema.documentRequests.completedAt))),
  ]);
  return { review: review.n, expiring: expiring.n, expired: expired.n, requests: requests.n };
}
