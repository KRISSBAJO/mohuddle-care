import "server-only";
import { clientIpFrom } from "@/server/client-ip";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { formatMinutes, handoverProblems, lateMinutes, locationVerdict, nameMatches } from "@/lib/timeclock";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { clockInContext, clockOutContext, isUuid, openEntry, unreadHandovers } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

/*
 * Clocking in, breaks and clocking out, with every rule the agency set. The website's actions and
 * the phone app's routes both call these, so the two can never disagree.
 */

export type Punch = { entryId: string; error?: undefined } | { error: string; entryId?: undefined };

const position = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).optional() })
  .nullable()
  .default(null);

async function client() {
  const list = await headers();
  return { ip: clientIpFrom(list), userAgent: (list.get("user-agent") ?? "").slice(0, 300) };
}

async function tellManagers(homeId: string | null, except: string, message: Parameters<typeof notify>[1]) {
  const settings = await getSettings();
  const ids = await recipients({ roles: settings.notify_roles_time as Role[], staffIds: [await homeManagerOf(homeId)], except });
  await notify(ids, message);
}

/* The staff who wrote these handovers. */
async function handoverWriters(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ staffId: schema.handovers.staffId }).from(schema.handovers).where(inArray(schema.handovers.id, ids));
  return rows.map(row => row.staffId).filter((id): id is string => Boolean(id));
}

/* ---------- Clock in ---------- */

const clockInInput = z.object({
  shiftId: z.string().nullable().default(null),
  homeId: z.string().nullable().default(null),
  position,
  reason: z.string().trim().max(500).default(""),
  statements: z.array(z.string()).max(30).default([]),
  handoversRead: z.array(z.string()).max(30).default([]),
  // Anything not as handed over, from the person taking over. Goes to the manager and the outgoing staff.
  handoverRemark: z.string().trim().max(1000).default(""),
});

/* Clocks a staff member in. Shared by the website and the phone app; every rule is checked here. */
/* Whether a database error is this unique rule refusing a duplicate. The driver may wrap the error. */
function breaks(error: unknown, constraint: string) {
  for (let current = error as { code?: string; constraint?: string; cause?: unknown } | undefined; current; current = current.cause as typeof current) {
    if (current.code === "23505" && current.constraint === constraint) return true;
  }
  return false;
}

export async function clockInFor(user: SessionUser, payload: unknown): Promise<Punch> {
  if (!user.staffId) return { error: "Your login is not linked to a staff record, so you cannot clock in." };
  const staffId = user.staffId;
  const parsed = clockInInput.safeParse(payload);
  if (!parsed.success) return { error: "The clock-in could not be read. Reload and try again." };
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
    if (late && late >= Math.max(settings.clock_late_exception_minutes, settings.clock_late_grace_minutes)) flags.push("late");
  } else {
    if (!isUuid(input.homeId) || !context.homes.some(home => home.id === input.homeId)) return { error: "Choose the home you are working at." };
    if (input.reason.length < 5) return { error: "Say why you are working without a scheduled shift." };
    homeId = input.homeId;
    flags.push("unscheduled");
  }

  const home = context.homes.find(item => item.id === homeId)!;
  const needs = settings.clock_in_requirements;
  const verdict = locationVerdict(home, input.position, settings.clock_geofence_meters, needs.includes("location"));
  if (verdict.state === "outside") {
    if (input.reason.length < 5) return { error: `You are about ${verdict.distance} meters from ${home.name}. Say why, or move closer and try again.` };
    flags.push("away_in");
  }
  // No location (blocked, switched off or no signal) never stops a clock-in. It is recorded as an exception and managers are told.
  if (verdict.state === "unavailable") flags.push("no_location_in");

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
    if (unread.length) await tx.insert(schema.handoverReads).values(unread.map(handover => ({ handoverId: handover.id, staffId, entryId: entry.id, remark: input.handoverRemark }))).onConflictDoNothing();
    if (shiftId) await tx.update(schema.shifts).set({ status: "confirmed" }).where(and(eq(schema.shifts.id, shiftId), eq(schema.shifts.status, "scheduled")));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "time:clock_in", entity: "time_entry", entityId: entry.id });
    return entry.id;
  }).catch(error => {
    // Another clock-in for this person landed a moment earlier (a double tap, or two devices).
    if (breaks(error, "time_entries_one_open")) return null;
    throw error;
  });
  if (!entryId) return { error: "You are already clocked in." };

  // A remark on the handover goes to the home's managers and to everyone who handed over.
  if (unread.length && input.handoverRemark) {
    const from = [...new Set(unread.map(handover => handover.staff).filter(Boolean))].join(", ");
    const ids = await recipients({ roles: settings.notify_roles_time as Role[], staffIds: [await homeManagerOf(homeId), ...(await handoverWriters(unread.map(handover => handover.id)))], except: user.id });
    await notify(ids, {
      kind: "time",
      title: `${user.name} took over at ${home.name} with a remark`,
      body: `${input.handoverRemark}${from ? ` (handover from ${from})` : ""}`,
      href: `/app/time?tab=handovers&home=${homeId}`,
      tone: "warn",
      dedupeKey: `handover:remark:${entryId}`,
    });
  }

  const serious = flags;
  if (serious.length) {
    await tellManagers(homeId, user.id, {
      kind: "time",
      title: `${user.name} clocked in ${flags.includes("unscheduled") ? "without a scheduled shift" : flags.includes("away_in") ? "away from the home" : flags.includes("no_location_in") ? "without a location" : `${late} minutes late`} at ${home.name}`,
      body: [serious.map(flag => ({ unscheduled: "No scheduled shift", away_in: "Away from the home", no_location_in: "Location could not be read", late: `${late} minutes late` })[flag] ?? flag).join(" · "), input.reason].filter(Boolean).join(". "),
      href: `/app/time/${entryId}`,
      tone: "warn",
      dedupeKey: `time:in:${entryId}`,
    });
  }
  return { entryId };
}

