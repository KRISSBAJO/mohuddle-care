import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
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
