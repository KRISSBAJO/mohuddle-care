"use server";
import * as selfService from "@/server/time-self-service";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKey } from "@/lib/format";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { notify } from "@/server/notify";
import { ensurePeriod, isDay, openPunchesIn, sheetFor, type PeriodRow } from "@/server/queries/payroll";
import { accrual } from "@/lib/pay";
import { leaveBalances } from "@/server/queries/pay";
import { getSettings } from "@/server/settings";
import { approveTimesheetFor, returnTimesheetFor } from "@/server/time-approvals";
import type { FormState } from "./auth";

const uuid = z.uuid();

async function manager() {
  const user = await requireUser();
  return canManage(user) ? user : null;
}

async function periodById(id: string): Promise<PeriodRow | null> {
  if (!uuid.safeParse(id).success) return null;
  const [row] = await db.select().from(schema.payPeriods).where(eq(schema.payPeriods.id, id)).limit(1);
  return row ?? null;
}

const snapshot = (totals: Awaited<ReturnType<typeof sheetFor>>["totals"]) => ({ regular: totals.regular, overtime: totals.overtime, total: totals.total, holiday: totals.holiday, adjustments: totals.adjustments, punches: totals.punches });

async function upsertSheet(periodId: string, staffId: string, values: Partial<typeof schema.timesheets.$inferInsert>) {
  await db
    .insert(schema.timesheets)
    .values({ periodId, staffId, ...values })
    .onConflictDoUpdate({ target: [schema.timesheets.periodId, schema.timesheets.staffId], set: values });
}

async function logins(staffId: string) {
  return (await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.staffId, staffId), eq(schema.users.active, true)))).map(row => row.id);
}

function refresh(start: string, staffId?: string) {
  revalidatePath("/app/time");
  revalidatePath("/app/clock/timesheets");
  revalidatePath(`/app/clock/timesheets/${start}`);
  if (staffId) revalidatePath(`/app/time/sheets/${start}/${staffId}`);
}

/* A staff member signs their own timesheet once the period has ended and nothing is still open. */
export async function signTimesheet(start: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await selfService.signTimesheet(await requireUser(), start, formData);
  if (result.error) return result;
  revalidatePath("/app/clock");
  revalidatePath("/app/clock/time-off");
  revalidatePath("/app/clock/timesheets");
  revalidatePath("/app/time");
  return {};
}
/* A manager approves a timesheet. Approving one that was not signed needs a note saying why. */
export async function approveTimesheet(periodId: string, staffId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators approve timesheets." };
  const result = await approveTimesheetFor(user, periodId, staffId, String(formData.get("note") ?? ""));
  if (result.error) return { error: result.error };
  refresh(result.start!, staffId);
  return {};
}

/* Approves every signed timesheet in the period that has no open punch. */
export async function approveSigned(periodId: string): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators approve timesheets." };
  const period = await periodById(periodId);
  if (!period || period.status === "locked") return { error: "This pay period cannot be changed." };
  const settings = await getSettings();
  const signed = await db.select({ staffId: schema.timesheets.staffId }).from(schema.timesheets).where(and(eq(schema.timesheets.periodId, period.id), eq(schema.timesheets.status, "signed")));
  const range = { start: period.startDate, end: period.endDate };
  for (const { staffId } of signed) {
    if (await openPunchesIn(range, staffId)) continue;
    const sheet = await sheetFor(staffId, range, settings);
    await upsertSheet(period.id, staffId, { status: "approved", approvedBy: user.id, approvedAt: new Date(), approvedTotals: snapshot(sheet.totals) });
    await notify(await logins(staffId), { kind: "timesheet", title: "Your timesheet was approved", body: `${period.startDate} to ${period.endDate}`, href: `/app/clock/timesheets/${period.startDate}`, tone: "good", dedupeKey: `timesheet:approved:${period.id}:${staffId}:${Date.now()}` });
  }
  await db.insert(schema.auditLog).values({ userId: user.id, action: "timesheet:approve_signed", entity: "pay_period", entityId: period.id });
  refresh(period.startDate);
  return {};
}

/* Sends a timesheet back to the staff member to check, with what needs looking at. */
export async function returnTimesheet(periodId: string, staffId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators can do this." };
  const result = await returnTimesheetFor(user, periodId, staffId, String(formData.get("note") ?? ""));
  if (result.error) return { error: result.error };
  refresh(result.start!, staffId);
  return {};
}

const adjustmentInput = z.object({
  hours: z.coerce.number().min(-80, "At most 80 hours either way.").max(80, "At most 80 hours either way.").refine(value => value !== 0, "Enter the hours to add, or a minus number to take away."),
  overtime: z.literal("on").optional(),
  relatesTo: z.union([z.literal(""), z.iso.date()]).default(""),
  reason: z.string().trim().min(5, "Give the reason. It is kept with the timesheet.").max(500),
});

/*
 * Adds or takes away hours on a timesheet, for example a fix to a punch in a locked period. If the
 * timesheet was approved it goes back to waiting for approval, since its totals changed.
 */