/* ---------- Breaks ---------- */

export async function startBreakFor(user: SessionUser, kind: "meal" | "rest"): Promise<{ error?: string }> {
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const open = await openEntry(user.staffId);
  if (!open) return { error: "You are not clocked in." };
  if (open.openBreak) return { error: "You are already on a break." };
  await db.insert(schema.timeBreaks).values({ entryId: open.entry.id, kind: kind === "rest" ? "rest" : "meal", startAt: new Date() });
  return {};
}

export async function endBreakFor(user: SessionUser): Promise<{ error?: string }> {
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const open = await openEntry(user.staffId);
  if (!open?.openBreak) return { error: "You are not on a break." };
  await db.update(schema.timeBreaks).set({ endAt: new Date() }).where(eq(schema.timeBreaks.id, open.openBreak.id));
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

/* Clocks a staff member out, with their handover. Shared by the website and the phone app. */
export async function clockOutFor(user: SessionUser, payload: unknown): Promise<Punch> {
  if (!user.staffId) return { error: "Your login is not linked to a staff record." };
  const parsed = clockOutInput.safeParse(payload);
  if (!parsed.success) return { error: "The clock-out could not be read. Reload and try again." };
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
  if (context.leftEarly > 0 && input.overstayReason.length < 5) return { error: `Your shift ends in ${formatMinutes(context.leftEarly)}. Say why you are leaving early.` };
  if (!member || !nameMatches(input.attestedName, member.first, member.last)) return { error: `Type your full name, ${member?.first ?? ""} ${member?.last ?? ""}, to sign.` };

  const needs = settings.clock_in_requirements;
  const verdict = locationVerdict({ latitude: open.homeLatitude, longitude: open.homeLongitude }, input.position, settings.clock_geofence_meters, needs.includes("location") && Boolean(open.entry.homeId));
  if (verdict.state === "outside" && input.reason.length < 5) return { error: `You are about ${verdict.distance} meters from the home. Say why, or move closer and try again.` };

  const flags = [...open.entry.flags];
  if (verdict.state === "outside") flags.push("away_out");
  if (verdict.state === "unavailable") flags.push("no_location_out");
  if (context.overstay > 0) flags.push("overstay");
  if (context.leftEarly > 0) flags.push("left_early");
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

  if (flags.some(flag => ["away_out", "no_location_out", "left_early"].includes(flag)) || input.incident === "not_reported") {
    await tellManagers(open.entry.homeId, user.id, {
      kind: "time",
      title: input.incident === "not_reported"
        ? `${user.name} clocked out with an incident not yet reported`
        : verdict.state === "outside"
          ? `${user.name} clocked out away from ${open.home ?? "the home"}`
          : context.leftEarly > 0
            ? `${user.name} left ${formatMinutes(context.leftEarly)} early from ${open.home ?? "the home"}`
            : `${user.name} clocked out without a location at ${open.home ?? "the home"}`,
      body: input.reason || undefined,
      href: `/app/time/${open.entry.id}`,
      tone: input.incident === "not_reported" ? "bad" : "warn",
      dedupeKey: `time:out:${open.entry.id}`,
    });
  }
  return { entryId: open.entry.id };
}
