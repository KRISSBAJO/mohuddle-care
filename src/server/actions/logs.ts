"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dateKey } from "@/lib/format";
import { parseLogNote } from "@/lib/log-note";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";
import { configForPerson } from "@/server/queries/note-requirements";
import type { FormState } from "./auth";

/*
 * Saves a signed shift note with its plan goal data. Each staff member writes one note per person
 * per shift they worked. A scheduled shift must be the writer's own; its date and type come from it.
 */
export async function createDailyLog(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const individualId = String(formData.get("individualId") ?? "");
  if (!z.uuid().safeParse(individualId).success) return { error: "Choose the person this log is about." };
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person) return { error: "That person is no longer in the Hub." };
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

  revalidatePath("/app");
  revalidatePath("/app/daily-logs");
  revalidatePath(`/app/individuals/${individualId}`);
  revalidatePath("/app/schedule");
  redirect(`/app/daily-logs/${id}?saved=1`);
}
