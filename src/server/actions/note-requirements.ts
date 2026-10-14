"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FIELD_TYPES, SECTION_KEYS } from "@/lib/note-requirements";
import { db, schema } from "@/server/db";
import { requireManager } from "@/server/guard";
import type { FormState } from "./auth";

type Scope = "all" | "home" | "person";

function target(scope: Scope, targetId: string | null) {
  if (scope === "all") return { homeId: null, individualId: null };
  if (!targetId || !z.uuid().safeParse(targetId).success) throw new Error("Unknown home or person.");
  return scope === "home" ? { homeId: targetId, individualId: null } : { homeId: null, individualId: targetId };
}

function where(scope: Scope, targetId: string | null) {
  return and(
    eq(schema.noteRequirements.scope, scope),
    scope === "home" ? eq(schema.noteRequirements.homeId, targetId!) : undefined,
    scope === "person" ? eq(schema.noteRequirements.individualId, targetId!) : undefined,
  );
}

function refresh(scope: Scope, targetId: string | null) {
  revalidatePath("/app/settings/notes");
  revalidatePath("/app/daily-logs/new");
  if (scope === "home") revalidatePath(`/app/homes/${targetId}`);
  if (scope === "person") revalidatePath(`/app/individuals/${targetId}`);
  if (scope === "all") revalidatePath("/app", "layout");
}

/*
 * Saves which optional sections are on at one level. "inherit" removes this level's choice so the
 * level above decides; the agency level has no inherit and always stores its choice.
 */
export async function saveSectionSettings(scope: Scope, targetId: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  let ids;
  try {
    ids = target(scope, targetId);
  } catch (error) {
    return { error: (error as Error).message };
  }
  const choices = SECTION_KEYS.map(key => ({ key, value: String(formData.get(`section.${key}`) ?? "inherit") }));
  if (choices.some(choice => !["inherit", "on", "required", "off"].includes(choice.value))) return { error: "Choose a setting for each section." };
  if (scope === "all" && choices.some(choice => choice.value === "inherit")) return { error: "Choose on, required or off for each section." };
  await db.transaction(async tx => {
    await tx.delete(schema.noteRequirements).where(and(where(scope, targetId), eq(schema.noteRequirements.kind, "section")));
    const rows = choices
      .filter(choice => choice.value !== "inherit")
      .map(choice => ({ scope, ...ids, kind: "section" as const, section: choice.key, enabled: choice.value !== "off", required: choice.value === "required" }));
    if (rows.length) await tx.insert(schema.noteRequirements).values(rows);
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "note-sections:update", entity: scope === "all" ? "settings" : scope === "home" ? "home" : "individual", entityId: targetId ?? "" });
  });
  refresh(scope, targetId);
  return {};
}

const itemInput = z.object({
  label: z.string().trim().min(2, "Write the question staff will answer.").max(120),
  fieldType: z.enum(Object.keys(FIELD_TYPES) as [keyof typeof FIELD_TYPES, ...(keyof typeof FIELD_TYPES)[]]),
  options: z.array(z.string().trim().min(1).max(80)).max(20),
  unit: z.string().trim().max(20).default(""),
  help: z.string().trim().max(200).default(""),
  required: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

/* Adds or changes an extra item staff answer on daily notes at this level. */
export async function saveNoteItem(scope: Scope, targetId: string | null, itemId: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  let ids;
  try {
    ids = target(scope, targetId);
  } catch (error) {
    return { error: (error as Error).message };
  }
  const parsed = itemInput.safeParse({
    label: formData.get("label"),
    fieldType: formData.get("fieldType"),
    options: [...new Set(String(formData.get("options") ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean))],
    unit: formData.get("unit") ?? "",
    help: formData.get("help") ?? "",
    required: formData.get("required") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the item." };
  const data = parsed.data;
  if ((data.fieldType === "choice" || data.fieldType === "multi") && data.options.length < 2) return { error: "List at least two options, one per line." };
  if (data.fieldType !== "choice" && data.fieldType !== "multi") data.options = [];
  if (data.fieldType !== "number") data.unit = "";
  if (itemId) {
    if (!z.uuid().safeParse(itemId).success) return { error: "Unknown item." };
    const updated = await db
      .update(schema.noteRequirements)
      .set(data)
      .where(and(eq(schema.noteRequirements.id, itemId), where(scope, targetId), eq(schema.noteRequirements.kind, "item")))
      .returning({ id: schema.noteRequirements.id });
    if (!updated.length) return { error: "This item was removed. Refresh the page." };
  } else {
    await db.insert(schema.noteRequirements).values({ scope, ...ids, kind: "item", enabled: true, ...data });
  }
  await db.insert(schema.auditLog).values({ userId: user.id, action: itemId ? "note-item:update" : "note-item:create", entity: "note_requirement", entityId: itemId ?? "" });
  refresh(scope, targetId);
  return {};
}

/* Removes an extra item. Notes already written keep the question and answer. */
export async function removeNoteItem(scope: Scope, targetId: string | null, itemId: string): Promise<FormState> {
  const user = await requireManager();
  if (!z.uuid().safeParse(itemId).success) return { error: "Unknown item." };
  await db.delete(schema.noteRequirements).where(and(eq(schema.noteRequirements.id, itemId), eq(schema.noteRequirements.kind, "item")));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "note-item:remove", entity: "note_requirement", entityId: itemId });
  refresh(scope, targetId);
  return {};
}
