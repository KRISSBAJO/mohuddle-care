"use server";
import * as selfService from "@/server/time-self-service";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKey } from "@/lib/format";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { decideTimeOffFor } from "@/server/time-approvals";
import type { FormState } from "./auth";

const uuid = z.uuid();
const day = z.iso.date("Choose a date.");
const money = z.coerce.number().min(0.01, "Enter the rate in dollars, for example 16.50.").max(500, "That rate looks too high.");

async function admin() {
  const user = await requireUser();
  return user.role === "admin" ? user : null;
}
async function manager() {
  const user = await requireUser();
  return canManage(user) ? user : null;
}

/* ---------- Pay rates (administrators only) ---------- */

const rateInput = z.object({ rate: money, effectiveFrom: day, note: z.string().trim().max(300).default("") });

export async function addPayRate(staffId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only administrators can see or change pay rates." };
  if (!uuid.safeParse(staffId).success) return { error: "Unknown staff member." };
  const parsed = rateInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the rate." };
  await db.insert(schema.payRates).values({ staffId, centsPerHour: Math.round(parsed.data.rate * 100), effectiveFrom: parsed.data.effectiveFrom, note: parsed.data.note, createdBy: user.id });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "pay_rate:add", entity: "staff", entityId: staffId });
  revalidatePath(`/app/staff/${staffId}`);
  return {};
}

export async function removePayRate(rateId: string): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only administrators can change pay rates." };
  if (!uuid.safeParse(rateId).success) return { error: "Unknown rate." };
  const [row] = await db.delete(schema.payRates).where(eq(schema.payRates.id, rateId)).returning({ staffId: schema.payRates.staffId });
  if (row) {
    await db.insert(schema.auditLog).values({ userId: user.id, action: "pay_rate:remove", entity: "staff", entityId: row.staffId });
    revalidatePath(`/app/staff/${row.staffId}`);
  }
  return {};
}

/* ---------- Differentials (administrators only) ---------- */

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 23:00.");
const differentialInput = z
  .object({
    name: z.string().trim().min(2, "Name it, for example Overnight.").max(80),
    kind: z.enum(["hours", "days", "home"]),
    startTime: z.union([z.literal(""), clock]).default(""),
    endTime: z.union([z.literal(""), clock]).default(""),
    homeId: z.union([z.literal(""), z.uuid()]).default(""),
    amount: z.coerce.number().min(0.01, "Enter the extra per hour, for example 1.00.").max(100),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "hours" && (!value.startTime || !value.endTime)) ctx.addIssue({ code: "custom", message: "Enter the start and end times." });
    if (value.kind === "home" && !value.homeId) ctx.addIssue({ code: "custom", message: "Choose the home." });
  });

export async function saveDifferential(differentialId: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only administrators can change pay differentials." };
  if (differentialId && !uuid.safeParse(differentialId).success) return { error: "Unknown differential." };
  const parsed = differentialInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the differential." };
  const days = [...new Set(formData.getAll("days").map(Number).filter(n => n >= 1 && n <= 7))].sort();
  if (parsed.data.kind === "days" && !days.length) return { error: "Choose at least one day." };
  const values = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    startTime: parsed.data.kind === "hours" ? parsed.data.startTime : "",
    endTime: parsed.data.kind === "hours" ? parsed.data.endTime : "",
    days: parsed.data.kind === "home" ? [] : days,
    homeId: parsed.data.kind === "home" ? parsed.data.homeId : null,
    centsPerHour: Math.round(parsed.data.amount * 100),
  };
  if (differentialId) await db.update(schema.payDifferentials).set(values).where(eq(schema.payDifferentials.id, differentialId));
  else await db.insert(schema.payDifferentials).values(values);
  await db.insert(schema.auditLog).values({ userId: user.id, action: differentialId ? "differential:update" : "differential:create", entity: "pay_differential", entityId: differentialId ?? "" });
  revalidatePath("/app/settings/differentials");
  return {};
}

export async function setDifferentialActive(differentialId: string, active: boolean): Promise<FormState> {
  const user = await admin();
  if (!user) return { error: "Only administrators can change pay differentials." };
  if (!uuid.safeParse(differentialId).success) return { error: "Unknown differential." };
  await db.update(schema.payDifferentials).set({ active }).where(eq(schema.payDifferentials.id, differentialId));
  revalidatePath("/app/settings/differentials");
  return {};
}

/* ---------- Leave balance ---------- */

const leaveInput = z.object({ hours: z.coerce.number().min(-2000).max(2000).refine(value => value !== 0, "Enter the hours to add, or a minus number to take away."), note: z.string().trim().min(3, "Say why, for example opening balance.").max(300) });

export async function adjustLeave(staffId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators can change leave balances." };
  if (!uuid.safeParse(staffId).success) return { error: "Unknown staff member." };
  const parsed = leaveInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the hours." };
  await db.insert(schema.leaveLedger).values({ staffId, kind: "adjustment", minutes: Math.round(parsed.data.hours * 60), onDate: dateKey(), note: parsed.data.note, createdBy: user.id });
  revalidatePath(`/app/staff/${staffId}`);
  revalidatePath("/app/clock/time-off");
  return {};
}

/* ---------- Time off ---------- */


export async function requestTimeOff(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await selfService.requestTimeOff(await requireUser(), formData);
  if (result.error) return result;
  revalidatePath("/app/clock");
  revalidatePath("/app/clock/time-off");
  revalidatePath("/app/clock/timesheets");
  revalidatePath("/app/time");
  return {};
}
/* Staff can cancel a request that is waiting, or an approved one that has not started. */
export async function cancelTimeOff(requestId: string): Promise<FormState> {
  const result = await selfService.cancelTimeOff(await requireUser(), requestId);
  if (result.error) return result;
  revalidatePath("/app/clock");
  revalidatePath("/app/clock/time-off");
  revalidatePath("/app/clock/timesheets");
  revalidatePath("/app/time");
  return {};
}
/*
 * Approves or declines a request. Approving can hand the person's shifts on those days to the open
 * shift list, and takes leave from the balance for types that use it.
 */
export async function decideTimeOff(requestId: string, approve: boolean, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators decide time off." };
  const result = await decideTimeOffFor(user, requestId, approve, { note: String(formData.get("note") ?? ""), openShifts: formData.get("openShifts") === "on", allowNegative: formData.get("allowNegative") === "on" });
  if (result.error) return result;
  revalidatePath("/app/time");
  revalidatePath("/app/schedule");
  revalidatePath("/app/clock/time-off");
  return {};
}
