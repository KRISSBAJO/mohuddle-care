"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { currentAgency } from "@/server/agency";
import { db, schema } from "@/server/db";
import { approveDocument, DocumentError, rejectDocument } from "@/server/docs/service";
import { createRequest, freshLink, revokeRequest } from "@/server/docs/requests";
import { requireManager } from "@/server/guard";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

const uuid = z.uuid();
const day = z.union([z.literal(""), z.iso.date()]).transform(value => value || null);
export type LinkResult = FormState & { link?: string; expires?: string; first?: string; agency?: string };

function refresh(doc?: { id: string; staffId: string | null; individualId: string | null; homeId: string | null }) {
  revalidatePath("/app/documents", "layout");
  revalidatePath("/app/my-documents");
  if (doc?.staffId) revalidatePath(`/app/staff/${doc.staffId}`);
  if (doc?.individualId) revalidatePath(`/app/individuals/${doc.individualId}`);
  if (doc?.homeId) revalidatePath(`/app/homes/${doc.homeId}`);
  revalidatePath("/app");
}

const dates = z.object({ issuedOn: day, expiresOn: day, note: z.string().trim().max(1000).default("") });

export async function approveDocumentAction(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = dates.safeParse(Object.fromEntries(formData.entries()));
  if (!uuid.safeParse(id).success || !parsed.success) return { error: "Check the dates." };
  if (parsed.data.issuedOn && parsed.data.expiresOn && parsed.data.expiresOn < parsed.data.issuedOn) return { error: "The expiry date is before the issue date." };
  try {
    const doc = await approveDocument(id, user, parsed.data);
    await db.insert(schema.auditLog).values({ userId: user.id, action: "document:approve", entity: "document", entityId: id });
    refresh(doc);
    return {};
  } catch (error) {
    return { error: error instanceof DocumentError ? error.message : "Could not approve it." };
  }
}

export async function rejectDocumentAction(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!uuid.safeParse(id).success) return { error: "Unknown document." };
  if (reason.length < 5) return { error: "Say what needs fixing, so they can do it right the second time." };
  try {
    const doc = await rejectDocument(id, user, reason.slice(0, 1000));
    await db.insert(schema.auditLog).values({ userId: user.id, action: "document:reject", entity: "document", entityId: id });
    refresh(doc);
    return {};
  } catch (error) {
    return { error: error instanceof DocumentError ? error.message : "Could not return it." };
  }
}

const detailsInput = z.object({ title: z.string().trim().min(2, "Give it a name.").max(160), issuedOn: day, expiresOn: day, notes: z.string().trim().max(2000).default("") });

/* Corrects the name, dates or notes of a filed document. */
export async function updateDocumentDetails(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = detailsInput.safeParse(Object.fromEntries(formData.entries()));
  if (!uuid.safeParse(id).success) return { error: "Unknown document." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  if (parsed.data.issuedOn && parsed.data.expiresOn && parsed.data.expiresOn < parsed.data.issuedOn) return { error: "The expiry date is before the issue date." };
  const [doc] = await db.update(schema.documents).set(parsed.data).where(eq(schema.documents.id, id)).returning();
  if (!doc) return { error: "This document no longer exists." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: "document:edit", entity: "document", entityId: id });
  refresh(doc);
  return {};
}

/* Moves a document out of the current file. It is kept, never deleted, and can be restored. */
export async function setDocumentArchived(id: string, archived: boolean): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown document." };
  const [doc] = await db
    .update(schema.documents)
    .set({ status: archived ? "archived" : "approved" })
    .where(and(eq(schema.documents.id, id), inArray(schema.documents.status, archived ? ["approved", "rejected", "superseded"] : ["archived"])))
    .returning();
  if (!doc) return { error: "This document cannot be changed that way." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: archived ? "document:archive" : "document:restore", entity: "document", entityId: id });
  refresh(doc);
  return {};
}

/*
 * Asks a staff member for documents and returns the private link once. They also see the request on
 * their own Hub page and get a notification there.
 */
