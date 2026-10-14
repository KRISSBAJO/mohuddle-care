"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireManager } from "@/server/guard";
import type { FormState } from "./auth";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:00.");
const patternInput = z.object({
  name: z.string().trim().min(2, "Give the pattern a name, for example Weekend day.").max(60),
  start: clock,
  end: clock,
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one day it runs."),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

function refresh() {
  revalidatePath("/app/settings/shifts");
  revalidatePath("/app/schedule");
  revalidatePath("/app/homes", "layout");
  revalidatePath("/app/daily-logs/new");
}

/* Adds or changes a shift pattern. Existing shifts keep their own times; only new shifts use the change. */
export async function savePattern(id: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireManager();
  if (id && !z.uuid().safeParse(id).success) return { error: "Unknown shift pattern." };
  const parsed = patternInput.safeParse({
    name: formData.get("name"),
    start: formData.get("start"),
    end: formData.get("end"),
    weekdays: [...new Set(formData.getAll("weekdays").map(Number))].sort(),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the pattern." };
  const { name, start, end } = parsed.data;
  if (start === end) return { error: "The start and end cannot be the same time." };
  const length = (minutes(end) - minutes(start) + 1440) % 1440;
  if (length > 16 * 60) return { error: "A shift can be at most 16 hours long." };
  const [clash] = await db
    .select({ id: schema.shiftPatterns.id })
    .from(schema.shiftPatterns)
    .where(and(sql`lower(${schema.shiftPatterns.name}) = lower(${name})`, id ? ne(schema.shiftPatterns.id, id) : undefined))
    .limit(1);
  if (clash) return { error: "Another shift pattern already has that name." };
  if (id) {
    const updated = await db.update(schema.shiftPatterns).set(parsed.data).where(eq(schema.shiftPatterns.id, id)).returning({ id: schema.shiftPatterns.id });
    if (!updated.length) return { error: "This shift pattern no longer exists." };
  } else {
    await db.insert(schema.shiftPatterns).values(parsed.data);
  }
  await db.insert(schema.auditLog).values({ userId: user.id, action: id ? "pattern:update" : "pattern:create", entity: "shift_pattern", entityId: id ?? "" });
  refresh();
  return {};
}

/* Retiring a pattern hides it from new shifts and coverage checks. Shifts already made keep it as their label. */
export async function setPatternActive(id: string, active: boolean): Promise<FormState> {
  const user = await requireManager();
  if (!z.uuid().safeParse(id).success) return { error: "Unknown shift pattern." };
  if (!active) {
    const [{ remaining }] = await db.select({ remaining: sql<number>`count(*)::int` }).from(schema.shiftPatterns).where(and(eq(schema.shiftPatterns.active, true), ne(schema.shiftPatterns.id, id)));
    if (remaining === 0) return { error: "Keep at least one shift pattern in use." };
  }
  await db.update(schema.shiftPatterns).set({ active }).where(eq(schema.shiftPatterns.id, id));
  await db.insert(schema.auditLog).values({ userId: user.id, action: active ? "pattern:restore" : "pattern:retire", entity: "shift_pattern", entityId: id });
  refresh();
  return {};
}
