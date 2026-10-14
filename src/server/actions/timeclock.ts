"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, zonedTime } from "@/lib/format";
import { formatMinutes, handoverProblems, lateMinutes, locationVerdict, nameMatches } from "@/lib/timeclock";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { clockInContext, clockOutContext, isUuid, openEntry, unreadHandovers } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

const position = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).optional() })
  .nullable()
  .default(null);

async function client() {
  const list = await headers();
  return { ip: (list.get("x-forwarded-for") ?? list.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 64), userAgent: (list.get("user-agent") ?? "").slice(0, 300) };
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

const clockInInput = z.object({
  shiftId: z.string().nullable().default(null),
  homeId: z.string().nullable().default(null),
  position,
  reason: z.string().trim().max(500).default(""),
  statements: z.array(z.string()).max(30).default([]),
  handoversRead: z.array(z.string()).max(30).default([]),
});

export async function clockIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Your login is not linked to a staff record, so you cannot clock in." };
  const staffId = user.staffId;
  const parsed = clockInInput.safeParse(readPayload(formData));
  if (!parsed.success) return { error: "The clock-in could not be read. Reload the page and try again." };
  const input = parsed.data;
  const settings = await getSettings();
  const now = Date.now();
  if (await openEntry(staffId)) return { error: "You are already clocked in." };

  const context = await clockInContext(staffId, now, settings);
  const flags: string[] = [];
  let homeId: string;
  let shiftId: string | null = null;
  let late = 0;
  if (input.shiftId) {
    if (context.shift?.id !== input.shiftId) return { error: "That shift cannot be clocked in to right now. Reload the page to see your current shift." };
    homeId = context.shift.homeId;
    shiftId = context.shift.id;
    late = lateMinutes(context.shift.startsAt, now, settings.clock_late_grace_minutes);
    if (late) flags.push("late");
  } else {
    if (!isUuid(input.homeId) || !context.homes.some(home => home.id === input.homeId)) return { error: "Choose the home you are working at." };
    if (input.reason.length < 5) return { error: "Say why you are working without a scheduled shift." };
    homeId = input.homeId;
    flags.push("unscheduled");
  }

  const home = context.homes.find(item => item.id === homeId)!;
  const needs = settings.clock_in_requirements;
  const verdict = locationVerdict(home, input.position, settings.clock_geofence_meters, needs.includes("location"));
  if (verdict.state === "outside" || verdict.state === "unavailable") {
    if (input.reason.length < 5) return { error: verdict.state === "outside" ? `You are about ${verdict.distance} meters from ${home.name}. Say why, or move closer and try again.` : "Your location could not be read. Say why, or allow location and try again." };
    flags.push(verdict.state === "outside" ? "away_in" : "no_location_in");
  }

  if (needs.includes("statements")) {
    const missing = settings.clock_in_statements.filter(statement => !input.statements.includes(statement));
    if (missing.length) return { error: `Tick: "${missing[0]}"` };
  }
  const unread = needs.includes("handover") ? (await unreadHandovers(staffId, [homeId], now)) : [];
  if (unread.some(handover => !input.handoversRead.includes(handover.id))) return { error: "Read and tick the handover from the last shift before you clock in." };

  const { ip, userAgent } = await client();
  const entryId = await db.transaction(async tx => {
    const [entry] = await tx
      .insert(schema.timeEntries)
      .values({
        staffId,
        homeId,
        shiftId,
        clockInAt: new Date(now),
        inLatitude: input.position?.latitude ?? null,
        inLongitude: input.position?.longitude ?? null,
        inAccuracy: input.position?.accuracy != null ? Math.round(input.position.accuracy) : null,
        inDistance: verdict.distance,
        inLocation: verdict.state,
        inNote: input.reason,
        unscheduled: !shiftId,
        lateMinutes: late,
        statements: needs.includes("statements") ? settings.clock_in_statements : [],
        flags,
        ip,
        userAgent,
      })
      .returning({ id: schema.timeEntries.id });
    if (unread.length) await tx.insert(schema.handoverReads).values(unread.map(handover => ({ handoverId: handover.id, staffId, entryId: entry.id }))).onConflictDoNothing();
    if (shiftId) await tx.update(schema.shifts).set({ status: "confirmed" }).where(and(eq(schema.shifts.id, shiftId), eq(schema.shifts.status, "scheduled")));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "time:clock_in", entity: "time_entry", entityId: entry.id });
    return entry.id;
  });

  const serious = flags.filter(flag => flag !== "late");
  if (serious.length) {
    await tellManagers(homeId, user.id, {
      kind: "time",
      title: `${user.name} clocked in ${flags.includes("unscheduled") ? "without a scheduled shift" : "away from the home"} at ${home.name}`,
      body: input.reason,
      href: `/app/time/${entryId}`,
      tone: "warn",
      dedupeKey: `time:in:${entryId}`,
    });
  }
  revalidatePath("/app/clock");
  revalidatePath("/app/time");
  redirect("/app/clock?done=in");
}

