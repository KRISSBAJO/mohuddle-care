import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { dateKey, zonedTime } from "@/lib/format";
import type { ShiftDose } from "@/lib/log-note";
import { clockOf } from "@/lib/schedule";
import { db, schema } from "@/server/db";

export type LogRow = typeof schema.dailyLogs.$inferSelect;
export type LogGoal = typeof schema.dailyLogGoals.$inferSelect & { title: string };

/* Goal data for a set of logs, grouped by log, with each goal's title. */
export async function goalsForLogs(logIds: string[]) {
  const byLog = new Map<string, LogGoal[]>();
  if (!logIds.length) return byLog;
  const rows = await db
    .select({ entry: schema.dailyLogGoals, title: schema.planGoals.title })
    .from(schema.dailyLogGoals)
    .innerJoin(schema.planGoals, eq(schema.planGoals.id, schema.dailyLogGoals.goalId))
    .where(inArray(schema.dailyLogGoals.logId, logIds))
    .orderBy(asc(schema.planGoals.createdAt));
  for (const row of rows) byLog.set(row.entry.logId, [...(byLog.get(row.entry.logId) ?? []), { ...row.entry, title: row.title }]);
  return byLog;
}

/* One log with the person, their home and the staff member who wrote it. */
export async function logRecord(id: string) {
  const [row] = await db
    .select({
      log: schema.dailyLogs,
      first: schema.individuals.firstName,
      last: schema.individuals.lastName,
      allergies: schema.individuals.allergies,
      home: schema.homes.name,
      homeId: schema.homes.id,
      staff: sql<string | null>`${schema.staff.firstName} || ' ' || ${schema.staff.lastName}`,
    })
    .from(schema.dailyLogs)
    .innerJoin(schema.individuals, eq(schema.individuals.id, schema.dailyLogs.individualId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.dailyLogs.staffId))
    .where(eq(schema.dailyLogs.id, id))
    .limit(1);
  if (!row) return null;
  const goals = (await goalsForLogs([id])).get(id) ?? [];
  return { ...row, goals };
}

const doseWords = { due: "Not recorded yet", given: "Given", refused: "Refused", missed: "Missed", held: "Held" } as const;

/*
 * The doses due between two instants for these people, for the hourly timeline: what the MAR says,
 * plus scheduled times the MAR has no record for yet. Each is worded with its status.
 */
export async function shiftDoses(individualIds: string[], from: Date, to: Date): Promise<(ShiftDose & { individualId: string })[]> {
  if (!individualIds.length) return [];
  const [records, meds] = await Promise.all([
    db
      .select({ medicationId: schema.medAdministrations.medicationId, individualId: schema.medAdministrations.individualId, at: schema.medAdministrations.scheduledFor, status: schema.medAdministrations.status, name: schema.medications.name, dose: schema.medications.dose })
      .from(schema.medAdministrations)
      .innerJoin(schema.medications, eq(schema.medications.id, schema.medAdministrations.medicationId))
      .where(and(inArray(schema.medAdministrations.individualId, individualIds), gte(schema.medAdministrations.scheduledFor, from), lt(schema.medAdministrations.scheduledFor, to))),
    db
      .select({ id: schema.medications.id, individualId: schema.medications.individualId, name: schema.medications.name, dose: schema.medications.dose, times: schema.medications.times, startedAt: schema.medications.startedAt })
      .from(schema.medications)
      .where(and(inArray(schema.medications.individualId, individualIds), eq(schema.medications.active, true))),
  ]);
  const recorded = new Set(records.map(row => `${row.medicationId}|${row.at.getTime()}`));
  const days = [...new Set([dateKey(from), dateKey(to)])];
  const scheduled = meds.flatMap(med =>
    days.flatMap(day =>
      med.times
        .map(time => ({ medicationId: med.id, individualId: med.individualId, at: zonedTime(day, time), status: "due" as const, name: med.name, dose: med.dose }))
        .filter(row => row.at >= from && row.at < to && (!med.startedAt || row.at >= med.startedAt) && !recorded.has(`${row.medicationId}|${row.at.getTime()}`)),
    ),
  );
  return [...records, ...scheduled].map(row => ({
    individualId: row.individualId,
    day: dateKey(row.at),
    clock: clockOf(row.at.toISOString()),
    label: `${row.name} ${row.dose} · ${doseWords[row.status]}`,
  }));
}
