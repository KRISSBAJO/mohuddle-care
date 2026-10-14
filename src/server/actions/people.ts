"use server";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FIELD_TYPES, SECTION_KEYS } from "@/lib/note-requirements";
import { db, schema } from "@/server/db";
import { medicationFields } from "@/server/forms";
import { requireManager } from "@/server/guard";
import type { FormState } from "./auth";

const text = (max: number) => z.string().trim().max(max).default("");
const day = z.union([z.literal(""), z.iso.date("Use a full date.")]).default("").transform(value => value || null);

const personInput = z.object({
  firstName: z.string().trim().min(1, "Enter their first name.").max(80),
  lastName: z.string().trim().min(1, "Enter their last name.").max(80),
  preferredName: text(80),
  dob: day,
  gender: text(40),
  pronouns: text(40),
  primaryLanguage: text(60),
  homeId: z.union([z.literal(""), z.uuid()]).default("").transform(value => value || null),
  serviceType: z.enum(schema.serviceType.enumValues, "Choose the service."),
  admittedAt: day,
  communication: text(500),
  mobility: text(500),
  diet: text(500),
  likes: text(1000),
  supportNotes: text(4000),
  allergies: text(500),
  diagnoses: text(1000),
  guardianName: text(120),
  guardianPhone: text(40),
  emergencyContact: text(120),
  emergencyPhone: text(40),
});

const contactInput = z.object({
  role: z.string().trim().min(2, "choose the role.").max(80),
  name: z.string().trim().min(2, "enter their name.").max(120),
  organization: text(120),
  phone: text(40),
  email: z.union([z.literal(""), z.email("check the email address.")]).default(""),
  address: text(200),
  isPrimary: z.boolean().default(false),
});

const insuranceInput = z.object({
  kind: z.string().trim().min(2, "choose the insurance type.").max(80),
  rank: z.enum(["primary", "secondary", "tertiary"]),
  payer: z.string().trim().min(2, "enter the insurer or plan name.").max(120),
  plan: text(120),
  memberId: z.string().trim().min(2, "enter the member or ID number.").max(60),
  groupNumber: text(60),
  policyHolder: text(120),
  phone: text(40),
  effectiveFrom: day,
  effectiveTo: day,
});

const goalInput = z.object({
  title: z.string().trim().min(3, "write the desired outcome.").max(160),
  description: text(1000),
  measurableStep: text(500),
  frequencyCount: z.union([z.literal(""), z.coerce.number().int().min(1, "how often must be 1 or more.").max(31)]).default("").transform(value => (value === "" ? null : value)),
  frequencyPeriod: z.enum(["day", "week", "month"]).default("week"),
  effectiveDate: day,
  targetDate: day,
  documentedOn: z.string().trim().min(1).max(80).default("Daily notes"),
  setupNotes: text(1000),
});

const itemInput = z.object({
  label: z.string().trim().min(3, "write the question.").max(160),
  fieldType: z.enum(Object.keys(FIELD_TYPES) as [keyof typeof FIELD_TYPES, ...(keyof typeof FIELD_TYPES)[]]),
  options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  unit: text(20),
  help: text(300),
  required: z.boolean().default(false),
});

const wizardInput = z.object({
  person: personInput,
  medications: z.array(medicationFields).max(40).default([]),
  contacts: z.array(contactInput).max(40).default([]),
  insurance: z.array(insuranceInput).max(8).default([]),
  goals: z.array(goalInput).max(40).default([]),
  sections: z.array(z.object({ section: z.enum(SECTION_KEYS as [string, ...string[]]), enabled: z.boolean(), required: z.boolean() })).max(SECTION_KEYS.length).default([]),
  items: z.array(itemInput).max(30).default([]),
  allowDuplicate: z.boolean().default(false),
});

const groups: Record<string, string> = { person: "Basics", medications: "Medication", contacts: "Care team contact", insurance: "Insurance", goals: "Goal", items: "Daily note question", sections: "Daily note sections" };

/* Turns the first problem into one sentence that names the step, and the row when it is in a list. */
function problem(error: z.ZodError): FormState {
  const issue = error.issues[0];
  if (!issue) return { error: "Check the form." };
  const [group, index] = issue.path;
  const where = groups[String(group)] ?? "Form";
  const row = typeof index === "number" ? ` ${index + 1}` : "";
  const message = issue.message.charAt(0).toLowerCase() + issue.message.slice(1);
  return { error: `${where}${row}: ${message.replace(/^invalid input.*$/i, "check this entry.")}` };
}

