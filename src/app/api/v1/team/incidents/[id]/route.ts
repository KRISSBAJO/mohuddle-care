import { z } from "zod";
import { canManage } from "@/server/auth";
import { addIncidentNoteFor, startIncidentReviewFor } from "@/server/incident-follow-up";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { incidentForPhone } from "@/server/mobile/team";

export const dynamic = "force-dynamic";

const idFrom = (request: Request) => new URL(request.url).pathname.split("/").at(-1) ?? "";

/* One incident for a manager: what happened, the deadline, the timeline and the photos. */
export const GET = phoneRoute(async (user, request) => {
  if (!canManage(user)) return problem(403, "not_manager", "This is for coordinators and administrators.");
  const incident = await incidentForPhone(idFrom(request));
  return incident ? reply(incident) : problem(404, "not_found", "That incident is not on record.");
});

const body = z.discriminatedUnion("action", [z.object({ action: z.literal("review") }), z.object({ action: z.literal("note"), body: z.string().max(3000) })]);

/* Starts the review, or adds a follow-up note to the timeline. */
export const POST = phoneRoute(
  async (user, request) => {
    if (!canManage(user)) return problem(403, "not_manager", "This is for coordinators and administrators.");
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", "Write the follow-up note first.");
    const id = idFrom(request);
    const result = parsed.data.action === "review" ? await startIncidentReviewFor(user, id) : await addIncidentNoteFor(user, id, parsed.data.body);
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
