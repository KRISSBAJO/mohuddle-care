"use server";

import { and, eq, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { parseMoney } from "@/lib/format";
import { saveSetting, settingDefs, type SettingKey } from "@/server/settings";
import { normaliseStaffing } from "@/server/patterns";
import { firstError, homeFormValues, homeSchema, medicationSchema, optional, optionalDate, optionalUuid, staffSchema, uuid } from "@/server/forms";
import type { FormState } from "./auth";

async function audit(userId: string, action: string, entity: string, entityId = "") {
  await db.insert(schema.auditLog).values({ userId, action, entity, entityId });
}

/* ---------- People we support ---------- */

const individualSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  dob: optionalDate,
  homeId: optionalUuid,
  serviceType: z.enum(schema.serviceType.enumValues),
  admittedAt: optionalDate,
  guardianName: optional(120),
  guardianPhone: optional(40),
  emergencyContact: optional(120),
  emergencyPhone: optional(40),
  allergies: optional(500),
  diagnoses: optional(1000),
  supportNotes: optional(4000),
  preferredName: optional(80),
  gender: optional(40),
  pronouns: optional(40),
  primaryLanguage: optional(60),
  communication: optional(500),
  mobility: optional(500),
  diet: optional(500),
  likes: optional(1000),
  waiverType: optional(80),
});

export async function updateIndividual(id: string, _p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = individualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  await db.update(schema.individuals).set(parsed.data).where(eq(schema.individuals.id, id));
  await audit(user.id, "update", "individual", id);
  revalidatePath(`/app/individuals/${id}`);
  revalidatePath("/app/individuals");
  redirect(`/app/individuals/${id}?saved=details`);
}

const goalSchema = z.object({
  individualId: uuid,
  title: z.string().trim().min(3, "Give the goal a title.").max(160),
  description: optional(1000),
  targetDate: optionalDate,
});

export async function addGoal(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = goalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const [goal] = await db.insert(schema.planGoals).values(parsed.data).returning({ id: schema.planGoals.id });
  await audit(user.id, "create", "goal", goal.id);
  revalidatePath(`/app/individuals/${parsed.data.individualId}`);
  return {};
}

export async function setGoalStatus(goalId: string, individualId: string, status: "active" | "met" | "paused") {
  const user = await requireUser();
  await db.update(schema.planGoals).set({ status }).where(eq(schema.planGoals.id, goalId));
  await audit(user.id, `goal:${status}`, "goal", goalId);
  revalidatePath(`/app/individuals/${individualId}`);
}

/* Rewords a goal or moves its target date. The goal keeps its history in daily logs. */
export async function updateGoal(goalId: string, _p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(goalId).success) return { error: "This goal no longer exists." };
  const parsed = goalSchema.omit({ individualId: true }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const [goal] = await db.update(schema.planGoals).set(parsed.data).where(eq(schema.planGoals.id, goalId)).returning({ individualId: schema.planGoals.individualId });
  if (!goal) return { error: "This goal no longer exists." };
  await audit(user.id, "update", "goal", goalId);
  revalidatePath(`/app/individuals/${goal.individualId}`);
  return {};
}

/* ---------- Medications ---------- */

export async function addMedication(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = medicationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  // Doses start from now: a medication added at 3pm does not create a "late" 8am dose today.
  await db.insert(schema.medications).values({ ...parsed.data, startedAt: new Date() });
  await audit(user.id, "create", "medication", parsed.data.individualId);
  revalidatePath(`/app/individuals/${parsed.data.individualId}`);
  revalidatePath("/app/medications");
  return {};
}

export async function recordMedication(adminId: string, status: "given" | "refused" | "missed" | "held", formData: FormData) {
  const user = await requireUser();
  if (!uuid.safeParse(adminId).success || !z.enum(["given", "refused", "missed", "held"]).safeParse(status).success) throw new Error("Invalid medication update.");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  const now = new Date();
  await db.transaction(async tx => {
    const updated = await tx.update(schema.medAdministrations)
      .set({ status, recordedAt: now, staffId: user.staffId, note })
      .where(and(eq(schema.medAdministrations.id, adminId), eq(schema.medAdministrations.status, "due"), status === "given" ? lte(schema.medAdministrations.scheduledFor, now) : undefined))
      .returning({ id: schema.medAdministrations.id });
    if (!updated.length) throw new Error("This dose is not due yet or has already been recorded. Refresh the medication record.");
    await tx.insert(schema.auditLog).values({ userId: user.id, action: `med:${status}`, entity: "med_administration", entityId: adminId });
  });
  revalidatePath("/app/medications");
  revalidatePath("/app/homes/[id]", "page");
  revalidatePath("/app");
  revalidatePath("/app/individuals/[id]", "page");
}

