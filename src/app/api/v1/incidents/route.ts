import { z } from "zod";
import { fileIncident } from "@/server/incident-report";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* Files an incident report from the phone, with the same checks as the website's form. Needs a signal. */
export const POST = phoneRoute(
  async (user, request) => {
    const raw = await request.json().catch(() => null);
    const id = raw?.requestId;
    if (id !== undefined && !z.uuid().safeParse(id).success) return problem(400, "invalid", "Unknown report request.");
    const result = await fileIncident(user, raw, id);
    return result.error !== undefined ? problem(400, "refused", result.error) : reply({ id: result.id });
  },
  { writes: true },
);
