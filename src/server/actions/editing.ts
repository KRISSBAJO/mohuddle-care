"use server";

import { and, count, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mayManageLogin } from "@/lib/account-policy";
import { db, schema } from "@/server/db";
import { firstError, homeFormValues, homeSchema, medicationFields, staffSchema, uuid } from "@/server/forms";
import { requireManager } from "@/server/guard";
import type { FormState } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ---------- Medications ---------- */

/* Removes doses that have not happened yet, so a stopped or replaced medication stops appearing as due. */
async function withdrawFutureDoses(tx: Tx, medicationId: string, from: Date) {
  await tx
    .delete(schema.medAdministrations)
    .where(
      and(
        eq(schema.medAdministrations.medicationId, medicationId),
        eq(schema.medAdministrations.status, "due"),
        gt(schema.medAdministrations.scheduledFor, from),
      ),
    );
}

function revalidateMedication(individualId: string) {
  revalidatePath(`/app/individuals/${individualId}`);
  revalidatePath("/app/medications");
  revalidatePath("/app");
}

/*
 * A change never edits the old row. It stops it and starts a new one, so every past
 * administration record still shows the name and dose that was actually given.
 */
export async function changeMedication(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown medication." };
  const parsed = medicationFields.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 3) return { error: "Say why it changed, for example who ordered the new dose." };
  const now = new Date();
  const individualId = await db.transaction(async tx => {
    const [old] = await tx.select().from(schema.medications).where(eq(schema.medications.id, id)).for("update");
    if (!old || !old.active) return null;
    const [created] = await tx
      .insert(schema.medications)
      .values({ ...parsed.data, individualId: old.individualId, startedAt: now })
      .returning({ id: schema.medications.id });
    await tx
      .update(schema.medications)
      .set({ active: false, stoppedAt: now, stopReason: `Changed: ${reason}` })
      .where(eq(schema.medications.id, id));
    await withdrawFutureDoses(tx, id, now);
    await tx.insert(schema.auditLog).values({ userId: user.id, action: `medication:change:${created.id}`, entity: "medication", entityId: id });
    return old.individualId;
  });
  if (!individualId) return { error: "This medication was already stopped or changed. Refresh the page." };
  revalidateMedication(individualId);
  redirect(`/app/individuals/${individualId}?tab=medications&saved=medication`);
}

export async function stopMedication(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown medication." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 3) return { error: "Say why it was stopped, for example who ordered it." };
  const now = new Date();
  const individualId = await db.transaction(async tx => {
    const [old] = await tx.select().from(schema.medications).where(eq(schema.medications.id, id)).for("update");
    if (!old || !old.active) return null;
    await tx.update(schema.medications).set({ active: false, stoppedAt: now, stopReason: reason }).where(eq(schema.medications.id, id));
    await withdrawFutureDoses(tx, id, now);
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "medication:stop", entity: "medication", entityId: id });
    return old.individualId;
  });
  if (!individualId) return { error: "This medication was already stopped. Refresh the page." };
  revalidateMedication(individualId);
  redirect(`/app/individuals/${individualId}?tab=medications&saved=medication`);
}

/* ---------- Staff ---------- */

export async function updateStaff(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown staff member." };
  const parsed = staffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return firstError(parsed.error);
  const clash = await db
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(and(eq(schema.staff.email, parsed.data.email), ne(schema.staff.id, id)))
    .limit(1);
  if (clash.length) return { error: "Another staff member already uses that email." };
  const [login] = await db.select().from(schema.users).where(eq(schema.users.staffId, id)).limit(1);
  if (login && login.email !== parsed.data.email) {
    if (!mayManageLogin(user, login)) return { error: "Only an administrator can change the email of this login." };
    const loginClash = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, parsed.data.email), ne(schema.users.id, login.id)))
      .limit(1);
    if (loginClash.length) return { error: "Another login already uses that email." };
  }
  await db.transaction(async tx => {
    await tx.update(schema.staff).set(parsed.data).where(eq(schema.staff.id, id));
    // The login follows the staff record, so the sign-in email and name stay in step.
    if (login) {
      await tx
        .update(schema.users)
        .set({ email: parsed.data.email, name: `${parsed.data.firstName} ${parsed.data.lastName}` })
        .where(eq(schema.users.id, login.id));
    }
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "update", entity: "staff", entityId: id });
  });
  revalidatePath("/app/staff");
  revalidatePath(`/app/staff/${id}`);
  // No redirect: the edit pop-up closes itself and the page shows the new details.
  return {};
}

/*
 * Marking someone as left turns off their login and hands their upcoming shifts and open
 * tasks back to the office, so nothing quietly depends on a person who is gone.
 */
export async function setStaffActive(id: string, active: boolean): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown staff member." };
  if (user.staffId === id) return { error: "You cannot change your own employment status." };
  const [login] = await db.select().from(schema.users).where(eq(schema.users.staffId, id)).limit(1);
  if (login && !mayManageLogin(user, login)) return { error: "Only an administrator can change this person's status." };
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(schema.staff).set({ active }).where(eq(schema.staff.id, id));
    if (!active) {
      if (login) {
        await tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, login.id));
        await tx.delete(schema.sessions).where(eq(schema.sessions.userId, login.id));
        await tx.delete(schema.loginTokens).where(and(eq(schema.loginTokens.userId, login.id), isNull(schema.loginTokens.usedAt)));
      }
      await tx
        .update(schema.shifts)
        .set({ staffId: null, status: "open" })
        .where(and(eq(schema.shifts.staffId, id), gt(schema.shifts.startsAt, now), inArray(schema.shifts.status, ["scheduled", "confirmed"])));
      await tx
        .update(schema.tasks)
        .set({ assignedTo: null })
        .where(and(eq(schema.tasks.assignedTo, id), eq(schema.tasks.status, "open")));
    }
    await tx.insert(schema.auditLog).values({ userId: user.id, action: active ? "staff:return" : "staff:left", entity: "staff", entityId: id });
  });
  revalidatePath("/app/staff");
  revalidatePath(`/app/staff/${id}`);
  revalidatePath("/app/schedule");
  revalidatePath("/app");
  return {};
}

