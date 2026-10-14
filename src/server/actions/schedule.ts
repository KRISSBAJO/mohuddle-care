"use server";

import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, weekStart, zonedTime } from "@/lib/format";
import { kindFor, patternHours, requiredPatterns, shiftDay, windowFor, type SchedHome } from "@/lib/schedule";
import { assertShiftUpdate } from "@/lib/shift-policy";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { activePatterns } from "@/server/queries/patterns";

export type ScheduleResult = { error?: string; id?: string; created?: number; skipped?: number; unassigned?: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const FINAL = ["completed", "missed"] as const;
const uuid = z.uuid();
const day = z.iso.date();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

function done(): void {
  revalidatePath("/app/schedule");
  revalidatePath("/app");
}

/* The same person cannot be in two places. Checked inside the transaction that saves. */
async function clashFor(tx: Tx, staffId: string, startsAt: Date, endsAt: Date, exceptId?: string) {
  const [clash] = await tx
    .select({ id: schema.shifts.id, startsAt: schema.shifts.startsAt })
    .from(schema.shifts)
    .where(
      and(
        eq(schema.shifts.staffId, staffId),
        ne(schema.shifts.status, "missed"),
        lt(schema.shifts.startsAt, endsAt),
        gte(schema.shifts.endsAt, new Date(startsAt.getTime() + 1)),
        exceptId ? ne(schema.shifts.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return clash ?? null;
}

async function activeStaff(tx: Tx, staffId: string) {
  const [person] = await tx.select({ active: schema.staff.active, first: schema.staff.firstName }).from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  return person?.active ? person : null;
}

async function activeHome(tx: Tx, homeId: string) {
  const [home] = await tx.select({ active: schema.homes.active }).from(schema.homes).where(eq(schema.homes.id, homeId)).limit(1);
  return Boolean(home?.active);
}

const shiftInput = z.object({
  id: uuid.optional(),
  homeId: uuid,
  day,
  start: clock,
  end: clock,
  patternId: uuid.nullable().default(null),
  staffId: uuid.nullable(),
  note: z.string().trim().max(300).default(""),
});

/* Creates or edits one shift. Custom times are allowed; an end at or before the start means the next morning. */
export async function saveShift(input: z.input<typeof shiftInput>): Promise<ScheduleResult> {
  const user = await requireManager();
  const parsed = shiftInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the shift details." };
  const { id, homeId, staffId, note, patternId } = parsed.data;
  if (parsed.data.start === parsed.data.end) return { error: "A shift cannot start and end at the same time." };
  const window = windowFor(parsed.data.day, `${parsed.data.start}-${parsed.data.end}`);
  const startsAt = new Date(window.startsAt);
  const endsAt = new Date(window.endsAt);
  if (endsAt.getTime() - startsAt.getTime() > 16 * 3_600_000) return { error: "A shift can be at most 16 hours long." };
  try {
    const savedId = await db.transaction(async tx => {
      if (!(await activeHome(tx, homeId))) throw new Error("That home is closed.");
      if (staffId && !(await activeStaff(tx, staffId))) throw new Error("That person is no longer on staff.");
      let status: "open" | "scheduled" | "confirmed" = staffId ? "scheduled" : "open";
      if (id) {
        const [existing] = await tx.select().from(schema.shifts).where(eq(schema.shifts.id, id)).for("update");
        if (!existing) throw new Error("This shift was deleted. Refresh the schedule.");
        if ((FINAL as readonly string[]).includes(existing.status)) throw new Error("Completed or missed shifts are part of the record and cannot be changed.");
        // A confirmation belongs to a person and a time. Keep it only if neither changed.
        if (existing.status === "confirmed" && existing.staffId === staffId && existing.startsAt.getTime() === startsAt.getTime() && existing.endsAt.getTime() === endsAt.getTime()) status = "confirmed";
      }
      if (staffId) {
        const clash = await clashFor(tx, staffId, startsAt, endsAt, id);
        if (clash) throw new Error("That person is already working at that time.");
      }
      if (patternId) {
        const [pattern] = await tx.select({ id: schema.shiftPatterns.id }).from(schema.shiftPatterns).where(eq(schema.shiftPatterns.id, patternId)).limit(1);
        if (!pattern) throw new Error("That shift pattern was removed. Choose another or use custom times.");
      }
      const values = { homeId, staffId, kind: kindFor(parsed.data.start), patternId, startsAt, endsAt, note, status };
      if (id) {
        await tx.update(schema.shifts).set(values).where(eq(schema.shifts.id, id));
        await tx.insert(schema.auditLog).values({ userId: user.id, action: "shift:update", entity: "shift", entityId: id });
        return id;
      }
      const [row] = await tx.insert(schema.shifts).values(values).returning({ id: schema.shifts.id });
      await tx.insert(schema.auditLog).values({ userId: user.id, action: "shift:create", entity: "shift", entityId: row.id });
      return row.id;
    });
    done();
    return { id: savedId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the shift." };
  }
}

/*
 * Drag and drop. Moves a shift to another day or home, and/or gives it to someone else, keeping its
 * clock times. Anything left out stays as it was; staffId null makes it open.
 */
export async function moveShift(input: { shiftId: string; day?: string; homeId?: string; staffId?: string | null }): Promise<ScheduleResult> {
  const user = await requireManager();
  const parsed = z
    .object({ shiftId: uuid, day: day.optional(), homeId: uuid.optional(), staffId: uuid.nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return { error: "That move is not valid." };
  const { shiftId } = parsed.data;
  try {
    await db.transaction(async tx => {
      const [shift] = await tx.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).for("update");
      if (!shift) throw new Error("This shift was deleted. Refresh the schedule.");
      if ((FINAL as readonly string[]).includes(shift.status)) throw new Error("Completed or missed shifts cannot be moved.");
      let { startsAt, endsAt } = shift;
      if (parsed.data.day) {
        const from = shiftDay({ startsAt: shift.startsAt.toISOString() });
        const shiftBy = (date: Date) => {
          const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
          return `${parts.find(p => p.type === "hour")?.value}:${parts.find(p => p.type === "minute")?.value}`;
        };
        const offset = Math.round((Date.parse(`${parsed.data.day}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
        // Re-anchor in Central time so a move across a daylight-saving change keeps the clock times.
        const endDay = shiftDay({ startsAt: shift.endsAt.toISOString() });
        startsAt = zonedTime(parsed.data.day, shiftBy(shift.startsAt));
        endsAt = zonedTime(addDays(endDay, offset), shiftBy(shift.endsAt));
      }
      const homeId = parsed.data.homeId ?? shift.homeId;
      if (homeId !== shift.homeId && !(await activeHome(tx, homeId))) throw new Error("That home is closed.");
      const staffId = parsed.data.staffId === undefined ? shift.staffId : parsed.data.staffId;
      if (staffId && staffId !== shift.staffId && !(await activeStaff(tx, staffId))) throw new Error("That person is no longer on staff.");
      if (staffId) {
        const clash = await clashFor(tx, staffId, startsAt, endsAt, shift.id);
        if (clash) throw new Error("That person is already working at that time.");
      }
      const unchangedPerson = staffId === shift.staffId && startsAt.getTime() === shift.startsAt.getTime();
      const status = !staffId ? "open" : unchangedPerson && shift.status === "confirmed" ? "confirmed" : "scheduled";
      await tx.update(schema.shifts).set({ startsAt, endsAt, homeId, staffId, status }).where(eq(schema.shifts.id, shift.id));
      await tx.insert(schema.auditLog).values({ userId: user.id, action: "shift:move", entity: "shift", entityId: shift.id });
    });
    done();
    return { id: shiftId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not move the shift." };
  }
}

export async function deleteShift(shiftId: string): Promise<ScheduleResult> {
  const user = await requireManager();
  if (!uuid.safeParse(shiftId).success) return { error: "Unknown shift." };
  const [shift] = await db.select({ status: schema.shifts.status }).from(schema.shifts).where(eq(schema.shifts.id, shiftId)).limit(1);
  if (!shift) return { error: "This shift was already deleted." };
  if ((FINAL as readonly string[]).includes(shift.status)) return { error: "Completed or missed shifts are part of the record and cannot be deleted." };
  await db.delete(schema.shifts).where(eq(schema.shifts.id, shiftId));
  await db.insert(schema.auditLog).values({ userId: user.id, action: "shift:delete", entity: "shift", entityId: shiftId });
  done();
  return {};
}

/* Confirm, complete or mark missed. Staff may confirm their own shifts; coordinators may do all three. */
export async function changeShiftStatus(shiftId: string, status: string): Promise<ScheduleResult> {
  const user = await requireUser();
  if (!uuid.safeParse(shiftId).success) return { error: "Unknown shift." };
  try {
    await db.transaction(async tx => {
      const [shift] = await tx.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).for("update");
      assertShiftUpdate(user, shift, status);
      await tx.update(schema.shifts).set({ status }).where(eq(schema.shifts.id, shiftId));
      await tx.insert(schema.auditLog).values({ userId: user.id, action: `shift:${status}`, entity: "shift", entityId: shiftId });
    });
    done();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the shift." };
  }
}

/*
 * Adds the standard shifts for chosen homes, days and shift types in one go. A shift that already
 * exists for the same home, type and start time is skipped, so running it twice is harmless.
 */
export async function bulkCreateShifts(input: { homeIds: string[]; days: string[]; patternIds: string[]; staffId?: string | null }): Promise<ScheduleResult> {
  const user = await requireManager();
  const parsed = z
    .object({
      homeIds: z.array(uuid).min(1, "Choose at least one home.").max(50),
      days: z.array(day).min(1, "Choose at least one day.").max(31),
      patternIds: z.array(uuid).min(1, "Choose at least one shift pattern.").max(50),
      staffId: uuid.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your choices." };
  const patterns = (await activePatterns()).filter(pattern => parsed.data.patternIds.includes(pattern.id));
  const homes = await db.select().from(schema.homes).where(and(inArray(schema.homes.id, parsed.data.homeIds), eq(schema.homes.active, true)));
  const wanted = homes.flatMap(home =>
    parsed.data.days.flatMap(d =>
      requiredPatterns(home as SchedHome, d, patterns).map(pattern => ({ homeId: home.id, patternId: pattern.id, kind: kindFor(pattern.start), ...windowFor(d, patternHours(pattern)) })),
    ),
  );
  if (!wanted.length) return { error: "None of the chosen homes need those shift patterns on those days. Check the days each pattern runs, and what each home needs on its Details tab." };
  const staffId = parsed.data.staffId ?? null;
  let created = 0;
  let skipped = 0;
  let unassigned = 0;
  await db.transaction(async tx => {
    if (staffId && !(await activeStaff(tx, staffId))) throw new Error("That person is no longer on staff.");
    for (const shift of wanted) {
      const startsAt = new Date(shift.startsAt);
      const endsAt = new Date(shift.endsAt);
      const [exists] = await tx
        .select({ id: schema.shifts.id })
        .from(schema.shifts)
        .where(and(eq(schema.shifts.homeId, shift.homeId), eq(schema.shifts.startsAt, startsAt), eq(schema.shifts.endsAt, endsAt)))
        .limit(1);
      if (exists) {
        skipped++;
        continue;
      }
      // Give it to the chosen person only where they are free; otherwise it is added open.
      const assign = staffId && !(await clashFor(tx, staffId, startsAt, endsAt)) ? staffId : null;
      if (staffId && !assign) unassigned++;
      await tx.insert(schema.shifts).values({ homeId: shift.homeId, kind: shift.kind, patternId: shift.patternId, startsAt, endsAt, staffId: assign, status: assign ? "scheduled" : "open" });
      created++;
    }
    await tx.insert(schema.auditLog).values({ userId: user.id, action: `shift:bulk:${created}`, entity: "shift" });
  });
  done();
  return { created, skipped, unassigned };
}

/*
 * Copies one week's shifts into the next, same homes, types and times, as a starting point.
 * People stay on their shifts where they are still on staff and free; the rest are left open.
 */
export async function copyWeek(fromWeek: string, toWeek: string): Promise<ScheduleResult> {
  const user = await requireManager();
  if (!day.safeParse(fromWeek).success || !day.safeParse(toWeek).success) return { error: "Choose a week." };
  const from = weekStart(fromWeek);
  const to = weekStart(toWeek);
  if (from === to) return { error: "Choose a different week to copy from." };
  const offsetDays = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
  const source = await db
    .select()
    .from(schema.shifts)
    .innerJoin(schema.homes, eq(schema.homes.id, schema.shifts.homeId))
    .where(and(gte(schema.shifts.startsAt, zonedTime(from, "00:00")), lt(schema.shifts.startsAt, zonedTime(addDays(from, 7), "00:00")), eq(schema.homes.active, true)));
  if (!source.length) return { error: "There are no shifts in that week to copy." };
  const staffRows = await db.select({ id: schema.staff.id, active: schema.staff.active }).from(schema.staff);
  const stillHere = new Set(staffRows.filter(row => row.active).map(row => row.id));
  const clockOf = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    return `${parts.find(p => p.type === "hour")?.value}:${parts.find(p => p.type === "minute")?.value}`;
  };
  let created = 0;
  let skipped = 0;
  let unassigned = 0;
  await db.transaction(async tx => {
    for (const { shifts: shift } of source) {
      const startDay = addDays(shiftDay({ startsAt: shift.startsAt.toISOString() }), offsetDays);
      const endDay = addDays(shiftDay({ startsAt: shift.endsAt.toISOString() }), offsetDays);
      const startsAt = zonedTime(startDay, clockOf(shift.startsAt));
      const endsAt = zonedTime(endDay, clockOf(shift.endsAt));
      const [exists] = await tx
        .select({ id: schema.shifts.id })
        .from(schema.shifts)
        .where(and(eq(schema.shifts.homeId, shift.homeId), eq(schema.shifts.startsAt, startsAt), eq(schema.shifts.endsAt, endsAt)))
        .limit(1);
      if (exists) {
        skipped++;
        continue;
      }
      const keep = shift.staffId && stillHere.has(shift.staffId) && !(await clashFor(tx, shift.staffId, startsAt, endsAt)) ? shift.staffId : null;
      if (shift.staffId && !keep) unassigned++;
      await tx.insert(schema.shifts).values({ homeId: shift.homeId, kind: shift.kind, patternId: shift.patternId, startsAt, endsAt, staffId: keep, status: keep ? "scheduled" : "open", note: shift.note });
      created++;
    }
    await tx.insert(schema.auditLog).values({ userId: user.id, action: `shift:copy:${from}:${to}:${created}`, entity: "shift" });
  });
  done();
  return { created, skipped, unassigned };
}
