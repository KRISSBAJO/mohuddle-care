import { z } from "zod";
import { requestTime } from "@/server/clock";
import { noteSource, saveDailyNote } from "@/server/daily-notes";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { notesToWrite } from "@/server/mobile/notes";

export const dynamic = "force-dynamic";

/* The staff member's recent shifts, and who still needs a note on each. */
export const GET = phoneRoute(async user => reply(await notesToWrite(user, await requestTime())));

// The website's field names, each a value or a list of values (for ticks and multi-choice).
const body = z.object({ fields: z.record(z.string().max(200), z.union([z.string().max(6000), z.array(z.string().max(500)).max(60)])) });

/* Signs and saves a shift note, with the same checks as the website. */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success || Object.keys(parsed.data.fields).length > 400) return problem(400, "invalid", "The note could not be read. Try again.");
    const result = await saveDailyNote(user, noteSource(parsed.data.fields));
    return result.error !== undefined ? problem(400, "refused", result.error) : reply({ id: result.id });
  },
  { writes: true },
);
