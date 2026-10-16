import { givePrn, prnInput } from "@/server/medication-round";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* Gives an as-needed dose now, if the gap since the last dose and the daily most allow it. Needs a signal. */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = prnInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", parsed.error.issues[0]?.message ?? "Say why it is being given.");
    const result = await givePrn(user, parsed.data);
    return result.ok ? reply({ adminId: result.adminId }) : problem(409, "refused", result.error);
  },
  { writes: true },
);
