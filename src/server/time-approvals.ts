import "server-only";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { notify } from "@/server/notify";
import { leaveBalance } from "@/server/queries/pay";
import { lockedOn, officePunchesIn, openPunchesIn, sheetFor } from "@/server/queries/payroll";
import { isUuid } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

/*
 * What managers decide about time: flagged punches, punch fixes, time off and timesheets. The website's
 * actions and the phone app both call these, so the rules are the same wherever the decision is made.
 */

type Result = { error?: string };

const uuid = z.uuid();
const LOCKED = "That pay period is locked and has gone to payroll. Add an adjustment to the current period instead.";
const iso = (at: Date | null) => (at ? at.toISOString() : null);

async function logins(staffId: string) {
  return (await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.staffId, staffId), eq(schema.users.active, true)))).map(row => row.id);
}

const snapshot = (totals: Awaited<ReturnType<typeof sheetFor>>["totals"]) => ({ regular: totals.regular, overtime: totals.overtime, total: totals.total, holiday: totals.holiday, adjustments: totals.adjustments, punches: totals.punches });

async function upsertSheet(periodId: string, staffId: string, values: Partial<typeof schema.timesheets.$inferInsert>) {
  await db
    .insert(schema.timesheets)
    .values({ periodId, staffId, ...values })
    .onConflictDoUpdate({ target: [schema.timesheets.periodId, schema.timesheets.staffId], set: values });
}

const OWN_TIME = "Another manager decides your own time. An administrator can change this in Settings, Time clock.";

/* Whether this manager may decide about this staff member's time: not their own, unless the agency allows it. */
async function ownTimeRefused(user: SessionUser, staffId: string) {
  return user.staffId === staffId && (await getSettings()).self_approval !== "on";
}

// Thrown inside a transaction when someone else decided first; nothing is written.
class AlreadyDecided extends Error {}

async function periodById(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const [row] = await db.select().from(schema.payPeriods).where(eq(schema.payPeriods.id, id)).limit(1);
  return row ?? null;
}

/* ---------- Flagged punches ---------- */

/* Marks a flagged punch as looked at, with an optional note kept in its history. */
export async function reviewEntryFor(user: SessionUser, entryId: string, rawNote: string): Promise<Result & { entryId?: string }> {
  if (!canManage(user)) return { error: "Only coordinators and administrators review punches." };
  if (!isUuid(entryId)) return { error: "That punch no longer exists." };
  const [entry] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, entryId)).limit(1);
  if (!entry) return { error: "That punch no longer exists." };
  if (entry.flags.includes("office_work")) {
    if (user.staffId === entry.staffId) return { error: "Another manager must review your office hours." };
    if (!entry.clockOutAt) return { error: "Review office work after the staff member clocks out." };
    if (rawNote.trim().length < 10) return { error: "Record what you checked before reviewing these office hours." };
  }
  if (await ownTimeRefused(user, entry.staffId)) return { error: OWN_TIME };
  const note = rawNote.trim().slice(0, 1000);
  await db.transaction(async tx => {
    await tx.update(schema.timeEntries).set({ reviewedBy: user.id, reviewedAt: new Date() }).where(eq(schema.timeEntries.id, entry.id));
    await tx.insert(schema.timeEntryChanges).values({ entryId: entry.id, userId: user.id, action: "reviewed", reason: note });
  });
  return { entryId: entry.id };
}

/* ---------- Punch fixes asked for by staff ---------- */

