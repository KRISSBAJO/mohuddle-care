"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, dateKey } from "@/lib/format";
import { daysInRange } from "@/lib/pay";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { getSettings } from "@/server/settings";
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

const requestInput = z.object({
  type: z.string().trim().min(1, "Choose the type of time off."),
  startDate: day,
  endDate: day,
  hours: z.coerce.number().min(0.25, "Enter the hours you need off.").max(24 * 31),
  reason: z.string().trim().max(500).default(""),
});

export async function requestTimeOff(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const parsed = requestInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the request." };
  const { type, startDate, endDate, hours, reason } = parsed.data;
  const settings = await getSettings();
  const paid = settings.time_off_types.includes(type);
  if (!paid && !settings.time_off_unpaid_types.includes(type)) return { error: "Choose a type from the list." };
  if (endDate < startDate) return { error: "The last day is before the first day." };
  const days = daysInRange(startDate, endDate).length;
  if (days > 31) return { error: "One request covers at most 31 days." };
  if (hours > days * 24) return { error: "That is more hours than there are in those days." };
  if (endDate < addDays(dateKey(), -30)) return { error: "That is more than 30 days ago. Ask your manager instead." };
  const usesBalance = paid && settings.time_off_balance_types.includes(type);
  const [row] = await db
    .insert(schema.timeOffRequests)
    .values({ staffId: user.staffId, type, paid, usesBalance, startDate, endDate, minutes: Math.round(hours * 60), reason })
    .returning({ id: schema.timeOffRequests.id });
  const [member] = await db.select({ homeId: schema.staff.homeId }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1);
  const ids = await recipients({ roles: settings.notify_roles_time as Role[], staffIds: [await homeManagerOf(member?.homeId)], except: user.id });
  await notify(ids, { kind: "time-off", title: `${user.name} asked for ${type.toLowerCase()}`, body: `${startDate === endDate ? startDate : `${startDate} to ${endDate}`}, ${hours} hours${reason ? `. ${reason}` : ""}`, href: "/app/time?tab=timeoff", tone: "info", dedupeKey: `time-off:new:${row.id}` });
  revalidatePath("/app/clock/time-off");
  revalidatePath("/app/time");
  return {};
}

/* Staff can cancel a request that is waiting, or an approved one that has not started. */
export async function cancelTimeOff(requestId: string): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(requestId).success) return { error: "Unknown request." };
  const [request] = await db.select().from(schema.timeOffRequests).where(eq(schema.timeOffRequests.id, requestId)).limit(1);
  if (!request || request.staffId !== user.staffId) return { error: "That request is not yours." };
  if (request.status === "approved" && request.startDate <= dateKey()) return { error: "It has already started. Ask your manager to change it." };
  if (!["pending", "approved"].includes(request.status)) return { error: "This request is already closed." };
  await db.transaction(async tx => {
    await tx.update(schema.timeOffRequests).set({ status: "cancelled" }).where(eq(schema.timeOffRequests.id, requestId));
    await tx.delete(schema.leaveLedger).where(eq(schema.leaveLedger.requestId, requestId));
  });
  revalidatePath("/app/clock/time-off");
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
