"use server";

import { and, eq, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { assertShiftUpdate } from "@/lib/shift-policy";
import { zonedTime } from "@/lib/format";
import { saveSetting, settingDefs, type SettingKey } from "@/server/settings";
import { firstError, homeSchema, medicationSchema, optional, optionalDate, optionalUuid, staffSchema, uuid } from "@/server/forms";
import type { FormState } from "./auth";

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time.")
  .transform(value => zonedTimeFromInput(value));

function zonedTimeFromInput(value: string): Date {
  // datetime-local gives Central wall-clock time. Convert it to an instant.
  const [day, time] = value.split("T");
  return zonedTime(day, time);
}

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
});

export async function createIndividual(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = individualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const [row] = await db.insert(schema.individuals).values(parsed.data).returning({ id: schema.individuals.id });
  await audit(user.id, "create", "individual", row.id);
  revalidatePath("/app/individuals");
  redirect(`/app/individuals/${row.id}?saved=created`);
}

export async function updateIndividual(id: string, _p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = individualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  await db.update(schema.individuals).set(parsed.data).where(eq(schema.individuals.id, id));
  await audit(user.id, "update", "individual", id);
  revalidatePath(`/app/individuals/${id}`);
  revalidatePath("/app/individuals");
  // No redirect: the edit pop-up closes itself and the page shows the new details.
  return {};
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
  await db.insert(schema.planGoals).values(parsed.data);
  await audit(user.id, "create", "goal", parsed.data.individualId);
  revalidatePath(`/app/individuals/${parsed.data.individualId}`);
  return {};
}

export async function setGoalStatus(goalId: string, individualId: string, status: "active" | "met" | "paused") {
  const user = await requireUser();
  await db.update(schema.planGoals).set({ status }).where(eq(schema.planGoals.id, goalId));
  await audit(user.id, `goal:${status}`, "goal", goalId);
  revalidatePath(`/app/individuals/${individualId}`);
}

/* ---------- Daily logs ---------- */

const logSchema = z.object({
  individualId: uuid,
  logDate: z.iso.date(),
  mood: z.enum(schema.mood.enumValues),
  meals: optional(),
  activities: optional(),
  health: optional(),
  behaviours: optional(),
  goalProgress: optional(),
  notes: optional(4000),
});

export async function createDailyLog(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = logSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const checks = formData.getAll("checks").map(String).filter(Boolean);
  const required = (await import("@/server/settings").then(m => m.getSettings())).required_daily_checks;
  const missing = required.filter(item => !checks.includes(item));
  if (missing.length) return { error: `Please confirm every required check. Missing: ${missing.join(", ")}.` };
  const [row] = await db
    .insert(schema.dailyLogs)
    .values({ ...parsed.data, checks, staffId: user.staffId })
    .returning({ id: schema.dailyLogs.id });
  await audit(user.id, "create", "daily_log", row.id);
  revalidatePath("/app");
  revalidatePath("/app/daily-logs");
  redirect(`/app/individuals/${parsed.data.individualId}?saved=log`);
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
  revalidatePath("/app");
}

/* ---------- Incidents ---------- */

const incidentSchema = z.object({
  individualId: optionalUuid,
  homeId: optionalUuid,
  occurredAt: localDateTime,
  category: z.enum(schema.incidentCategory.enumValues),
  severity: z.enum(schema.incidentSeverity.enumValues),
  description: z.string().trim().min(10, "Describe what happened in at least a sentence.").max(5000),
  actionsTaken: optional(3000),
  reportable: z.literal("on").optional().transform(Boolean),
});

export async function createIncident(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = incidentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const [row] = await db
    .insert(schema.incidents)
    .values({ ...parsed.data, reportedBy: user.staffId })
    .returning({ id: schema.incidents.id });
  await audit(user.id, "create", "incident", row.id);
  revalidatePath("/app/incidents");
  revalidatePath("/app");
  redirect(`/app/incidents/${row.id}`);
}