export async function removeCredential(credentialId: string, staffId: string): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(credentialId).success || !uuid.safeParse(staffId).success) return { error: "Unknown credential." };
  await db.delete(schema.credentials).where(and(eq(schema.credentials.id, credentialId), eq(schema.credentials.staffId, staffId)));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "delete", entity: "credential", entityId: credentialId });
  revalidatePath(`/app/staff/${staffId}`);
  revalidatePath("/app/staff");
  revalidatePath("/app");
  return {};
}

/* ---------- Homes ---------- */

async function residentsIn(homeId: string) {
  const [placed] = await db
    .select({ n: count() })
    .from(schema.individuals)
    .where(and(eq(schema.individuals.homeId, homeId), eq(schema.individuals.active, true)));
  return placed.n;
}

export async function updateHome(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown home." };
  const parsed = homeSchema.safeParse(homeFormValues(formData));
  if (!parsed.success) return firstError(parsed.error);
  const placed = await residentsIn(id);
  if (parsed.data.capacity < placed) return { error: `${placed} people live here, so capacity cannot be lower than that.` };
  await db.update(schema.homes).set(parsed.data).where(eq(schema.homes.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "update", entity: "home", entityId: id });
  revalidatePath("/app/homes");
  revalidatePath(`/app/homes/${id}`);
  return {};
}

/*
 * Closing a home needs everyone moved out first. Upcoming shifts there are removed and staff
 * based there become floating, because neither can happen at a closed home.
 */
export async function setHomeActive(id: string, active: boolean): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown home." };
  if (!active) {
    const placed = await residentsIn(id);
    if (placed > 0) return { error: `Move the ${placed} ${placed === 1 ? "person" : "people"} living here to another home first.` };
  }
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(schema.homes).set({ active }).where(eq(schema.homes.id, id));
    if (!active) {
      await tx
        .delete(schema.shifts)
        .where(and(eq(schema.shifts.homeId, id), gt(schema.shifts.startsAt, now), inArray(schema.shifts.status, ["open", "scheduled", "confirmed"])));
      await tx.update(schema.staff).set({ homeId: null }).where(eq(schema.staff.homeId, id));
    }
    await tx.insert(schema.auditLog).values({ userId: user.id, action: active ? "home:reopen" : "home:close", entity: "home", entityId: id });
  });
  revalidatePath("/app/homes");
  revalidatePath(`/app/homes/${id}`);
  revalidatePath("/app/schedule");
  revalidatePath("/app");
  return {};
}

/* ---------- People we support ---------- */

/*
 * Discharge ends support without deleting anything. The person leaves the daily lists, their
 * place in a home is freed, and upcoming medication doses are withdrawn. Their history stays.
 */
export async function dischargeIndividual(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown person." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (reason.length < 3) return { error: "Say why support ended, for example moved to another provider." };
  const day = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Choose the date support ended." };
  const now = new Date();
  const done = await db.transaction(async tx => {
    const [person] = await tx.select().from(schema.individuals).where(eq(schema.individuals.id, id)).for("update");
    if (!person || !person.active) return false;
    await tx.update(schema.individuals).set({ active: false, dischargedAt: day, dischargeReason: reason }).where(eq(schema.individuals.id, id));
    await tx
      .delete(schema.medAdministrations)
      .where(and(eq(schema.medAdministrations.individualId, id), eq(schema.medAdministrations.status, "due"), gt(schema.medAdministrations.scheduledFor, now)));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "individual:discharge", entity: "individual", entityId: id });
    return true;
  });
  if (!done) return { error: "This person is already discharged. Refresh the page." };
  revalidatePath(`/app/individuals/${id}`);
  revalidatePath("/app/individuals");
  revalidatePath("/app/homes");
  revalidatePath("/app");
  return {};
}

export async function readmitIndividual(id: string): Promise<FormState> {
  const user = await requireManager();
  if (!uuid.safeParse(id).success) return { error: "Unknown person." };
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, id)).limit(1);
  if (!person) return { error: "Unknown person." };
  if (person.homeId) {
    const [home] = await db.select().from(schema.homes).where(eq(schema.homes.id, person.homeId)).limit(1);
    const placed = await residentsIn(person.homeId);
    // Their old place may be taken or the home closed. Readmit without a home rather than overfill it.
    if (!home?.active || placed >= home.capacity) {
      await db.update(schema.individuals).set({ homeId: null }).where(eq(schema.individuals.id, id));
    }
  }
  await db.update(schema.individuals).set({ active: true, dischargedAt: null, dischargeReason: "" }).where(eq(schema.individuals.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "individual:readmit", entity: "individual", entityId: id });
  revalidatePath(`/app/individuals/${id}`);
  revalidatePath("/app/individuals");
  revalidatePath("/app/homes");
  revalidatePath("/app");
  return {};
}
