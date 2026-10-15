import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { fmt } from "@/lib/format";
import { asAgency, db, schema, systemDb } from "@/server/db";
import { requireAgency } from "@/server/agency";
import { agencyBase } from "@/server/host";
import { notify, recipients } from "@/server/notify";
import { getSettings } from "@/server/settings";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
/* A request's private link, on the agency's own address when agencies have them. */
export const requestLink = async (token: string) => `${agencyBase((await requireAgency()).slug)}/docs/r/${token}`;

/*
 * Asks a staff member for documents. Returns the private link once; only its hash is kept, so
 * nobody (not even an admin) can see it again. The request also appears on their Hub page.
 */
export async function createRequest(input: {
  staffId: string;
  title: string;
  message: string;
  dueOn: string | null;
  items: { typeId: string | null; label: string; kind?: "upload" | "sign"; templateId?: string | null }[];
  createdBy: string;
}) {
  const settings = await getSettings();
  const token = newToken();
  const request = await db.transaction(async tx => {
    const [row] = await tx
      .insert(schema.documentRequests)
      .values({
        staffId: input.staffId,
        title: input.title,
        message: input.message,
        dueOn: input.dueOn,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + settings.document_link_days * 86_400_000),
        createdBy: input.createdBy,
      })
      .returning();
    await tx.insert(schema.documentRequestItems).values(
      input.items.map((item, index) => ({ requestId: row.id, typeId: item.typeId, label: item.label, kind: item.kind ?? "upload", templateId: item.templateId ?? null, sortOrder: index })),
    );
    await tx.insert(schema.auditLog).values({ userId: input.createdBy, action: "document-request:create", entity: "document_request", entityId: row.id });
    return row;
  });
  await notify(await recipients({ staffIds: [input.staffId], except: input.createdBy }), {
    kind: "document:requested",
    title: `${input.title}: ${input.items.length} ${input.items.length === 1 ? "document" : "documents"} needed`,
    body: input.dueOn ? `Please send them by ${fmt.dayLong(input.dueOn)}.` : "Please send them as soon as you can.",
    href: "/app/my-documents",
    tone: "info",
    dedupeKey: `document:requested:${request.id}`,
  });
  return { request, link: await requestLink(token) };
}

/* A new link for a request. The old one stops working at once. */
export async function freshLink(requestId: string, userId: string) {
  const settings = await getSettings();
  const token = newToken();
  const [row] = await db
    .update(schema.documentRequests)
    .set({ tokenHash: hash(token), expiresAt: new Date(Date.now() + settings.document_link_days * 86_400_000), revokedAt: null })
    .where(eq(schema.documentRequests.id, requestId))
    .returning({ id: schema.documentRequests.id });
  if (!row) return null;
  await db.insert(schema.auditLog).values({ userId, action: "document-request:fresh-link", entity: "document_request", entityId: requestId });
  return await requestLink(token);
}

export async function revokeRequest(requestId: string, userId: string) {
  await db.update(schema.documentRequests).set({ revokedAt: new Date() }).where(eq(schema.documentRequests.id, requestId));
  await db.insert(schema.auditLog).values({ userId, action: "document-request:revoke", entity: "document_request", entityId: requestId });
}

/*
 * The request behind a link, if the link still works. Only the staff member's first name and the
 * list of what is asked for come back: a link never shows any document already on file.
 */
/*
 * Runs fn as the agency a private link belongs to, as whoever opens it is not signed in. Without a
 * link it runs as the session; with a link that matches nothing, as no agency at all.
 */
export async function asLinkAgency<T>(token: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  if (!token) return fn();
  const [row] = /^[\w-]{20,80}$/.test(token)
    ? await systemDb.select({ agencyId: schema.documentRequests.agencyId }).from(schema.documentRequests).where(eq(schema.documentRequests.tokenHash, hash(token))).limit(1)
    : [];
  return asAgency(row?.agencyId ?? null, fn);
}

export async function requestByToken(token: string) {
  if (!/^[\w-]{20,80}$/.test(token)) return { state: "invalid" as const };
  const [row] = await db
    .select({ request: schema.documentRequests, first: schema.staff.firstName, active: schema.staff.active })
    .from(schema.documentRequests)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.documentRequests.staffId))
    .where(eq(schema.documentRequests.tokenHash, hash(token)))
    .limit(1);
  if (!row) return { state: "invalid" as const };
  if (row.request.revokedAt || row.active === false) return { state: "revoked" as const };
  if (row.request.expiresAt.getTime() < Date.now()) return { state: "expired" as const };
  const items = await db
    .select()
    .from(schema.documentRequestItems)
    .where(eq(schema.documentRequestItems.requestId, row.request.id))
    .orderBy(asc(schema.documentRequestItems.sortOrder));
  return { state: "ok" as const, request: row.request, first: row.first ?? row.request.recipientName.split(" ")[0] ?? "", items };
}

export async function touchRequest(requestId: string) {
  await db.update(schema.documentRequests).set({ lastOpenedAt: new Date() }).where(eq(schema.documentRequests.id, requestId));
}

/* Requests still open for a staff member, for their own Hub page. These do not depend on the link. */
export async function openRequestsFor(staffId: string) {
  const requests = await db
    .select()
    .from(schema.documentRequests)
    .where(and(eq(schema.documentRequests.staffId, staffId), isNull(schema.documentRequests.revokedAt), isNull(schema.documentRequests.completedAt)))
    .orderBy(asc(schema.documentRequests.createdAt));
  if (!requests.length) return [];
  const items = await db
    .select()
    .from(schema.documentRequestItems)
    .where(inArray(schema.documentRequestItems.requestId, requests.map(request => request.id)))
    .orderBy(asc(schema.documentRequestItems.sortOrder));
  return requests.map(request => ({ request, items: items.filter(item => item.requestId === request.id) }));
}

/* A request about a person we support, sent to someone outside the agency such as a guardian. */
export async function createRequestFor(input: {
  individualId: string;
  recipientName: string;
  recipientRelation: string;
  title: string;
  message: string;
  dueOn: string | null;
  items: { typeId: string | null; label: string; kind: "upload" | "sign"; templateId?: string | null }[];
  createdBy: string;
}) {
  const settings = await getSettings();
  const token = newToken();
  const request = await db.transaction(async tx => {
    const [row] = await tx
      .insert(schema.documentRequests)
      .values({
        individualId: input.individualId,
        recipientName: input.recipientName,
        recipientRelation: input.recipientRelation,
        title: input.title,
        message: input.message,
        dueOn: input.dueOn,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + settings.document_link_days * 86_400_000),
        createdBy: input.createdBy,
      })
      .returning();
    await tx.insert(schema.documentRequestItems).values(input.items.map((item, index) => ({ requestId: row.id, typeId: item.typeId, label: item.label, kind: item.kind, templateId: item.templateId ?? null, sortOrder: index })));
    await tx.insert(schema.auditLog).values({ userId: input.createdBy, action: "document-request:create", entity: "document_request", entityId: row.id });
    return row;
  });
  return { request, link: await requestLink(token) };
}