/* ---------- Breaks ---------- */

export async function startBreak(kind: "meal" | "rest"): Promise<FormState> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const open = await openEntry(user.staffId);
  if (!open) return { error: "You are not clocked in." };
  if (open.openBreak) return { error: "You are already on a break." };
  await db.insert(schema.timeBreaks).values({ entryId: open.entry.id, kind: kind === "rest" ? "rest" : "meal", startAt: new Date() });
  revalidatePath("/app/clock");
  revalidatePath("/app");
  return {};
}

export async function endBreak(): Promise<FormState> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const open = await openEntry(user.staffId);
  if (!open?.openBreak) return { error: "You are not on a break." };
  await db.update(schema.timeBreaks).set({ endAt: new Date() }).where(eq(schema.timeBreaks.id, open.openBreak.id));
  revalidatePath("/app/clock");
  revalidatePath("/app");
  return {};
}

/* ---------- Clock out ---------- */

const clockOutInput = z.object({
  position,
  reason: z.string().trim().max(500).default(""),
  note: z.string().trim().max(4000).default(""),
  people: z.array(z.object({ individualId: z.string(), note: z.string().trim().max(1000) })).max(40).default([]),
  checks: z.array(z.object({ label: z.string().max(200), done: z.boolean(), comment: z.string().trim().max(500).default("") })).max(60).default([]),
  incident: z.enum(["none", "reported", "not_reported"]).default("none"),
  overstayReason: z.string().trim().max(500).default(""),
  attestedName: z.string().trim().max(160).default(""),
  confirmWarnings: z.boolean().default(false),
});

