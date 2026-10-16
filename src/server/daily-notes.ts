import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { dateKey, zonedTime } from "@/lib/format";
import { dosesByHour, parseLogNote, shiftMinutes, withDoses } from "@/lib/log-note";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { homeManagerOf, notify, recipients, type Role } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { shiftDoses } from "@/server/queries/logs";
import { configForPerson } from "@/server/queries/note-requirements";

/*
 * The fields of a shift note, from the website's form or the phone app. Anything with get, getAll
 * and set, such as FormData; the phone app's JSON is wrapped to look the same (noteSource).
 */
export type NoteSource = { get(name: string): unknown; getAll(name: string): unknown[]; has(name: string): boolean; set(name: string, value: string): void };

/* The phone app sends { field: value or [values] }; this gives it FormData's shape. */
export function noteSource(fields: Record<string, string | string[]>): NoteSource {
  const map = new Map<string, string[]>(Object.entries(fields).map(([key, value]) => [key, (Array.isArray(value) ? value : [value]).map(String)]));
  return {
    get: name => map.get(name)?.[0] ?? null,
    getAll: name => map.get(name) ?? [],
    has: name => map.has(name),
    set: (name, value) => void map.set(name, [value]),
  };
}

/*
 * Saves a signed shift note with its plan goal data. Each staff member writes one note per person
 * per shift they worked. A scheduled shift must be the writer's own; its date and type come from it.
 */
export async function saveDailyNote(user: SessionUser, formData: NoteSource): Promise<{ id: string; individualId: string; error?: undefined } | { error: string; id?: undefined; individualId?: undefined }> {
  const individualId = String(formData.get("individualId") ?? "");
  if (!z.uuid().safeParse(individualId).success) return { error: "Choose the person this log is about." };
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person) return { error: "That person is no longer on record." };
  if (!person.active) return { error: `Support for ${person.firstName} has ended. Logs can no longer be added.` };

  // The shift the note is for. Staff can only write against their own shifts.
  const shiftRaw = String(formData.get("shiftId") ?? "");
  let shift: { id: string; kind: "day" | "evening" | "overnight"; day: string; name: string } | null = null;
  if (shiftRaw) {
    if (!z.uuid().safeParse(shiftRaw).success) return { error: "Choose your shift again." };
    const [row] = await db
      .select({ id: schema.shifts.id, staffId: schema.shifts.staffId, status: schema.shifts.status, kind: schema.shifts.kind, startsAt: schema.shifts.startsAt, pattern: schema.shiftPatterns.name })
      .from(schema.shifts)
      .leftJoin(schema.shiftPatterns, eq(schema.shiftPatterns.id, schema.shifts.patternId))
      .where(eq(schema.shifts.id, shiftRaw))
      .limit(1);
    if (!row) return { error: "That shift was removed from the schedule. Choose another, or Not on the schedule." };
    if (!user.staffId || row.staffId !== user.staffId) return { error: "You can only write notes for your own shifts." };
    if (row.status === "missed") return { error: "That shift is marked missed, so it cannot have notes." };
    if (row.startsAt.getTime() > Date.now() + 2 * 3_600_000) return { error: "That shift has not started yet." };
    shift = { id: row.id, kind: row.kind, day: dateKey(row.startsAt), name: row.pattern ?? "Custom shift" };
    formData.set("logDate", shift.day);
    formData.set("shift", shift.kind);
  }

  const [settings, config, goals] = await Promise.all([
    getSettings(),
    configForPerson({ id: individualId, homeId: person.homeId }),
    db.select({ id: schema.planGoals.id }).from(schema.planGoals).where(and(eq(schema.planGoals.individualId, individualId), eq(schema.planGoals.status, "active"))),
  ]);
  const parsed = parseLogNote(formData, {
    today: dateKey(),
    requiredChecks: settings.required_daily_checks,
    summaryMin: settings.daily_log_summary_min_chars,
    locations: settings.log_locations,
    adlItems: settings.adl_items,
    promptLevels: settings.prompt_levels,
    activityTypes: settings.activity_types,
    sections: config.sections,
    items: config.items,
    // Only goals still active now. A goal closed while the form was open is skipped, not an error.
    goalIds: goals.map(goal => goal.id).filter(id => formData.has(`goal.${id}.offered`)),
  });
  if ("error" in parsed) return parsed;
  const { goals: goalData, ...note } = parsed.note;
  // The timeline records the doses due in each hour from the MAR, as they stand at signing, not as the form sent them.
  if (note.sections.includes("timeline")) {
    const from = zonedTime(note.logDate, note.timeIn);
    const doses = await shiftDoses([individualId], from, new Date(from.getTime() + (shiftMinutes(note.timeIn, note.timeOut) ?? 0) * 60_000));
    note.timeline = withDoses(note.timeline, dosesByHour(doses, note.logDate, note.timeIn, note.timeOut), note.timeIn, note.timeOut);
  }

  const shiftName = shift ? shift.name : String(formData.get("shiftName") ?? "").trim().slice(0, 60) || "Unscheduled";
  const [existing] = await db
    .select({ id: schema.dailyLogs.id })
    .from(schema.dailyLogs)
    .where(
      shift
        ? and(eq(schema.dailyLogs.individualId, individualId), eq(schema.dailyLogs.shiftId, shift.id), user.staffId ? eq(schema.dailyLogs.staffId, user.staffId) : undefined)
        : and(
            eq(schema.dailyLogs.individualId, individualId),
            eq(schema.dailyLogs.logDate, note.logDate),
            eq(schema.dailyLogs.shift, note.shift),
            isNull(schema.dailyLogs.shiftId),
            user.staffId ? eq(schema.dailyLogs.staffId, user.staffId) : undefined,
          ),
    )
    .limit(1);
  if (existing) return { error: `You already wrote a note for ${person.firstName} on this shift. Open it from their Daily logs tab.` };

  const id = await db.transaction(async tx => {
    const [row] = await tx
      .insert(schema.dailyLogs)
      .values({ ...note, individualId, staffId: user.staffId, shiftId: shift?.id ?? null, shiftName, signedName: user.name, signedAt: new Date() })
      .returning({ id: schema.dailyLogs.id });
    if (goalData.length) await tx.insert(schema.dailyLogGoals).values(goalData.map(goal => ({ ...goal, logId: row.id })));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "daily_log", entityId: row.id });
    return row.id;
  });

  // Follow-ups that left a document still to do, such as an incident report, go to the people who oversee notes.
  const outstanding = note.extra.filter(answer => answer.followUp?.docs.some(doc => !doc.done));
  if (outstanding.length) {
    const ids = await recipients({ roles: settings.notify_roles_notes as Role[], staffIds: [await homeManagerOf(person.homeId)], except: user.id });
    await notify(ids, {
      kind: "notes:follow-up",
      title: `${user.name}: ${person.firstName}'s note has documents still to do`,
      body: outstanding.map(answer => `${answer.label}: ${answer.followUp!.docs.filter(doc => !doc.done).map(doc => doc.label).join(", ")}`).join(". "),
      href: `/app/daily-logs/${id}`,
      tone: "warn",
      dedupeKey: `notes:follow-up:${id}`,
    });
  }

  return { id, individualId };
}
