import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { daysInRange } from "@/lib/pay";
import { nameMatches } from "@/lib/timeclock";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { isDay, lockedOn, openPunchesIn, sheetFor } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";
import type { FormState } from "@/server/actions/auth";
const uuid = z.uuid();
const day = z.iso.date("Choose a date.");


const requestInput = z.object({
  type: z.string().trim().min(1, "Choose the type of time off."),
  startDate: day,
  endDate: day,
  hours: z.coerce.number().min(0.25, "Enter the hours you need off.").max(24 * 31),
  reason: z.string().trim().max(500).default(""),
});


export async function requestTimeOff(user: SessionUser, formData: FormData): Promise<FormState> {
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
  return {};
}

export async function cancelTimeOff(user: SessionUser, requestId: string): Promise<FormState> {
  if (!uuid.safeParse(requestId).success) return { error: "Unknown request." };
  return db.transaction(async tx => {
    const [request] = await tx.select().from(schema.timeOffRequests).where(eq(schema.timeOffRequests.id, requestId)).for("update");
    if (!request || request.staffId !== user.staffId) return { error: "That request is not yours." };
    if (request.status === "approved" && request.startDate <= dateKey()) return { error: "It has already started. Ask your manager to change it." };
    if (!["pending", "approved"].includes(request.status)) return { error: "This request is already closed." };
    await tx.update(schema.timeOffRequests).set({ status: "cancelled" }).where(eq(schema.timeOffRequests.id, requestId));
    await tx.delete(schema.leaveLedger).where(eq(schema.leaveLedger.requestId, requestId));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "time_off:cancel", entity: "time_off", entityId: requestId });
    return {};
  });
}

const snapshot = (totals: Awaited<ReturnType<typeof sheetFor>>["totals"]) => ({ regular: totals.regular, overtime: totals.overtime, total: totals.total, holiday: totals.holiday, adjustments: totals.adjustments, punches: totals.punches });

async function upsertSheet(periodId: string, staffId: string, values: Partial<typeof schema.timesheets.$inferInsert>) {
  return db
    .insert(schema.timesheets)
    .values({ periodId, staffId, ...values })
    .onConflictDoUpdate({ target: [schema.timesheets.periodId, schema.timesheets.staffId], set: values, setWhere: ne(schema.timesheets.status, "approved") }).returning({ id: schema.timesheets.id });
}


export async function signTimesheet(user: SessionUser, start: string, formData: FormData): Promise<FormState> {
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  if (!isDay(start)) return { error: "Unknown pay period." };
  const settings = await getSettings();
  const [period] = await db.select().from(schema.payPeriods).where(eq(schema.payPeriods.startDate, start)).limit(1);
  if (!period) return { error: "Unknown pay period." };
  if (period.status === "locked") return { error: "This pay period is locked." };
  if (period.endDate > dateKey()) return { error: `You can sign from ${period.endDate}, the last day of the period.` };
  if (await openPunchesIn({ start: period.startDate, end: period.endDate }, user.staffId)) return { error: "You are still clocked in on a punch in this period. Clock out or ask for a correction first." };
  const [member] = await db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1);
  const signedName = String(formData.get("signedName") ?? "").trim();
  if (!member || !nameMatches(signedName, member.first, member.last)) return { error: `Type your full name, ${member?.first ?? ""} ${member?.last ?? ""}, to sign.` };
  const sheet = await sheetFor(user.staffId, { start: period.startDate, end: period.endDate }, settings);
  if (sheet.sheet?.status === "approved") return { error: "This timesheet is already approved." };
  const changed = await upsertSheet(period.id, user.staffId, { status: "signed", signedName, signedAt: new Date(), signedTotals: snapshot(sheet.totals), returnNote: "" });
  if (!changed.length) return { error: "This timesheet was approved while you were signing. Refresh it." };
  await db.insert(schema.auditLog).values({ userId: user.id, action: "timesheet:sign", entity: "timesheet", entityId: `${period.id}:${user.staffId}` });
  return {};
}

const localDay = z.iso.date("Choose the date.");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:00.");

/* "07:00 to 15:00" on a day, rolling the end into the next day when it is earlier than the start. */
function span(day: string, start: string, end: string) {
  const inAt = zonedTime(day, start);
  let outAt = zonedTime(day, end);
  if (outAt <= inAt) outAt = zonedTime(addDays(day, 1), end);
  return { inAt, outAt };
}

const correctionInput = z.object({
  entryId: z.union([z.literal(""), z.uuid()]).default(""),
  homeId: z.union([z.literal(""), z.uuid()]).default(""),
  day: localDay,
  start: clock,
  end: clock,
  reason: z.string().trim().min(10, "Explain what happened in a sentence or two.").max(1000),
});


async function touchesLocked(...moments: (Date | null | undefined)[]) {
  for (const at of moments) if (at && (await lockedOn(dateKey(at)))) return true;
  return false;
}


async function tellManagers(homeId: string | null, except: string, message: Parameters<typeof notify>[1]) {
  const settings = await getSettings();
  const ids = await recipients({ roles: settings.notify_roles_time as Role[], staffIds: [await homeManagerOf(homeId)], except });
  await notify(ids, message);
}


export async function requestCorrection(user: SessionUser, formData: FormData): Promise<FormState> {
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const parsed = correctionInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the request." };
  const { entryId, homeId, day, start, end, reason } = parsed.data;
  const { inAt, outAt } = span(day, start, end);
  if (outAt.getTime() > Date.now()) return { error: "The end time is in the future." };
  if (outAt.getTime() - inAt.getTime() > 24 * 3_600_000) return { error: "One request covers at most 24 hours." };
  if (await touchesLocked(inAt)) return { error: "That pay period is locked and has gone to payroll. Ask your manager to add an adjustment to your current timesheet." };
  let home = homeId || null;
  if (entryId) {
    const [entry] = await db.select({ staffId: schema.timeEntries.staffId, homeId: schema.timeEntries.homeId, clockInAt: schema.timeEntries.clockInAt }).from(schema.timeEntries).where(eq(schema.timeEntries.id, entryId)).limit(1);
    if (!entry || entry.staffId !== user.staffId) return { error: "That punch is not yours." };
    if (await touchesLocked(entry.clockInAt)) return { error: "That punch belongs to a locked period. Ask your manager for an adjustment." };
    home = entry.homeId;
  } else {
    if (!home) return { error: "Choose the home you worked at." };
    const [found] = await db.select({ id: schema.homes.id }).from(schema.homes).where(and(eq(schema.homes.id, home), eq(schema.homes.active, true))).limit(1);
    if (!found) return { error: "Choose an active home in this agency." };
  }
  const [row] = await db
    .insert(schema.timeCorrections)
    .values({ staffId: user.staffId, entryId: entryId || null, homeId: home, clockInAt: inAt, clockOutAt: outAt, reason })
    .returning({ id: schema.timeCorrections.id });
  await tellManagers(home, user.id, { kind: "time", title: `${user.name} asked for a time correction`, body: reason, href: "/app/time?tab=review", tone: "info", dedupeKey: `time:correction:${row.id}` });
  return {};
}
