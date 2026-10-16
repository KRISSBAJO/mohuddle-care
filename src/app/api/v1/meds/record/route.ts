import { z } from "zod";
import { doseInput, recordDose } from "@/server/medication-round";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

const body = z.object({
  doses: z.array(doseInput).min(1).max(100),
  // True when these were saved on the phone with no signal and are being sent now.
  offline: z.boolean().default(false),
});

/*
 * Records one or more doses. Each comes back ok, or refused with the reason: most often that
 * someone else already recorded it, so the phone shows who instead of recording it twice.
 */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", "The doses could not be read. Try again.");
    const results = [];
    for (const dose of parsed.data.doses) results.push(await recordDose(user, dose, { offline: parsed.data.offline }));
    return reply({ results });
  },
  { writes: true },
);