/*
 * Adds a person with everything known on day one: who they are, health and medications, care team,
 * insurance, plan goals, and what their daily notes must cover. Everything is saved together or not at all.
 */
export async function createPerson(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "The form could not be read. Reload the page and try again." };
  }
  const parsed = wizardInput.safeParse(raw);
  if (!parsed.success) return problem(parsed.error);
  const { person, medications, contacts, insurance, goals, sections, items, allowDuplicate } = parsed.data;

  for (const [index, contact] of contacts.entries()) {
    if (!contact.phone && !contact.email) return { error: `Care team contact ${index + 1}: add a phone number or an email address.` };
  }
  for (const [index, cover] of insurance.entries()) {
    if (cover.effectiveFrom && cover.effectiveTo && cover.effectiveTo < cover.effectiveFrom) return { error: `Insurance ${index + 1}: the end date is before the start date.` };
  }
  for (const [index, item] of items.entries()) {
    if ((item.fieldType === "choice" || item.fieldType === "multi") && item.options.length < 2) return { error: `Daily note question ${index + 1}: give at least two answers to pick from.` };
  }
  if (person.homeId) {
    const [home] = await db.select({ id: schema.homes.id }).from(schema.homes).where(eq(schema.homes.id, person.homeId)).limit(1);
    if (!home) return { error: "Basics: that home no longer exists." };
  }

  if (!allowDuplicate) {
    const [twin] = await db
      .select({ id: schema.individuals.id })
      .from(schema.individuals)
      .where(
        and(
          sql`lower(${schema.individuals.firstName}) = lower(${person.firstName})`,
          sql`lower(${schema.individuals.lastName}) = lower(${person.lastName})`,
          person.dob ? or(eq(schema.individuals.dob, person.dob), isNull(schema.individuals.dob)) : undefined,
        ),
      )
      .limit(1);
    if (twin) return { error: `DUPLICATE:${twin.id}:${person.firstName} ${person.lastName} is already on record. Check it is not the same person before adding them again.` };
  }

  const id = await db.transaction(async tx => {
    const [row] = await tx.insert(schema.individuals).values(person).returning({ id: schema.individuals.id });
    const individualId = row.id;
    // Doses start from now: a medication added at 3pm does not create a "late" 8am dose today.
    const startedAt = new Date();
    if (medications.length) await tx.insert(schema.medications).values(medications.map(med => ({ ...med, individualId, startedAt })));
    if (contacts.length) {
      // One main contact per role: the first one marked main wins.
      const seen = new Set<string>();
      await tx.insert(schema.personContacts).values(
        contacts.map(contact => {
          const isPrimary = contact.isPrimary && !seen.has(contact.role);
          if (isPrimary) seen.add(contact.role);
          return { ...contact, isPrimary, individualId };
        }),
      );
    }
    if (insurance.length) await tx.insert(schema.personInsurance).values(insurance.map(cover => ({ ...cover, individualId })));
    if (goals.length) await tx.insert(schema.planGoals).values(goals.map(goal => ({ ...goal, frequencyPeriod: goal.frequencyCount ? goal.frequencyPeriod : null, individualId })));
    const rules = [
      ...sections.map((section, index) => ({ scope: "person" as const, individualId, kind: "section" as const, section: section.section, enabled: section.enabled, required: section.enabled && section.required, sortOrder: index })),
      ...items.map((item, index) => ({
        scope: "person" as const,
        individualId,
        kind: "item" as const,
        label: item.label,
        fieldType: item.fieldType,
        options: item.fieldType === "choice" || item.fieldType === "multi" ? item.options : [],
        unit: item.fieldType === "number" ? item.unit : "",
        help: item.help,
        required: item.required,
        sortOrder: index,
      })),
    ];
    if (rules.length) await tx.insert(schema.noteRequirements).values(rules);
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "individual", entityId: individualId });
    return individualId;
  });

  revalidatePath("/app/individuals");
  revalidatePath("/app/medications");
  redirect(`/app/individuals/${id}?saved=created`);
}