export async function addAdjustment(periodId: string, staffId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators can adjust timesheets." };
  const period = await periodById(periodId);
  if (!period || !uuid.safeParse(staffId).success) return { error: "Unknown timesheet." };
  if (period.status === "locked") return { error: "This pay period is locked. Add the adjustment to the current period instead." };
  const parsed = adjustmentInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the adjustment." };
  const { hours, overtime, relatesTo, reason } = parsed.data;
  await db.transaction(async tx => {
    await tx.insert(schema.timeAdjustments).values({ periodId: period.id, staffId, minutes: Math.round(hours * 60), overtime: overtime === "on", relatesTo: relatesTo || null, reason, createdBy: user.id });
    const [sheet] = await tx.select().from(schema.timesheets).where(and(eq(schema.timesheets.periodId, period.id), eq(schema.timesheets.staffId, staffId))).limit(1);
    if (sheet?.status === "approved") await tx.update(schema.timesheets).set({ status: sheet.signedAt ? "signed" : "open", approvedAt: null, approvedBy: null }).where(eq(schema.timesheets.id, sheet.id));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "timesheet:adjust", entity: "timesheet", entityId: `${period.id}:${staffId}` });
  });
  refresh(period.startDate, staffId);
  return {};
}

export async function removeAdjustment(adjustmentId: string): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators can adjust timesheets." };
  if (!uuid.safeParse(adjustmentId).success) return { error: "Unknown adjustment." };
  const [row] = await db
    .select({ adjustment: schema.timeAdjustments, status: schema.payPeriods.status, start: schema.payPeriods.startDate })
    .from(schema.timeAdjustments)
    .innerJoin(schema.payPeriods, eq(schema.payPeriods.id, schema.timeAdjustments.periodId))
    .where(eq(schema.timeAdjustments.id, adjustmentId))
    .limit(1);
  if (!row) return { error: "Unknown adjustment." };
  if (row.status === "locked") return { error: "This pay period is locked." };
  await db.delete(schema.timeAdjustments).where(eq(schema.timeAdjustments.id, adjustmentId));
  await db
    .update(schema.timesheets)
    .set({ status: "open", approvedAt: null, approvedBy: null })
    .where(and(eq(schema.timesheets.periodId, row.adjustment.periodId), eq(schema.timesheets.staffId, row.adjustment.staffId), eq(schema.timesheets.status, "approved")));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "timesheet:adjust_remove", entity: "timesheet", entityId: `${row.adjustment.periodId}:${row.adjustment.staffId}` });
  refresh(row.start, row.adjustment.staffId);
  return {};
}

/*
 * Locks a finished period: punches in it can no longer change. Timesheets not yet approved need the
 * "lock anyway" tick, so nothing is left behind by accident.
 */
export async function lockPeriod(periodId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await manager();
  if (!user) return { error: "Only coordinators and administrators can lock a pay period." };
  const period = await periodById(periodId);
  if (!period) return { error: "Unknown pay period." };
  if (period.status === "locked") return { error: "Already locked." };
  if (period.endDate >= dateKey()) return { error: "A pay period can be locked once it has ended." };
  const range = { start: period.startDate, end: period.endDate };
  const open = await openPunchesIn(range);
  if (open) return { error: `${open} ${open === 1 ? "punch is" : "punches are"} still open in this period. Close them first.` };
  const settings = await getSettings();
  const { periodOverview } = await import("@/server/queries/payroll");
  const overview = await periodOverview(range, settings);
  const waiting = overview.rows.filter(row => row.sheet?.status !== "approved");
  if (waiting.length && formData.get("anyway") !== "on") return { error: `${waiting.length} ${waiting.length === 1 ? "timesheet is" : "timesheets are"} not approved yet. Approve them, or tick "Lock anyway".` };
  // Leave is earned on the hours actually worked in the period, once it is locked.
  const balances = await leaveBalances(overview.rows.map(row => row.id));
  const earned = overview.rows
    .map(row => ({ staffId: row.id, minutes: accrual(row.totals.total - row.totals.adjustments, settings.pto_accrual_hours_worked, balances.get(row.id) ?? 0, settings.pto_max_balance_hours * 60) }))
    .filter(row => row.minutes > 0);
  await db.transaction(async tx => {
    await tx.update(schema.payPeriods).set({ status: "locked", lockedBy: user.id, lockedAt: new Date() }).where(eq(schema.payPeriods.id, period.id));
    if (earned.length) await tx.insert(schema.leaveLedger).values(earned.map(row => ({ staffId: row.staffId, kind: "accrual" as const, minutes: row.minutes, onDate: period.endDate, note: `Earned ${period.startDate} to ${period.endDate}`, periodId: period.id, createdBy: user.id })));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "pay_period:lock", entity: "pay_period", entityId: period.id });
  });
  refresh(period.startDate);
  return {};
}

/* Administrators can unlock a period to fix a mistake. The reason is kept. */
export async function unlockPeriod(periodId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only an administrator can unlock a pay period." };
  const period = await periodById(periodId);
  if (!period || period.status !== "locked") return { error: "This period is not locked." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (reason.length < 5) return { error: "Give the reason for unlocking. It is kept." };
  await db.update(schema.payPeriods).set({ status: "open", lockedBy: null, lockedAt: null }).where(eq(schema.payPeriods.id, period.id));
  // Leave earned when it was locked is taken back; it is earned again when it is locked again.
  await db.delete(schema.leaveLedger).where(and(eq(schema.leaveLedger.periodId, period.id), eq(schema.leaveLedger.kind, "accrual")));
  await db.insert(schema.auditLog).values({ userId: user.id, action: `pay_period:unlock:${reason}`.slice(0, 200), entity: "pay_period", entityId: period.id });
  refresh(period.startDate);
  return {};
}

/* Makes sure the row for a period exists, for pages that link by start date. */
export async function touchPeriod(start: string, end: string) {
  if (!isDay(start) || !isDay(end)) return null;
  return ensurePeriod({ start, end });
}
