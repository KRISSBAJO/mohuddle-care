"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import * as workflow from "@/server/weight-workflow";
import type { FormState } from "./auth";
export async function addWeightRecord(individualId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.addWeightRecord(await requireUser(), individualId, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function setWeightPlan(individualId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.setWeightPlan(await requireUser(), individualId, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function removeWeightRecord(id: string): Promise<FormState> {
  const result = await workflow.removeWeightRecord(await requireUser(), id);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
