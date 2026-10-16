import { z } from "zod";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { decideTimeOffFor } from "@/server/time-approvals";

export const dynamic = "force-dynamic";

const body = z.object({ approve: z.boolean(), note: z.string().max(500).default(""), openShifts: z.boolean().default(false), allowNegative: z.boolean().default(false) });

/* Approves or declines a time-off request, with the same rules as the website. */
export const POST = phoneRoute(
  async (user, request) => {
    const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", "Choose approve or decline.");
    const { approve, ...decision } = parsed.data;
    const result = await decideTimeOffFor(user, id, approve, decision);
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
