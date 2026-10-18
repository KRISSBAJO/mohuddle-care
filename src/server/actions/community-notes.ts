"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import { saveCommunityNote } from "@/server/community-notes";
import type { FormState } from "./auth";
export async function createCommunityNote(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await saveCommunityNote(await requireUser(), formData);
  if (result.error !== undefined) return { error: result.error };
  revalidatePath(`/app/individuals/${String(formData.get("individualId") ?? "")}`);
  redirect(`/app/community-notes/${result.id}?saved=1`);
}
