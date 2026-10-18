import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import type { FormState } from "./actions/auth";

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).default("");
const day = z.union([z.literal(""), z.iso.date()]).transform(value => value || null);

/* Coordinators and nurses keep the care team and insurance up to date. */

const contactInput = z.object({
  role: z.string().trim().min(2, "Choose the role.").max(80),
  name: z.string().trim().min(2, "Enter their name.").max(120),
  organization: text(120),
  phone: text(40),
  altPhone: text(40),
  email: z.union([z.literal(""), z.email("Check the email address.")]).default(""),
  fax: text(40),
  address: text(200),
  notes: text(1000),
});

export async function saveContact(user: SessionUser, individualId: string, contactId: string | null, _previous: FormState, formData: FormData): Promise<FormState & { redirect?: string; id?: string }> {
  if (!canManage(user) && user.role !== "nurse") return { error: "Only managers and nurses can change the care team." };
  if (!user) return { error: "Only coordinators and nurses can change the care team." };
  if (!uuid.safeParse(individualId).success || (contactId && !uuid.safeParse(contactId).success)) return { error: "Unknown person." };
  const parsed = contactInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the contact." };
  if (!parsed.data.phone && !parsed.data.email) return { error: "Add a phone number or an email address." };
  const isPrimary = formData.get("isPrimary") === "on";
  await db.transaction(async tx => {
    // One main contact per role: choosing a new one clears the old.
    if (isPrimary) await tx.update(schema.personContacts).set({ isPrimary: false }).where(and(eq(schema.personContacts.individualId, individualId), eq(schema.personContacts.role, parsed.data.role)));
    if (contactId) await tx.update(schema.personContacts).set({ ...parsed.data, isPrimary }).where(and(eq(schema.personContacts.id, contactId), eq(schema.personContacts.individualId, individualId)));
    else await tx.insert(schema.personContacts).values({ ...parsed.data, isPrimary, individualId });
    await tx.insert(schema.auditLog).values({ userId: user.id, action: contactId ? "contact:update" : "contact:create", entity: "individual", entityId: individualId });
  });
  return {};
}

export async function removeContact(user: SessionUser, individualId: string, contactId: string): Promise<FormState & { redirect?: string; id?: string }> {
  if (!canManage(user) && user.role !== "nurse") return { error: "Only managers and nurses can change the care team." };
  if (!user) return { error: "Only coordinators and nurses can change the care team." };
  if (!uuid.safeParse(contactId).success) return { error: "Unknown contact." };
  await db.delete(schema.personContacts).where(and(eq(schema.personContacts.id, contactId), eq(schema.personContacts.individualId, individualId)));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "contact:remove", entity: "individual", entityId: individualId });
  return {};
}

const insuranceInput = z.object({
  kind: z.string().trim().min(2, "Choose the insurance type.").max(80),
  rank: z.enum(["primary", "secondary", "tertiary"]),
  payer: z.string().trim().min(2, "Enter the insurer or plan name.").max(120),
  plan: text(120),
  memberId: z.string().trim().min(2, "Enter the member or ID number.").max(60),
  groupNumber: text(60),
  policyHolder: text(120),
  phone: text(40),
  effectiveFrom: day,
  effectiveTo: day,
  notes: text(1000),
});

export async function saveInsurance(user: SessionUser, individualId: string, insuranceId: string | null, _previous: FormState, formData: FormData): Promise<FormState & { redirect?: string; id?: string }> {
  if (!canManage(user) && user.role !== "nurse") return { error: "Only managers and nurses can change the care team." };
  if (!user) return { error: "Only coordinators and nurses can change insurance." };
  if (!uuid.safeParse(individualId).success || (insuranceId && !uuid.safeParse(insuranceId).success)) return { error: "Unknown person." };
  const parsed = insuranceInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the insurance details." };
  if (parsed.data.effectiveFrom && parsed.data.effectiveTo && parsed.data.effectiveTo < parsed.data.effectiveFrom) return { error: "Coverage ends before it starts." };
  if (insuranceId) await db.update(schema.personInsurance).set(parsed.data).where(and(eq(schema.personInsurance.id, insuranceId), eq(schema.personInsurance.individualId, individualId)));
  else await db.insert(schema.personInsurance).values({ ...parsed.data, individualId });
  await db.insert(schema.auditLog).values({ userId: user.id, action: insuranceId ? "insurance:update" : "insurance:create", entity: "individual", entityId: individualId });
  return {};
}

/* Ends cover rather than deleting it, so the history of who paid stays on record. */
export async function setInsuranceActive(user: SessionUser, individualId: string, insuranceId: string, active: boolean): Promise<FormState & { redirect?: string; id?: string }> {
  if (!canManage(user) && user.role !== "nurse") return { error: "Only managers and nurses can change the care team." };
  if (!user) return { error: "Only coordinators and nurses can change insurance." };
  if (!uuid.safeParse(insuranceId).success) return { error: "Unknown insurance." };
  await db.update(schema.personInsurance).set({ active }).where(and(eq(schema.personInsurance.id, insuranceId), eq(schema.personInsurance.individualId, individualId)));
  await db.insert(schema.auditLog).values({ userId: user.id, action: active ? "insurance:restore" : "insurance:end", entity: "individual", entityId: individualId });
  return {};
}
