"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import * as workflow from "@/server/appointment-workflow";
import type { FormState } from "./auth";
export async function bookAppointment(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.bookAppointment(await requireUser(), _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function updateAppointment(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.updateAppointment(await requireUser(), id, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function closeAppointment(id: string, status: "cancelled" | "missed", _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.closeAppointment(await requireUser(), id, status, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function documentAppointment(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.documentAppointment(await requireUser(), id, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
