import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { clockOutFor } from "@/server/time-clock";

export const dynamic = "force-dynamic";

/* Clocks out with the handover, with the same checks as the website. */
export const POST = phoneRoute(
  async (user, request) => {
    const result = await clockOutFor(user, await request.json().catch(() => null));
    return result.error ? problem(400, "refused", result.error) : reply({ entryId: result.entryId });
  },
  { writes: true },
);
