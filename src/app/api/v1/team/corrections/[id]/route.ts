import { z } from "zod";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { decideCorrectionFor } from "@/server/time-approvals";

export const dynamic = "force-dynamic";

const body = z.object({ approve: z.boolean(), note: z.string().max(1000).default("") });

/* Approves or declines a staff member's request to fix a punch. */
export const POST = phoneRoute(
  async (user, request) => {
    const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", "Choose approve or decline.");
    const result = await decideCorrectionFor(user, id, parsed.data.approve, parsed.data.note);
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
