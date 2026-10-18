"use server";
import * as selfService from "@/server/time-self-service";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dateKey, zonedTime } from "@/lib/format";
import { canManage, destroySession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { notify } from "@/server/notify";
import { isUuid } from "@/server/queries/timeclock";
import { lockedOn } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";
import { clockInFor, clockOutFor, endBreakFor, startBreakFor } from "@/server/time-clock";
import { decideCorrectionFor, reviewEntryFor } from "@/server/time-approvals";
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


export async function requestCorrection(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await selfService.requestCorrection(await requireUser(), formData);
  if (result.error) return result;
  revalidatePath("/app/clock");
  revalidatePath("/app/clock/time-off");
  revalidatePath("/app/clock/timesheets");
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
  const result = await reviewEntryFor(user, entryId, String(formData.get("note") ?? ""));
  if (result.error) return { error: result.error };
  revalidatePath(`/app/time/${result.entryId}`);
  revalidatePath("/app/time");
  return {};
}

/* Approves or declines a staff member's correction request. Approving changes or creates the punch. */
export async function decideCorrection(correctionId: string, approve: boolean, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  const result = await decideCorrectionFor(user, correctionId, approve, String(formData.get("note") ?? ""));
  if (result.error) return result;
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

