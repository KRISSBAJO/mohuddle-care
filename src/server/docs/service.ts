import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { addMonths, ACCEPTED, safeFileName, sniffType } from "@/lib/documents";
import { dateKey } from "@/lib/format";
import type { SessionUser } from "@/server/auth";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { notify, recipients } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { agencyKey, storage } from "./storage";

export type Owner = { kind: "staff"; staffId: string } | { kind: "person"; individualId: string } | { kind: "business"; homeId: string | null };
type Doc = typeof schema.documents.$inferSelect;

export class DocumentError extends Error {}

/*
 * Checks and stores one uploaded file, then records it. The file's real type comes from its bytes,
 * not its name. A SHA-256 fingerprint is kept so tampering with a stored file can be detected.
 */
export async function storeDocument(input: {
  bytes: Buffer;
  fileName: string;
  owner: Owner;
  typeId: string | null;
  title: string;
  issuedOn?: string | null;
  expiresOn?: string | null;
  notes?: string;
  status: "submitted" | "approved";
  source: "upload" | "request_link" | "staff_portal";
  uploadedBy: string | null;
  uploadedByName: string;
  requestItemId?: string | null;
  reviewedBy?: string | null;
}) {
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (input.bytes.length === 0) throw new DocumentError("The file is empty.");
  if (input.bytes.length > maxBytes) throw new DocumentError(`Files can be up to ${env.MAX_UPLOAD_MB} MB. Try a smaller scan or photo.`);
  const type = sniffType(input.bytes.subarray(0, 16));
  if (!type) throw new DocumentError(`Upload a PDF or a photo (${Object.values(ACCEPTED).map(item => item.label).join(", ")}).`);
  const id = randomUUID();
  const fileName = safeFileName(input.fileName, type);
  const ownerId = input.owner.kind === "staff" ? input.owner.staffId : input.owner.kind === "person" ? input.owner.individualId : (input.owner.homeId ?? "agency");
  const key = await agencyKey(`documents/${input.owner.kind}/${ownerId}/${id}/${fileName}`);
  await storage().put(key, input.bytes, type);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  try {
    const [doc] = await db
      .insert(schema.documents)
      .values({
        id,
        typeId: input.typeId,
        title: input.title.slice(0, 160),
        ownerKind: input.owner.kind,
        staffId: input.owner.kind === "staff" ? input.owner.staffId : null,
        individualId: input.owner.kind === "person" ? input.owner.individualId : null,
        homeId: input.owner.kind === "business" ? input.owner.homeId : null,
        status: input.status,
        storageKey: key,
        fileName,
        mimeType: type,
        sizeBytes: input.bytes.length,
        sha256,
        issuedOn: input.issuedOn ?? null,
        expiresOn: input.expiresOn ?? null,
        notes: (input.notes ?? "").slice(0, 2000),
        source: input.source,
        uploadedBy: input.uploadedBy,
        uploadedByName: input.uploadedByName.slice(0, 120),
        requestItemId: input.requestItemId ?? null,
        reviewedBy: input.status === "approved" ? (input.reviewedBy ?? input.uploadedBy) : null,
        reviewedAt: input.status === "approved" ? new Date() : null,
      })
      .returning();
    if (input.status === "approved") await afterApproval(doc);
    return doc;
  } catch (error) {
    await storage().remove(key).catch(() => undefined);
    throw error;
  }
}

/* The default expiry for a type: issue date (or today) plus the type's validity. */
export async function defaultExpiry(typeId: string | null, issuedOn: string | null) {
  if (!typeId) return null;
  const [type] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.id, typeId)).limit(1);
  if (!type?.expires || !type.validityMonths) return null;
  return addMonths(issuedOn ?? dateKey(), type.validityMonths);
}

/*
 * After a document is approved: older versions of the same type for the same owner are marked
 * replaced, the request item is closed, and a matching staff credential is updated.
 */
async function afterApproval(doc: Doc) {
  if (doc.typeId) {
    const sameOwner =
      doc.ownerKind === "staff"
        ? eq(schema.documents.staffId, doc.staffId!)
        : doc.ownerKind === "person"
          ? eq(schema.documents.individualId, doc.individualId!)
          : doc.homeId
            ? eq(schema.documents.homeId, doc.homeId)
            : sql`${schema.documents.homeId} is null and ${schema.documents.ownerKind} = 'business'`;
    await db
      .update(schema.documents)
      .set({ status: "superseded", supersededBy: doc.id })
      .where(and(eq(schema.documents.typeId, doc.typeId), sameOwner, ne(schema.documents.id, doc.id), inArray(schema.documents.status, ["approved", "submitted", "rejected"])));
  }
  if (doc.requestItemId) {
    await db.update(schema.documentRequestItems).set({ status: "approved", reviewNote: "" }).where(eq(schema.documentRequestItems.id, doc.requestItemId));
    await completeIfDone(doc.requestItemId);
  }
  if (doc.ownerKind === "staff" && doc.typeId && doc.staffId) {
    const [type] = await db.select({ credentialType: schema.documentTypes.credentialType }).from(schema.documentTypes).where(eq(schema.documentTypes.id, doc.typeId)).limit(1);
    if (type?.credentialType) {
      const [existing] = await db.select({ id: schema.credentials.id }).from(schema.credentials).where(and(eq(schema.credentials.staffId, doc.staffId), eq(schema.credentials.type, type.credentialType))).limit(1);
      const values = { issuedAt: doc.issuedOn, expiresAt: doc.expiresOn, note: "From the document center" };
      if (existing) await db.update(schema.credentials).set(values).where(eq(schema.credentials.id, existing.id));
      else await db.insert(schema.credentials).values({ staffId: doc.staffId, type: type.credentialType, ...values });
    }
  }
}

