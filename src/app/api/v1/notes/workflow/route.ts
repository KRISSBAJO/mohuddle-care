import { requestTime } from "@/server/clock";
import { saveCommunityNote } from "@/server/community-notes";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { mobileNoteInbox } from "@/server/mobile/note-workflow";
import { noteFields } from "@/server/mobile/note-input";
export const dynamic = "force-dynamic";
export const GET = phoneRoute(async user => reply(await mobileNoteInbox(user, await requestTime())));
export const POST = phoneRoute(async (user, request) => {
  const form = noteFields(await request.json().catch(() => null));
  if (!form) return problem(400, "invalid", "The note could not be read.");
  const result = await saveCommunityNote(user, form);
  return result.error !== undefined ? problem(400, "refused", result.error) : reply({ id: result.id });
}, { writes: true });
