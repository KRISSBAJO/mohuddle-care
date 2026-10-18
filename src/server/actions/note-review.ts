"use server";
import { redirect } from "next/navigation";
import type { NoteKind } from "@/lib/note-review";
import { requireUser } from "@/server/guard";
import * as workflow from "@/server/note-workflow";
import type { FormState } from "./auth";
export type BulkState = workflow.BulkState;
export async function approveNote(kind: NoteKind, id: string): Promise<FormState> { return workflow.approveNote(await requireUser(), kind, id); }
export async function returnNote(kind: NoteKind, id: string, _previous: FormState, formData: FormData): Promise<FormState> { return workflow.returnNote(await requireUser(), kind, id, formData); }
export async function reopenNote(kind: NoteKind, id: string): Promise<FormState> { return workflow.reopenNote(await requireUser(), kind, id); }
export async function approveNotes(_previous: BulkState, formData: FormData): Promise<BulkState> { return workflow.approveNotes(await requireUser(), formData); }
export async function editDailyLog(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.editDailyLog(await requireUser(), id, formData);
  if (result.error) return result;
  redirect(`/app/daily-logs/${id}?edited=1`);
}
export async function editCommunityNote(id: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const result = await workflow.editCommunityNote(await requireUser(), id, formData);
  if (result.error) return result;
  redirect(`/app/community-notes/${id}?edited=1`);
}
