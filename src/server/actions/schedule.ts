"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/guard";
import * as workflow from "@/server/schedule-workflow";
import { z } from "zod";
import { shiftInput } from "@/server/schedule-workflow";
export type ScheduleResult = workflow.ScheduleResult;
export async function saveShift(input: z.input<typeof shiftInput>): Promise<ScheduleResult> {
  const result = await workflow.saveShift(await requireUser(), input);
  if (!result.error) revalidatePath("/app", "layout");
  return result;
}
export async function moveShift(input: { shiftId: string; day?: string; homeId?: string; staffId?: string | null }): Promise<ScheduleResult> {
  const result = await workflow.moveShift(await requireUser(), input);
  if (!result.error) revalidatePath("/app", "layout");
  return result;
}
export async function deleteShift(shiftId: string): Promise<ScheduleResult> {
  const result = await workflow.deleteShift(await requireUser(), shiftId);
  if (!result.error) revalidatePath("/app", "layout");
  return result;
}
export async function changeShiftStatus(shiftId: string, status: string): Promise<ScheduleResult> {
  const result = await workflow.changeShiftStatus(await requireUser(), shiftId, status);
  if (!result.error) revalidatePath("/app", "layout");
  return result;
}
export async function bulkCreateShifts(input: { homeIds: string[]; days: string[]; patternIds: string[]; staffId?: string | null }): Promise<ScheduleResult> {
  const result = await workflow.bulkCreateShifts(await requireUser(), input);
  if (!result.error) revalidatePath("/app", "layout");
  return result;
}
export async function copyWeek(fromWeek: string, toWeek: string): Promise<ScheduleResult> {
  const result = await workflow.copyWeek(await requireUser(), fromWeek, toWeek);
  if (!result.error) revalidatePath("/app", "layout");
  return result;
}
