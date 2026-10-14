"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dateKey, label } from "@/lib/format";
import { parseLogNote } from "@/lib/log-note";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

/* Saves a signed shift note with its plan goal data. One note per person per shift per day. */
export async function createDailyLog(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const individualId = String(formData.get("individualId") ?? "");
  if (!z.uuid().safeParse(individualId).success) return { error: "Choose the person this log is about." };
  const [person] = await db.select().from(schema.individuals).where(eq(schema.individuals.id, individualId)).limit(1);
  if (!person) return { error: "That person is no longer in the Hub." };
  if (!person.active) return { error: `Support for ${person.firstName} has ended. Logs can no longer be added.` };

  const [settings, goals] = await Promise.all([
    getSettings(),
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
    // Only goals still active now. A goal closed while the form was open is skipped, not an error.
    goalIds: goals.map(goal => goal.id).filter(id => formData.has(`goal.${id}.offered`)),
  });
  if ("error" in parsed) return parsed;
  const { goals: goalData, ...note } = parsed.note;

  const [existing] = await db
    .select({ id: schema.dailyLogs.id })
    .from(schema.dailyLogs)
    .where(and(eq(schema.dailyLogs.individualId, individualId), eq(schema.dailyLogs.logDate, note.logDate), eq(schema.dailyLogs.shift, note.shift)))
    .limit(1);
  if (existing) return { error: `There is already a ${label("shiftKind", note.shift).toLowerCase()} shift log for ${person.firstName} on that date. Open it from their Daily logs tab.` };

  const id = await db.transaction(async tx => {
    const [row] = await tx
      .insert(schema.dailyLogs)
      .values({ ...note, individualId, staffId: user.staffId, signedName: user.name, signedAt: new Date() })
      .returning({ id: schema.dailyLogs.id });
    if (goalData.length) await tx.insert(schema.dailyLogGoals).values(goalData.map(goal => ({ ...goal, logId: row.id })));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "create", entity: "daily_log", entityId: row.id });
    return row.id;
  });

  revalidatePath("/app");
  revalidatePath("/app/daily-logs");
  revalidatePath(`/app/individuals/${individualId}`);
  redirect(`/app/daily-logs/${id}?saved=1`);
}