/* Approves or declines a staff member's correction request. Approving changes or creates the punch. */
export async function decideCorrectionFor(user: SessionUser, correctionId: string, approve: boolean, rawNote: string): Promise<Result> {
  if (!canManage(user)) return { error: "Only coordinators and administrators decide punch fixes." };
  if (!isUuid(correctionId)) return { error: "Unknown request." };
  const [request] = await db.select().from(schema.timeCorrections).where(eq(schema.timeCorrections.id, correctionId)).limit(1);
  if (!request || request.status !== "pending") return { error: "This request has already been decided." };
  if (await ownTimeRefused(user, request.staffId)) return { error: OWN_TIME };
  if (approve && request.entryId && user.staffId === request.staffId) {
    const [entry] = await db.select({ flags: schema.timeEntries.flags }).from(schema.timeEntries).where(eq(schema.timeEntries.id, request.entryId)).limit(1);
    if (entry?.flags.includes("office_work")) return { error: "Another manager must decide corrections to your office hours." };
  }
  const note = rawNote.trim().slice(0, 1000);
  if (!approve && note.length < 5) return { error: "Say why it is declined. The staff member sees this." };
  if (approve && request.clockInAt && (await lockedOn(dateKey(request.clockInAt)))) return { error: `${LOCKED} Then decline this request with a note saying so.` };
  try {
    await db.transaction(async tx => {
      // Claimed first, so a second tap or a second manager at the same moment changes nothing.
      const claimed = await tx
        .update(schema.timeCorrections)
        .set({ status: approve ? "approved" : "declined", decidedBy: user.id, decidedAt: new Date(), decisionNote: note })
        .where(and(eq(schema.timeCorrections.id, request.id), eq(schema.timeCorrections.status, "pending")))
        .returning({ id: schema.timeCorrections.id });
      if (!claimed.length) throw new AlreadyDecided();
      if (approve) {
        if (request.entryId) {
          const [entry] = await tx.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, request.entryId)).limit(1);
          if (entry) {
            await tx
              .update(schema.timeEntries)
              .set({ clockInAt: request.clockInAt, clockOutAt: request.clockOutAt, closedBy: entry.closedBy ?? "manager", flags: [...new Set([...entry.flags, "corrected"])], ...(entry.flags.includes("office_work") ? { reviewedAt: null, reviewedBy: null } : {}) })
              .where(eq(schema.timeEntries.id, entry.id));
            await tx.update(schema.timeBreaks).set({ endAt: request.clockOutAt }).where(and(eq(schema.timeBreaks.entryId, entry.id), isNull(schema.timeBreaks.endAt)));
            await tx.insert(schema.timeEntryChanges).values({
              entryId: entry.id,
              userId: user.id,
              action: "corrected",
              before: { clockInAt: iso(entry.clockInAt), clockOutAt: iso(entry.clockOutAt) },
              after: { clockInAt: iso(request.clockInAt), clockOutAt: iso(request.clockOutAt) },
              reason: [request.reason, note].filter(Boolean).join(" · "),
            });
          }
        } else {
          const [created] = await tx
            .insert(schema.timeEntries)
            .values({ staffId: request.staffId, homeId: request.homeId, clockInAt: request.clockInAt, clockOutAt: request.clockOutAt, closedBy: "manager", inNote: request.reason, flags: ["corrected"], reviewedBy: user.id, reviewedAt: new Date() })
            .returning({ id: schema.timeEntries.id });
          await tx.insert(schema.timeEntryChanges).values({ entryId: created.id, userId: user.id, action: "added", after: { clockInAt: iso(request.clockInAt), clockOutAt: iso(request.clockOutAt) }, reason: [request.reason, note].filter(Boolean).join(" · ") });
        }
      }
    });
  } catch (error) {
    if (error instanceof AlreadyDecided) return { error: "This request has already been decided." };
    throw error;
  }
  await notify(await logins(request.staffId), {
    kind: "time",
    title: approve ? "Your time correction was approved" : "Your time correction was declined",
    body: note || undefined,
    href: "/app/clock",
    tone: approve ? "good" : "warn",
    dedupeKey: `time:decided:${request.id}`,
  });
  return {};
}

/* ---------- Time off ---------- */

export type TimeOffDecision = { note: string; openShifts: boolean; allowNegative: boolean };

/* Approves or declines a time-off request: takes the leave from the balance, and can open their shifts. */
export async function decideTimeOffFor(user: SessionUser, requestId: string, approve: boolean, decision: TimeOffDecision): Promise<Result> {
  if (!canManage(user)) return { error: "Only coordinators and administrators decide time off." };
  if (!uuid.safeParse(requestId).success) return { error: "Unknown request." };
  const [request] = await db.select().from(schema.timeOffRequests).where(eq(schema.timeOffRequests.id, requestId)).limit(1);
  if (!request || request.status !== "pending") return { error: "This request has already been decided." };
  if (await ownTimeRefused(user, request.staffId)) return { error: OWN_TIME };
  const note = decision.note.trim().slice(0, 500);
  if (!approve && note.length < 3) return { error: "Say why it is declined. They see this." };
  let opened = 0;
  if (approve && request.usesBalance) {
    const balance = await leaveBalance(request.staffId);
    if (balance < request.minutes && !decision.allowNegative) {
      return { error: `They have ${(balance / 60).toFixed(2)} hours of leave and asked for ${(request.minutes / 60).toFixed(2)}. Tick "Allow going below zero" to approve anyway.` };
    }
  }
  try {
    await db.transaction(async tx => {
      // Claimed first, so a second tap cannot take the leave twice.
      const claimed = await tx
        .update(schema.timeOffRequests)
        .set({ status: approve ? "approved" : "declined", decidedBy: user.id, decidedAt: new Date(), decisionNote: note })
        .where(and(eq(schema.timeOffRequests.id, request.id), eq(schema.timeOffRequests.status, "pending")))
        .returning({ id: schema.timeOffRequests.id });
      if (!claimed.length) throw new AlreadyDecided();
      if (approve) {
        if (request.usesBalance) await tx.insert(schema.leaveLedger).values({ staffId: request.staffId, kind: "used", minutes: -request.minutes, onDate: request.startDate, note: request.type, requestId: request.id, createdBy: user.id });
        if (decision.openShifts) {
          const shifts = await tx
            .update(schema.shifts)
            .set({ staffId: null, status: "open" })
            .where(
              and(
                eq(schema.shifts.staffId, request.staffId),
                inArray(schema.shifts.status, ["scheduled", "confirmed"]),
                gte(schema.shifts.startsAt, zonedTime(request.startDate, "00:00")),
                lte(schema.shifts.startsAt, zonedTime(addDays(request.endDate, 1), "00:00")),
              ),
            )
            .returning({ id: schema.shifts.id });
          opened = shifts.length;
        }
      }
      if (opened) await tx.update(schema.timeOffRequests).set({ openedShifts: opened }).where(eq(schema.timeOffRequests.id, request.id));
      await tx.insert(schema.auditLog).values({ userId: user.id, action: approve ? "time_off:approve" : "time_off:decline", entity: "time_off", entityId: request.id });
    });
  } catch (error) {
    if (error instanceof AlreadyDecided) return { error: "This request has already been decided." };
    throw error;
  }
  await notify(await logins(request.staffId), {
    kind: "time-off",
    title: approve ? `Your ${request.type.toLowerCase()} was approved` : `Your ${request.type.toLowerCase()} was declined`,
    body: [request.startDate === request.endDate ? request.startDate : `${request.startDate} to ${request.endDate}`, note].filter(Boolean).join(". "),
    href: "/app/clock/time-off",
    tone: approve ? "good" : "warn",
    dedupeKey: `time-off:decided:${request.id}`,
  });
  return {};
}

