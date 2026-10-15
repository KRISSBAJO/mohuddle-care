"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { LIBRARY_TEMPLATES } from "@/lib/default-sign-templates";
import { cleanFields } from "@/lib/sign-fields";
import { sections } from "@/lib/signing";
import { currentAgency } from "@/server/agency";
import { db, schema } from "@/server/db";
import { createRequestFor } from "@/server/docs/requests";
import { requireManager } from "@/server/guard";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";
import type { LinkResult } from "./documents";

const uuid = z.uuid();
const templateInput = z.object({
  title: z.string().trim().min(2, "Give the document a name.").max(160),
  category: z.enum(["staff", "person", "business"]),
  typeId: z.union([z.literal(""), uuid]).transform(value => value || null),
  body: z.string().trim().min(20, "Write the document. Start each section with # and a heading.").max(40_000),
});

/* Adds or edits a written document to sign. A change to the wording starts a new version. */
export async function saveTextTemplate(id: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = templateInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the document." };
  if (sections(parsed.data.body).length === 0) return { error: "The document has no text." };
  const initialEach = formData.get("initialEach") === "on";
  if (id) {
    if (!uuid.safeParse(id).success) return { error: "Unknown document." };
    const [existing] = await db.select().from(schema.signTemplates).where(eq(schema.signTemplates.id, id)).limit(1);
    if (!existing) return { error: "This document no longer exists." };
    const changed = existing.body !== parsed.data.body || existing.title !== parsed.data.title;
    await db
      .update(schema.signTemplates)
      .set({ ...parsed.data, initialEach, version: changed ? existing.version + 1 : existing.version })
      .where(eq(schema.signTemplates.id, id));
  } else {
    await db.insert(schema.signTemplates).values({ ...parsed.data, initialEach, createdBy: user.id });
  }
  await db.insert(schema.auditLog).values({ userId: user.id, action: id ? "sign-template:update" : "sign-template:create", entity: "sign_template", entityId: id ?? "" });
  revalidatePath("/app/documents", "layout");
  return {};
}

/*
 * Saves where the fields go on an uploaded PDF. A change makes a new version, so earlier signatures
 * keep pointing at what was actually signed.
 */
export async function saveTemplateFields(id: string, json: string): Promise<FormState & { saved?: number }> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "This document no longer exists." };
  const [template] = await db.select().from(schema.signTemplates).where(eq(schema.signTemplates.id, id)).limit(1);
  if (!template?.sourceKey || !template.sourcePages) return { error: "Fields can only be placed on an uploaded PDF." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "The fields could not be read. Reload and try again." };
  }
  const result = cleanFields(raw, template.sourcePages);
  if ("error" in result) return result;
  const changed = JSON.stringify(result.fields) !== JSON.stringify(template.fields);
  if (changed) {
    await db.update(schema.signTemplates).set({ fields: result.fields, version: template.version + 1 }).where(eq(schema.signTemplates.id, id));
    await db.insert(schema.auditLog).values({ userId: user.id, action: "sign-template:fields", entity: "sign_template", entityId: id });
  }
  revalidatePath("/app/documents");
  return { saved: result.fields.length };
}

/* Copies a document from the library into the agency's documents to sign, ready to edit. */
export async function addLibraryTemplate(title: string): Promise<FormState> {
  const user = await requireManager();
  const entry = LIBRARY_TEMPLATES.find(item => item.title === title);
  if (!entry) return { error: "That document is not in the library." };
  const [existing] = await db.select({ id: schema.signTemplates.id }).from(schema.signTemplates).where(eq(schema.signTemplates.title, entry.title)).limit(1);
  if (existing) return { error: "That document is already in your documents to sign." };
  const types = await db.select({ id: schema.documentTypes.id, name: schema.documentTypes.name }).from(schema.documentTypes);
  const [row] = await db
    .insert(schema.signTemplates)
    .values({ title: entry.title, category: entry.category, typeId: types.find(type => type.name === entry.typeName)?.id ?? null, body: entry.body, initialEach: true, createdBy: user.id })
    .returning({ id: schema.signTemplates.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "sign-template:library", entity: "sign_template", entityId: row.id });
  revalidatePath("/app/documents");
  return {};
}

export async function setTemplateActive(id: string, active: boolean): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown document." };
  await db.update(schema.signTemplates).set({ active }).where(eq(schema.signTemplates.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: active ? "sign-template:restore" : "sign-template:retire", entity: "sign_template", entityId: id });
  revalidatePath("/app/documents", "layout");
  return {};
}

/*
 * Asks someone outside the agency, such as a guardian, to sign or send documents about a person we
 * support. They get a private link; nothing on file is visible through it.
 */
export async function requestPersonDocuments(individualId: string, _previous: LinkResult, formData: FormData): Promise<LinkResult> {
  const user = await requireManager();
  if (!uuid.safeParse(individualId).success) return { error: "Unknown person." };
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person?.active) return { error: "This person is no longer supported." };
  const recipientName = String(formData.get("recipientName") ?? "").trim().slice(0, 120);
  const recipientRelation = String(formData.get("recipientRelation") ?? "").trim().slice(0, 80);
  if (recipientName.length < 2) return { error: "Enter the name of the person who will sign or send them." };
  const templateIds = formData.getAll("templateIds").map(String).filter(value => uuid.safeParse(value).success);
  const typeIds = formData.getAll("typeIds").map(String).filter(value => uuid.safeParse(value).success);
  const [templates, types] = await Promise.all([
    templateIds.length ? db.select().from(schema.signTemplates).where(and(inArray(schema.signTemplates.id, templateIds), eq(schema.signTemplates.active, true))) : [],
    typeIds.length ? db.select().from(schema.documentTypes).where(inArray(schema.documentTypes.id, typeIds)) : [],
  ]);
  const items = [
    ...templates.map(template => ({ typeId: template.typeId, label: `Sign: ${template.title}`, kind: "sign" as const, templateId: template.id })),
    ...types.map(type => ({ typeId: type.id, label: type.name, kind: "upload" as const })),
  ];
  if (!items.length) return { error: "Choose at least one document." };
  const { link } = await createRequestFor({
    individualId,
    recipientName,
    recipientRelation,
    title: `Documents for ${person.firstName} ${person.lastName}`,
    message: String(formData.get("message") ?? "").trim().slice(0, 1000),
    dueOn: null,
    items,
    createdBy: user.id,
  });
  const settings = await getSettings();
  revalidatePath(`/app/individuals/${individualId}`);
  revalidatePath("/app/documents", "layout");
  return { link, agency: (await currentAgency())?.name, first: recipientName.split(" ")[0], expires: fmt.dayLong(new Date(Date.now() + settings.document_link_days * 86_400_000).toISOString().slice(0, 10)) };
}
