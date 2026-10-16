"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveDailyNote } from "@/server/daily-notes";
import { requireUser } from "@/server/guard";
import type { FormState } from "./auth";

/* Saves a signed shift note from the website's form. The rules are in src/server/daily-notes.ts. */
export async function createDailyLog(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await saveDailyNote(user, formData);
  if (result.error !== undefined) return { error: result.error };
  revalidatePath("/app");
  revalidatePath("/app/daily-logs");
  revalidatePath(`/app/individuals/${result.individualId}`);
  revalidatePath("/app/schedule");
  redirect(`/app/daily-logs/${result.id}?saved=1`);
}