/* ---------- Timesheets ---------- */

/* A manager approves a timesheet. Approving one that was not signed needs a note saying why. */
export async function approveTimesheetFor(user: SessionUser, periodId: string, staffId: string, rawNote: string): Promise<Result & { start?: string }> {
  if (!canManage(user)) return { error: "Only coordinators and administrators approve timesheets." };
  const period = await periodById(periodId);
  if (!period || !uuid.safeParse(staffId).success) return { error: "Unknown timesheet." };
  if (period.status === "locked") return { error: "This pay period is locked." };
  if (await ownTimeRefused(user, staffId)) return { error: OWN_TIME };
  const range = { start: period.startDate, end: period.endDate };
  if (await openPunchesIn(range, staffId)) return { error: "A punch in this period is still open. Close it first." };
  const settings = await getSettings();
  const sheet = await sheetFor(staffId, range, settings);
  const office = await officePunchesIn(range, staffId);
  if (office.some(punch => !punch.reviewedAt)) return { error: "A manager must review all office punches before approving this timesheet." };
  if (office.length && user.staffId === staffId) return { error: "Another manager must approve a timesheet containing your office hours." };
  const note = rawNote.trim().slice(0, 1000);
  if (sheet.sheet?.status !== "signed" && note.length < 5) return { error: "They have not signed it. Add a note saying why you are approving it anyway." };
  await upsertSheet(period.id, staffId, { status: "approved", approvedBy: user.id, approvedAt: new Date(), approvalNote: note, approvedTotals: snapshot(sheet.totals), returnNote: "" });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "timesheet:approve", entity: "timesheet", entityId: `${period.id}:${staffId}` });
  await notify(await logins(staffId), { kind: "timesheet", title: "Your timesheet was approved", body: `${period.startDate} to ${period.endDate}`, href: `/app/clock/timesheets/${period.startDate}`, tone: "good", dedupeKey: `timesheet:approved:${period.id}:${staffId}:${Date.now()}` });
  return { start: period.startDate };
}

/* Sends a timesheet back to the staff member to check, with what needs looking at. */
export async function returnTimesheetFor(user: SessionUser, periodId: string, staffId: string, rawNote: string): Promise<Result & { start?: string }> {
  if (!canManage(user)) return { error: "Only coordinators and administrators can do this." };
  const period = await periodById(periodId);
  if (!period || !uuid.safeParse(staffId).success) return { error: "Unknown timesheet." };
  if (period.status === "locked") return { error: "This pay period is locked." };
  const note = rawNote.trim().slice(0, 1000);
  if (note.length < 5) return { error: "Say what they need to check." };
  await upsertSheet(period.id, staffId, { status: "open", returnNote: note, signedName: "", signedAt: null, approvedBy: null, approvedAt: null });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "timesheet:return", entity: "timesheet", entityId: `${period.id}:${staffId}` });
  await notify(await logins(staffId), { kind: "timesheet", title: "Your timesheet needs another look", body: note, href: `/app/clock/timesheets/${period.startDate}`, tone: "warn", dedupeKey: `timesheet:returned:${period.id}:${staffId}:${Date.now()}` });
  return { start: period.startDate };
}
