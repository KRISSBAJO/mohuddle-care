"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, dateKey, zonedTime } from "@/lib/format";
import { canManage, destroySession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { isUuid } from "@/server/queries/timeclock";
import { lockedOn } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";
import { clockInFor, clockOutFor, endBreakFor, startBreakFor } from "@/server/time-clock";
import type { FormState } from "./auth";

const LOCKED = "That pay period is locked and has gone to payroll. Add an adjustment to the current period instead.";

/* True when any of these moments falls in a locked pay period. */
async function touchesLocked(...moments: (Date | null | undefined)[]) {
  for (const at of moments) if (at && (await lockedOn(dateKey(at)))) return true;
  return false;
}

function readPayload(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return null;
  }
}

async function tellManagers(homeId: string | null, except: string, message: Parameters<typeof notify>[1]) {
  const settings = await getSettings();
  const ids = await recipients({ roles: settings.notify_roles_time as Role[], staffIds: [await homeManagerOf(homeId)], except });
  await notify(ids, message);
}

/* ---------- Clock in ---------- */

export async function clockIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await clockInFor(user, readPayload(formData));
  if (result.error) return { error: result.error };
  revalidatePath("/app/clock");
  revalidatePath("/app/time");
  redirect("/app/clock?done=in");
}

/* ---------- Breaks ---------- */

export async function startBreak(kind: "meal" | "rest"): Promise<FormState> {
  const result = await startBreakFor(await requireUser(), kind);
  revalidatePath("/app/clock");
  revalidatePath("/app");
  return result;
}

export async function endBreak(): Promise<FormState> {
  const result = await endBreakFor(await requireUser());
  revalidatePath("/app/clock");
  revalidatePath("/app");
  return result;
}

/* ---------- Clock out ---------- */

export async function clockOut(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await clockOutFor(user, readPayload(formData));
  if (result.error) return { error: result.error };
  revalidatePath("/app/clock");
  revalidatePath("/app/time");
  // A shared device, such as a home's tablet, is handed back signed out.
  if (user.shared && (await getSettings()).shared_device_signout === "on") {
    await destroySession();
    redirect("/login?reason=shared");
  }
  redirect("/app/clock?done=out");
}

/* ---------- Corrections ---------- */

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

export async function requestCorrection(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
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
    const [entry] = await db.select({ staffId: schema.timeEntries.staffId, homeId: schema.timeEntries.homeId }).from(schema.timeEntries).where(eq(schema.timeEntries.id, entryId)).limit(1);
    if (!entry || entry.staffId !== user.staffId) return { error: "That punch is not yours." };
    home = entry.homeId;
  } else if (!home) return { error: "Choose the home you worked at." };
  const [row] = await db
    .insert(schema.timeCorrections)
    .values({ staffId: user.staffId, entryId: entryId || null, homeId: home, clockInAt: inAt, clockOutAt: outAt, reason })
    .returning({ id: schema.timeCorrections.id });
  await tellManagers(home, user.id, { kind: "time", title: `${user.name} asked for a time correction`, body: reason, href: "/app/time?tab=review", tone: "info", dedupeKey: `time:correction:${row.id}` });
  revalidatePath("/app/clock");
  revalidatePath("/app/time");
  redirect("/app/clock?done=correction");
}

/* ---------- Manager fixes ---------- */

const managerTimes = z.object({
  inDay: localDay.optional(),
  inTime: clock.optional(),
  outDay: localDay,
  outTime: clock,
  reason: z.string().trim().min(5, "Give a reason. It is kept with the change.").max(1000),
});

const iso = (at: Date | null) => (at ? at.toISOString() : null);

async function managerEntry(entryId: string) {
  if (!isUuid(entryId)) return null;
  const [entry] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, entryId)).limit(1);
  return entry ?? null;
}

async function staffLogins(staffId: string) {
  return (await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.staffId, staffId), eq(schema.users.active, true)))).map(row => row.id);
}

