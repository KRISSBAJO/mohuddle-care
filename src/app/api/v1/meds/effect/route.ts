import { effectInput, recordEffect } from "@/server/medication-round";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* How an as-needed dose worked. */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = effectInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", parsed.error.issues[0]?.message ?? "Say how it worked.");
    const result = await recordEffect(user, parsed.data);
    return result.ok ? reply({ ok: true }) : problem(409, "refused", result.error);
  },
  { writes: true },
);
