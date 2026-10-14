import "server-only";
import { asc, eq } from "drizzle-orm";
import type { ShiftPattern } from "@/lib/schedule";
import { db, schema } from "@/server/db";

const order = [asc(schema.shiftPatterns.sortOrder), asc(schema.shiftPatterns.start), asc(schema.shiftPatterns.name)];

/* Shift patterns in use, in the order admins set. */
export async function activePatterns(): Promise<ShiftPattern[]> {
  return db
    .select({ id: schema.shiftPatterns.id, name: schema.shiftPatterns.name, start: schema.shiftPatterns.start, end: schema.shiftPatterns.end, weekdays: schema.shiftPatterns.weekdays })
    .from(schema.shiftPatterns)
    .where(eq(schema.shiftPatterns.active, true))
    .orderBy(...order);
}

/* Every pattern, including retired ones, for the settings screen. */
export function allPatterns() {
  return db.select().from(schema.shiftPatterns).orderBy(asc(schema.shiftPatterns.active), ...order);
}
