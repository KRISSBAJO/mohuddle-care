import { z } from "zod";
import { requestTime } from "@/server/clock";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { noteFields } from "@/server/mobile/note-input";
import { mobileNoteRecord } from "@/server/mobile/note-workflow";
import { approveNote, editCommunityNote, editDailyLog, reopenNote, returnNote } from "@/server/note-workflow";
export const dynamic = "force-dynamic";
const ref = z.object({ kind: z.enum(["daily", "community"]), id: z.uuid() });
export const GET = phoneRoute(async (user, request) => {
  const parsed = ref.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return problem(404, "not_found", "Unknown note.");
  const result = await mobileNoteRecord(user, parsed.data.kind, parsed.data.id, await requestTime());
  return result ? reply(result) : problem(404, "not_found", "This note is no longer on record.");
});
export const POST = phoneRoute(async (user, request) => {
  const raw = await request.json().catch(() => null);
  const parsed = ref.extend({ action: z.enum(["edit", "approve", "return", "reopen"]), version: z.string().min(1).max(200) }).safeParse(raw);
  const form = noteFields(raw);
  if (!parsed.success || !form) return problem(400, "invalid", "Reopen the note before saving.");
  const { kind, id, action, version } = parsed.data;
  form.set("version", version);
  const result = action === "approve" ? await approveNote(user, kind, id, version)
    : action === "return" ? await returnNote(user, kind, id, form)
    : action === "reopen" ? await reopenNote(user, kind, id, version)
    : kind === "daily" ? await editDailyLog(user, id, form) : await editCommunityNote(user, id, form);
  return result.error ? problem(409, "refused", result.error) : reply({ ok: true });
}, { writes: true });