export async function setIncidentStatus(id: string, status: "open" | "under_review" | "closed") {
  const user = await requireManager();
  await db
    .update(schema.incidents)
    .set({ status, closedAt: status === "closed" ? new Date() : null })
    .where(eq(schema.incidents.id, id));
  await audit(user.id, `incident:${status}`, "incident", id);
  revalidatePath(`/app/incidents/${id}`);
  revalidatePath("/app/incidents");
  revalidatePath("/app");
}

/* ---------- Tasks ---------- */

const taskSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title.").max(160),
  details: optional(2000),
  assignedTo: optionalUuid,
  homeId: optionalUuid,
  individualId: optionalUuid,
  dueAt: z.union([z.literal(""), localDateTime]).transform(value => value || null),
  priority: z.enum(schema.taskPriority.enumValues),
});

export async function createTask(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  await db.insert(schema.tasks).values(parsed.data);
  await audit(user.id, "create", "task");
  revalidatePath("/app/tasks");
  revalidatePath("/app");
  return {};
}

export async function completeTask(id: string) {
  const user = await requireUser();
  await db.update(schema.tasks).set({ status: "done", completedAt: new Date() }).where(eq(schema.tasks.id, id));
  await audit(user.id, "complete", "task", id);
  revalidatePath("/app/tasks");
  revalidatePath("/app");
}

/* ---------- Schedule ---------- */

const shiftSchema = z.object({
  homeId: uuid,
  staffId: optionalUuid,
  day: z.iso.date(),
  kind: z.enum(schema.shiftKind.enumValues),
  note: optional(300),
});

const shiftHours: Record<"day" | "evening" | "overnight", [string, string, number]> = {
  day: ["07:00", "15:00", 0],
  evening: ["15:00", "23:00", 0],
  overnight: ["23:00", "07:00", 1],
};

export async function createShift(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = shiftSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const { day, kind, staffId, homeId, note } = parsed.data;
  const [start, end, endOffset] = shiftHours[kind];
  const { zonedTime, addDays } = await import("@/lib/format");
  await db.insert(schema.shifts).values({
    homeId,
    staffId,
    kind,
    note,
    startsAt: zonedTime(day, start),
    endsAt: zonedTime(addDays(day, endOffset), end),
    status: staffId ? "scheduled" : "open",
  });
  await audit(user.id, "create", "shift");
  revalidatePath("/app/schedule");
  revalidatePath("/app");
  return {};
}

export async function assignShift(shiftId: string, formData: FormData) {
  const user = await requireManager();
  const staffId = String(formData.get("staffId") ?? "");
  const valid = optionalUuid.safeParse(staffId);
  if (!valid.success) return;
  await db
    .update(schema.shifts)
    .set({ staffId: valid.data, status: valid.data ? "scheduled" : "open" })
    .where(eq(schema.shifts.id, shiftId));
  await audit(user.id, "assign", "shift", shiftId);
  revalidatePath("/app/schedule");
  revalidatePath("/app");
}

export async function setShiftStatus(shiftId: string, status: "confirmed" | "completed" | "missed") {
  const user = await requireUser();
  const valid = z.enum(["confirmed", "completed", "missed"]).safeParse(status);
  if (!uuid.safeParse(shiftId).success || !valid.success) throw new Error("Invalid shift update.");
  await db.transaction(async tx => {
    const [shift] = await tx.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).for("update");
    assertShiftUpdate(user, shift, valid.data);
    await tx.update(schema.shifts).set({ status: valid.data }).where(eq(schema.shifts.id, shiftId));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: `shift:${valid.data}`, entity: "shift", entityId: shiftId });
  });
  revalidatePath("/app/schedule");
  revalidatePath("/app");
}

/* ---------- Homes and staff ---------- */

export async function createHome(_p: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const parsed = homeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  await db.insert(schema.homes).values(parsed.data);
  await audit(user.id, "create", "home");
  revalidatePath("/app/homes");
  return {};
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