/* ---------- Incidents ---------- */

/* ---------- Tasks ---------- */

/* ---------- Homes and staff ---------- */

/* Creates a home with everything set at once: details, staffing needs, manager and budget. */
export async function createHome(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = homeSchema.safeParse(homeFormValues(formData));
  if (!parsed.success) return firstError(parsed.error);
  const [clash] = await db
    .select({ id: schema.homes.id })
    .from(schema.homes)
    .where(sql`lower(${schema.homes.name}) = lower(${parsed.data.name})`)
    .limit(1);
  if (clash) return { error: "A home with that name already exists. Choose a different name." };
  const managerRaw = String(formData.get("managerStaffId") ?? "");
  let managerStaffId: string | null = null;
  if (managerRaw) {
    if (!uuid.safeParse(managerRaw).success) return { error: "Choose a home manager from the list." };
    const [person] = await db.select({ active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.id, managerRaw)).limit(1);
    if (!person?.active) return { error: "That person is no longer on staff." };
    managerStaffId = managerRaw;
  }
  const budgetRaw = String(formData.get("monthlyBudget") ?? "").trim();
  const monthlyBudgetCents = budgetRaw ? parseMoney(budgetRaw) : null;
  if (budgetRaw && monthlyBudgetCents === null) return { error: "Enter the monthly budget in dollars, for example 2400." };
  const [row] = await db.insert(schema.homes).values({ ...(await normaliseStaffing(parsed.data)), managerStaffId, monthlyBudgetCents }).returning({ id: schema.homes.id });
  await audit(user.id, "create", "home", row.id);
  revalidatePath("/app/homes");
  redirect(`/app/homes/${row.id}?created=1`);
}

export async function createStaff(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = staffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const existing = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.email, parsed.data.email)).limit(1);
  if (existing.length) return { error: "A staff member with that email already exists." };
  const [row] = await db.insert(schema.staff).values(parsed.data).returning({ id: schema.staff.id });
  await audit(user.id, "create", "staff", row.id);
  revalidatePath("/app/staff");
  // Straight to their page, where the next steps are: a login and their credentials.
  redirect(`/app/staff/${row.id}?created=1`);
}

const credentialSchema = z.object({
  staffId: uuid,
  type: z.string().trim().min(2).max(80),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  note: optional(300),
});

export async function addCredential(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = credentialSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const { issuedAt, expiresAt } = parsed.data;
  if (issuedAt && expiresAt && expiresAt < issuedAt) return { error: "The expiry date is before the issue date." };
  await db.insert(schema.credentials).values(parsed.data);
  await audit(user.id, "create", "credential", parsed.data.staffId);
  revalidatePath("/app/staff");
  revalidatePath(`/app/staff/${parsed.data.staffId}`);
  revalidatePath("/app");
  return {};
}

/* ---------- Website messages and settings ---------- */

export async function markEnquiryHandled(id: string, handled: boolean) {
  const user = await requireManager();
  await db.update(schema.enquiries).set({ handled }).where(eq(schema.enquiries.id, id));
  await audit(user.id, handled ? "handle" : "reopen", "enquiry", id);
  revalidatePath("/app/enquiries");
  revalidatePath("/app");
}

export async function saveSettings(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  try {
    for (const key of Object.keys(settingDefs) as SettingKey[]) {
      const raw = formData.get(key);
      if (raw === null) continue;
      const value =
        settingDefs[key].kind === "list"
          ? String(raw)
              .split("\n")
              .map(line => line.trim())
              .filter(Boolean)
          : String(raw);
      await saveSetting(key, value);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save settings." };
  }
  await audit(user.id, "update", "settings");
  revalidatePath("/app", "layout");
  return {};
}