export async function clockOut(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const parsed = clockOutInput.safeParse(readPayload(formData));
  if (!parsed.success) return { error: "The clock-out could not be read. Reload the page and try again." };
  const input = parsed.data;
  const open = await openEntry(user.staffId);
  if (!open) return { error: "You are not clocked in." };
  const [member] = await db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1);
  const settings = await getSettings();
  const now = Date.now();
  const context = await clockOutContext(open, now, settings);
  const blocking = settings.clock_out_blocking;

  const problems = open.entry.homeId
    ? handoverProblems(
        { note: input.note, checks: input.checks, incident: input.incident },
        { minChars: settings.handover_min_chars, checklist: context.checklist, requireNote: blocking.includes("handover"), requireChecks: blocking.includes("checks"), requireIncident: blocking.includes("incident") },
      )
    : [];
  if (problems.length) return { error: problems[0] };

  const warnings: string[] = [];
  const noteLine = `${context.notesMissing} daily ${context.notesMissing === 1 ? "note" : "notes"} not written: ${context.people.filter(person => !person.noteWritten).map(person => person.first).join(", ")}`;
  const doseLine = `${context.dosesMissing} ${context.dosesMissing === 1 ? "dose" : "doses"} not recorded`;
  if (context.notesMissing) {
    if (blocking.includes("notes")) return { error: `Write your daily notes before clocking out. ${noteLine}.` };
    warnings.push(noteLine);
  }
  if (context.dosesMissing) {
    if (blocking.includes("doses")) return { error: `Record every dose before clocking out. ${doseLine}.` };
    warnings.push(doseLine);
  }
  if (input.incident === "not_reported") warnings.push("An incident happened and was not reported yet");
  if (warnings.length && !input.confirmWarnings) return { error: "Tick that you have seen what is still undone." };
  if (context.overstay > 0 && input.overstayReason.length < 5) return { error: `You are ${formatMinutes(context.overstay)} past the end of your shift. Say why you stayed.` };
  if (!member || !nameMatches(input.attestedName, member.first, member.last)) return { error: `Type your full name, ${member?.first ?? ""} ${member?.last ?? ""}, to sign.` };

  const needs = settings.clock_in_requirements;
  const verdict = locationVerdict({ latitude: open.homeLatitude, longitude: open.homeLongitude }, input.position, settings.clock_geofence_meters, needs.includes("location") && Boolean(open.entry.homeId));
  if ((verdict.state === "outside" || verdict.state === "unavailable") && input.reason.length < 5) {
    return { error: verdict.state === "outside" ? `You are about ${verdict.distance} meters from the home. Say why, or move closer and try again.` : "Your location could not be read. Say why, or allow location and try again." };
  }

  const flags = [...open.entry.flags];
  if (verdict.state === "outside") flags.push("away_out");
  if (verdict.state === "unavailable") flags.push("no_location_out");
  if (context.overstay > 0) flags.push("overstay");
  if (warnings.length) flags.push("left_undone");
  const { userAgent } = await client();
  const clockOutAt = new Date(now);
  const peopleNotes = input.people
    .filter(row => row.note && context.people.some(person => person.id === row.individualId))
    .map(row => {
      const person = context.people.find(item => item.id === row.individualId)!;
      return { individualId: row.individualId, name: `${person.first} ${person.last}`, note: row.note };
    });

  await db.transaction(async tx => {
    if (open.openBreak) await tx.update(schema.timeBreaks).set({ endAt: clockOutAt }).where(eq(schema.timeBreaks.id, open.openBreak.id));
    await tx
      .update(schema.timeEntries)
      .set({
        clockOutAt,
        closedBy: "staff",
        outLatitude: input.position?.latitude ?? null,
        outLongitude: input.position?.longitude ?? null,
        outAccuracy: input.position?.accuracy != null ? Math.round(input.position.accuracy) : null,
        outDistance: verdict.distance,
        outLocation: verdict.state,
        inNote: input.reason && verdict.state !== "ok" ? [open.entry.inNote, `Clock out: ${input.reason}`].filter(Boolean).join("\n") : open.entry.inNote,
        overstayReason: input.overstayReason,
        attestedName: input.attestedName,
        warnings,
        flags: [...new Set(flags)],
        userAgent: open.entry.userAgent || userAgent,
      })
      .where(eq(schema.timeEntries.id, open.entry.id));
    if (open.entry.homeId && (input.note || input.checks.length || peopleNotes.length)) {
      await tx.insert(schema.handovers).values({
        homeId: open.entry.homeId,
        entryId: open.entry.id,
        staffId: user.staffId!,
        note: input.note,
        people: peopleNotes,
        checks: context.checklist.map(label => {
          const check = input.checks.find(item => item.label === label);
          return { label, done: check?.done ?? false, comment: check?.comment ?? "" };
        }),
        incident: input.incident,
      });
    }
    if (open.entry.shiftId) await tx.update(schema.shifts).set({ status: "completed" }).where(eq(schema.shifts.id, open.entry.shiftId));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "time:clock_out", entity: "time_entry", entityId: open.entry.id });
  });

  if (flags.some(flag => ["away_out", "no_location_out"].includes(flag)) || input.incident === "not_reported") {
    await tellManagers(open.entry.homeId, user.id, {
      kind: "time",
      title: input.incident === "not_reported" ? `${user.name} clocked out with an incident not yet reported` : `${user.name} clocked out away from ${open.home ?? "the home"}`,
      body: input.reason || undefined,
      href: `/app/time/${open.entry.id}`,
      tone: input.incident === "not_reported" ? "bad" : "warn",
      dedupeKey: `time:out:${open.entry.id}`,
    });
  }
  revalidatePath("/app/clock");
  revalidatePath("/app/time");
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

