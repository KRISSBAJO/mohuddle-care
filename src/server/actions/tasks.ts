"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import * as workflow from "@/server/task-workflow";
import type { FormState } from "./auth";
export async function addTask(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.addTask(await requireUser(), _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function editTask(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.editTask(await requireUser(), id, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function finishTask(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.finishTask(await requireUser(), id, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function reopenTask(id: string): Promise<FormState> {
  const result = await workflow.reopenTask(await requireUser(), id);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function removeTask(id: string): Promise<FormState> {
  const result = await workflow.removeTask(await requireUser(), id);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
export async function commentOnTask(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.commentOnTask(await requireUser(), id, _previous, formData);
  if (!result.error) revalidatePath("/app", "layout");
  if (result.redirect) redirect(result.redirect);
  return result;
}