/* Closes a forgotten clock-out at the time the manager knows they left, or changes the times on a closed one. */
export async function fixEntryTimes(entryId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const entry = await managerEntry(entryId);
  if (!entry) return { error: "That punch no longer exists." };
  const parsed = managerTimes.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the times." };
  const { inDay, inTime, outDay, outTime, reason } = parsed.data;
  const clockInAt = inDay && inTime ? zonedTime(inDay, inTime) : entry.clockInAt;
  const clockOutAt = zonedTime(outDay, outTime);
  if (clockOutAt <= clockInAt) return { error: "The clock-out must be after the clock-in." };
  if (clockOutAt.getTime() > Date.now()) return { error: "The clock-out cannot be in the future." };
  if (clockOutAt.getTime() - clockInAt.getTime() > 24 * 3_600_000) return { error: "A punch cannot be longer than 24 hours. Split it into two." };
  if (await touchesLocked(entry.clockInAt, clockInAt)) return { error: LOCKED };
  const closing = !entry.clockOutAt;
  await db.transaction(async tx => {
    await tx.update(schema.timeBreaks).set({ endAt: clockOutAt }).where(and(eq(schema.timeBreaks.entryId, entry.id), isNull(schema.timeBreaks.endAt)));
    await tx
      .update(schema.timeEntries)
      .set({ clockInAt, clockOutAt, closedBy: closing ? "manager" : entry.closedBy, flags: [...new Set([...entry.flags, closing ? "forgot_clock_out" : "edited"])], reviewedBy: user.id, reviewedAt: new Date() })
      .where(eq(schema.timeEntries.id, entry.id));
    await tx.insert(schema.timeEntryChanges).values({
      entryId: entry.id,
      userId: user.id,
      action: closing ? "closed" : "edited",
      before: { clockInAt: iso(entry.clockInAt), clockOutAt: iso(entry.clockOutAt) },
      after: { clockInAt: iso(clockInAt), clockOutAt: iso(clockOutAt) },
      reason,
    });
    if (closing && entry.shiftId) await tx.update(schema.shifts).set({ status: "completed" }).where(eq(schema.shifts.id, entry.shiftId));
  });
  await notify(await staffLogins(entry.staffId), {
    kind: "time",
    title: closing ? "A manager closed your clock-out" : "A manager changed your punch times",
    body: reason,
    href: "/app/clock",
    tone: "info",
    dedupeKey: `time:fix:${entry.id}:${Date.now()}`,
  });
  revalidatePath(`/app/time/${entry.id}`);
  revalidatePath("/app/time");
  return {};
}

/* Marks a flagged punch as looked at. The flags stay on record. */
export async function reviewEntry(entryId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const entry = await managerEntry(entryId);
  if (!entry) return { error: "That punch no longer exists." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  await db.transaction(async tx => {
    await tx.update(schema.timeEntries).set({ reviewedBy: user.id, reviewedAt: new Date() }).where(eq(schema.timeEntries.id, entry.id));
    await tx.insert(schema.timeEntryChanges).values({ entryId: entry.id, userId: user.id, action: "reviewed", reason: note });
  });
  revalidatePath(`/app/time/${entry.id}`);
  revalidatePath("/app/time");
  return {};
}

/* Approves or declines a staff member's correction request. Approving changes or creates the punch. */
export async function decideCorrection(correctionId: string, approve: boolean, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (!isUuid(correctionId)) return { error: "Unknown request." };
  const [request] = await db.select().from(schema.timeCorrections).where(eq(schema.timeCorrections.id, correctionId)).limit(1);
  if (!request || request.status !== "pending") return { error: "This request has already been decided." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!approve && note.length < 5) return { error: "Say why it is declined. The staff member sees this." };
  if (approve && (await touchesLocked(request.clockInAt))) return { error: `${LOCKED} Then decline this request with a note saying so.` };
  await db.transaction(async tx => {
    if (approve) {
      if (request.entryId) {
        const [entry] = await tx.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, request.entryId)).limit(1);
        if (entry) {
          await tx
            .update(schema.timeEntries)
            .set({ clockInAt: request.clockInAt, clockOutAt: request.clockOutAt, closedBy: entry.closedBy ?? "manager", flags: [...new Set([...entry.flags, "corrected"])] })
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
    await tx.update(schema.timeCorrections).set({ status: approve ? "approved" : "declined", decidedBy: user.id, decidedAt: new Date(), decisionNote: note }).where(eq(schema.timeCorrections.id, request.id));
  });
  await notify(await staffLogins(request.staffId), {
    kind: "time",
    title: approve ? "Your time correction was approved" : "Your time correction was declined",
    body: note || undefined,
    href: "/app/clock",
    tone: approve ? "good" : "warn",
    dedupeKey: `time:decided:${request.id}`,
  });
  revalidatePath("/app/time");
  return {};
}

/* ---------- A home's clock settings ---------- */

const homeClockInput = z.object({
  latitude: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]).default(""),
  longitude: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]).default(""),
  handoverChecks: z.string().max(4000).default(""),
});

export async function saveHomeClock(homeId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canManage(user)) return { error: "Only coordinators and administrators can change this." };
  if (!isUuid(homeId)) return { error: "Unknown home." };
  const parsed = homeClockInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Check the latitude and longitude." };
  const { latitude, longitude, handoverChecks } = parsed.data;
  if ((latitude === "") !== (longitude === "")) return { error: "Enter both latitude and longitude, or neither." };
  await db
    .update(schema.homes)
    .set({
      latitude: latitude === "" ? null : latitude,
      longitude: longitude === "" ? null : longitude,
      handoverChecks: [...new Set(handoverChecks.split("\n").map(line => line.trim()).filter(Boolean))].slice(0, 30),
    })
    .where(eq(schema.homes.id, homeId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "home:clock_settings", entity: "home", entityId: homeId });
  revalidatePath(`/app/homes/${homeId}`);
  return {};
}