export async function requestStaffDocuments(staffId: string, _previous: LinkResult, formData: FormData): Promise<LinkResult> {
  const user = await requireManager();
  if (!uuid.safeParse(staffId).success) return { error: "Unknown staff member." };
  const [member] = await db.select().from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  if (!member?.active) return { error: "This person is no longer on staff." };
  const typeIds = formData.getAll("typeIds").map(String).filter(value => uuid.safeParse(value).success);
  const templateIds = formData.getAll("templateIds").map(String).filter(value => uuid.safeParse(value).success);
  const extra = String(formData.get("extra") ?? "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  const types = typeIds.length ? await db.select().from(schema.documentTypes).where(inArray(schema.documentTypes.id, typeIds)) : [];
  const templates = templateIds.length ? await db.select().from(schema.signTemplates).where(and(inArray(schema.signTemplates.id, templateIds), eq(schema.signTemplates.active, true))) : [];
  const items = [
    ...types.sort((a, b) => a.sortOrder - b.sortOrder).map(type => ({ typeId: type.id, label: type.name, kind: "upload" as const })),
    ...templates.map(template => ({ typeId: template.typeId, label: `Sign: ${template.title}`, kind: "sign" as const, templateId: template.id })),
    ...extra.map(label => ({ typeId: null, label: label.slice(0, 160), kind: "upload" as const })),
  ];
  if (!items.length) return { error: "Choose at least one document." };
  const dueOn = day.safeParse(formData.get("dueOn") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 120) || "Documents for your staff file";
  const { link } = await createRequest({
    staffId,
    title,
    message: String(formData.get("message") ?? "").trim().slice(0, 1000),
    dueOn: dueOn.success ? dueOn.data : null,
    items,
    createdBy: user.id,
  });
  const settings = await getSettings();
  refresh({ id: "", staffId, individualId: null, homeId: null });
  return { link, agency: (await currentAgency())?.name, first: member.firstName, expires: fmt.dayLong(new Date(Date.now() + settings.document_link_days * 86_400_000).toISOString().slice(0, 10)) };
}

/* A new link for a request. The old link stops working straight away. */
export async function freshRequestLink(requestId: string): Promise<LinkResult> {
  const user = await requireManager();
  if (!uuid.safeParse(requestId).success) return { error: "Unknown request." };
  const link = await freshLink(requestId, user.id);
  if (!link) return { error: "This request no longer exists." };
  const settings = await getSettings();
  revalidatePath("/app/documents", "layout");
  return { link, agency: (await currentAgency())?.name, expires: fmt.dayLong(new Date(Date.now() + settings.document_link_days * 86_400_000).toISOString().slice(0, 10)) };
}

export async function withdrawRequest(requestId: string): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(requestId).success) return { error: "Unknown request." };
  await revokeRequest(requestId, user.id);
  revalidatePath("/app/documents", "layout");
  revalidatePath("/app/my-documents");
  return {};
}

const typeInput = z.object({
  name: z.string().trim().min(2, "Give the document type a name.").max(120),
  category: z.enum(["staff", "person", "business"]),
  description: z.string().trim().max(500).default(""),
  instructions: z.string().trim().max(1000).default(""),
  required: z.boolean(),
  roles: z.array(z.enum(["dsp", "coordinator", "residential_manager", "nurse", "admin"])),
  perHome: z.boolean(),
  expires: z.boolean(),
  validityMonths: z.union([z.literal(""), z.coerce.number().int().min(1).max(120)]).transform(value => (value === "" ? null : value)),
  reminderDays: z.coerce.number().int().min(0).max(365).default(30),
  needsApproval: z.boolean(),
  credentialType: z.string().trim().max(80).default(""),
  sortOrder: z.coerce.number().int().min(0).max(999).default(50),
});

/* Adds or changes a document type. Documents already filed keep their own dates. */
export async function saveDocumentType(id: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = typeInput.safeParse({
    ...Object.fromEntries(formData.entries()),
    required: formData.get("required") === "on",
    perHome: formData.get("perHome") === "on",
    expires: formData.get("expires") === "on",
    needsApproval: formData.get("needsApproval") === "on",
    roles: formData.getAll("roles").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the document type." };
  const data = { ...parsed.data, perHome: parsed.data.category === "business" && parsed.data.perHome, roles: parsed.data.category === "staff" ? parsed.data.roles : [], credentialType: parsed.data.category === "staff" ? parsed.data.credentialType : "" };
  if (!data.expires) data.validityMonths = null;
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Unknown document type." };
    await db.update(schema.documentTypes).set(data).where(eq(schema.documentTypes.id, id));
  } else {
    await db.insert(schema.documentTypes).values(data);
  }
  await db.insert(schema.auditLog).values({ userId: user.id, action: id ? "document-type:update" : "document-type:create", entity: "document_type", entityId: id ?? "" });
  revalidatePath("/app/documents", "layout");
  return {};
}

export async function setDocumentTypeActive(id: string, active: boolean): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown document type." };
  await db.update(schema.documentTypes).set({ active }).where(eq(schema.documentTypes.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: active ? "document-type:restore" : "document-type:retire", entity: "document_type", entityId: id });
  revalidatePath("/app/documents", "layout");
  return {};
}