async function completeIfDone(itemId: string) {
  const [item] = await db.select({ requestId: schema.documentRequestItems.requestId }).from(schema.documentRequestItems).where(eq(schema.documentRequestItems.id, itemId)).limit(1);
  if (!item) return;
  const open = await db
    .select({ id: schema.documentRequestItems.id })
    .from(schema.documentRequestItems)
    .where(and(eq(schema.documentRequestItems.requestId, item.requestId), ne(schema.documentRequestItems.status, "approved")))
    .limit(1);
  if (!open.length) await db.update(schema.documentRequests).set({ completedAt: new Date() }).where(eq(schema.documentRequests.id, item.requestId));
}

/* Approves a submitted document, with the dates the reviewer confirmed. */
export async function approveDocument(id: string, reviewer: SessionUser, dates: { issuedOn: string | null; expiresOn: string | null; note: string }) {
  const [doc] = await db
    .update(schema.documents)
    .set({ status: "approved", issuedOn: dates.issuedOn, expiresOn: dates.expiresOn, reviewNote: dates.note, reviewedBy: reviewer.id, reviewedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.status, "submitted")))
    .returning();
  if (!doc) throw new DocumentError("This document was already reviewed. Refresh the page.");
  await afterApproval(doc);
  await tellOwner(doc, reviewer, "approved", dates.note);
  return doc;
}

/* Returns a document to the staff member with the reason. Their request reopens so they can upload again. */
export async function rejectDocument(id: string, reviewer: SessionUser, reason: string) {
  const [doc] = await db
    .update(schema.documents)
    .set({ status: "rejected", reviewNote: reason, reviewedBy: reviewer.id, reviewedAt: new Date() })
    .where(and(eq(schema.documents.id, id), eq(schema.documents.status, "submitted")))
    .returning();
  if (!doc) throw new DocumentError("This document was already reviewed. Refresh the page.");
  if (doc.requestItemId) {
    await db.update(schema.documentRequestItems).set({ status: "rejected", reviewNote: reason }).where(eq(schema.documentRequestItems.id, doc.requestItemId));
    const [item] = await db.select({ requestId: schema.documentRequestItems.requestId }).from(schema.documentRequestItems).where(eq(schema.documentRequestItems.id, doc.requestItemId)).limit(1);
    if (item) await db.update(schema.documentRequests).set({ completedAt: null }).where(eq(schema.documentRequests.id, item.requestId));
  }
  await tellOwner(doc, reviewer, "rejected", reason);
  return doc;
}

async function tellOwner(doc: Doc, reviewer: SessionUser, outcome: "approved" | "rejected", note: string) {
  if (doc.ownerKind !== "staff" || !doc.staffId) return;
  await notify(await recipients({ staffIds: [doc.staffId], except: reviewer.id }), {
    kind: `document:${outcome}`,
    title: outcome === "approved" ? `${doc.title} approved` : `${doc.title} needs to be done again`,
    body: outcome === "approved" ? (doc.expiresOn ? `On file until ${doc.expiresOn}.` : "It is on file.") : note,
    href: "/app/my-documents",
    tone: outcome === "approved" ? "good" : "bad",
    dedupeKey: `document:${outcome}:${doc.id}`,
  });
}

/* Tells the document reviewers that something arrived. */
export async function tellReviewers(doc: Doc, who: string, except?: string) {
  const settings = await getSettings();
  await notify(await recipients({ roles: settings.notify_roles_documents, except }), {
    kind: "document:submitted",
    title: `${who} sent ${doc.title}`,
    body: "Review and approve it, or return it with a reason.",
    href: `/app/documents/${doc.id}`,
    tone: "info",
    dedupeKey: `document:submitted:${doc.id}`,
  });
}

/*
 * Who may open a document. Staff and business files are for coordinators and administrators.
 * Files about a person we support are needed for care, so every signed-in staff member may open them.
 */
export function canView(user: SessionUser, doc: Pick<Doc, "ownerKind">) {
  if (canManage(user)) return true;
  if (doc.ownerKind === "person") return true;
  return false;
}

export const canReview = (user: SessionUser) => canManage(user);
