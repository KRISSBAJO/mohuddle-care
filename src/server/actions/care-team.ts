"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import * as workflow from "@/server/care-team-workflow";
import type { FormState } from "./auth";
export async function saveContact(individualId: string, contactId: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.saveContact(await requireUser(), individualId, contactId, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function removeContact(individualId: string, contactId: string): Promise<FormState> {
  const result = await workflow.removeContact(await requireUser(), individualId, contactId);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function saveInsurance(individualId: string, insuranceId: string | null, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.saveInsurance(await requireUser(), individualId, insuranceId, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function setInsuranceActive(individualId: string, insuranceId: string, active: boolean): Promise<FormState> {
  const result = await workflow.setInsuranceActive(await requireUser(), individualId, insuranceId, active);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
