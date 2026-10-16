import { z } from "zod";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { endBreakFor, startBreakFor } from "@/server/time-clock";

export const dynamic = "force-dynamic";

const body = z.discriminatedUnion("action", [z.object({ action: z.literal("start"), kind: z.enum(["meal", "rest"]) }), z.object({ action: z.literal("end") })]);

/* Starts or ends a break. */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", "Choose a meal or rest break.");
    const result = parsed.data.action === "start" ? await startBreakFor(user, parsed.data.kind) : await endBreakFor(user);
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
