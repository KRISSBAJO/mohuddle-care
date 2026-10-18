import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, dateKey, weekStart } from "@/lib/format";
import { analyzeWeek } from "@/lib/schedule";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { noteFields } from "@/server/mobile/note-input";
import { scheduleData } from "@/server/queries/schedule";
import { changeShiftStatus, moveShift, saveShift, shiftInput } from "@/server/schedule-workflow";
import { getSettings } from "@/server/settings";
import { addTask, editTask } from "@/server/task-workflow";
export const dynamic = "force-dynamic";
export const GET = phoneRoute(async (user, request) => {
  if (!canManage(user)) return problem(403, "forbidden", "Only coordinators and administrators manage these operations.");
  const params = new URL(request.url).searchParams;
  if (params.get("mode") === "tasks") {
    const [tasks, staff, homes, people, settings] = await Promise.all([
      db.select().from(schema.tasks).orderBy(desc(schema.tasks.createdAt)).limit(150),
      db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.firstName)),
      db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name)),
      db.select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName }).from(schema.individuals).where(eq(schema.individuals.active, true)).orderBy(asc(schema.individuals.firstName)), getSettings(),
    ]);
    return reply({ tasks, staff: staff.map(person => ({ id: person.id, name: `${person.first} ${person.last}` })), homes, people: people.map(person => ({ id: person.id, name: `${person.first} ${person.last}` })), categories: settings.task_categories });
  }
  const parsed = z.iso.date().safeParse(params.get("week") ?? dateKey());
  if (!parsed.success) return problem(400, "invalid", "Choose a valid week.");
  const start = weekStart(parsed.data), data = await scheduleData(start);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const analysis = analyzeWeek(data.shifts, data.staff, data.homes, days, data.rules, data.today);
  return reply({ ...data, start, days, issues: analysis.issues });
});
export const POST = phoneRoute(async (user, request) => {
  if (!canManage(user)) return problem(403, "forbidden", "Only coordinators and administrators manage these operations.");
  const raw = await request.json().catch(() => null);
  const action = z.enum(["shift", "assign", "status", "task", "edit_task"]).safeParse(raw?.action);
  if (!action.success) return problem(400, "invalid", "Unknown operation.");
  let result: { error?: string; id?: string };
  if (action.data === "shift") {
    const parsed = shiftInput.safeParse(raw.input);
    if (!parsed.success) return problem(400, "invalid", parsed.error.issues[0]?.message ?? "Check the shift.");
    result = await saveShift(user, parsed.data);
  } else if (action.data === "assign") {
    const parsed = z.object({ shiftId: z.uuid(), staffId: z.uuid().nullable() }).safeParse(raw.input);
    if (!parsed.success) return problem(400, "invalid", "Choose a shift and staff member.");
    result = await moveShift(user, parsed.data);
  } else if (action.data === "status") {
    const parsed = z.object({ shiftId: z.uuid(), status: z.enum(["scheduled", "confirmed", "completed", "missed"]) }).safeParse(raw.input);
    if (!parsed.success) return problem(400, "invalid", "Choose the shift status.");
    result = await changeShiftStatus(user, parsed.data.shiftId, parsed.data.status);
  } else {
    const form = noteFields(raw);
    if (!form) return problem(400, "invalid", "The task could not be read.");
    if (action.data === "edit_task" && !z.uuid().safeParse(raw.id).success) return problem(400, "invalid", "Unknown task.");
    result = action.data === "task" ? await addTask(user, {}, form) : await editTask(user, raw.id, {}, form);
  }
  if (result.error) return problem(400, "refused", result.error);
  revalidatePath("/app", "layout"); return reply({ ok: true, id: result.id });
}, { writes: true });
