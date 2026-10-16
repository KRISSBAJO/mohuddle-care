import { z } from "zod";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { reviewEntryFor } from "@/server/time-approvals";

export const dynamic = "force-dynamic";

const body = z.object({ note: z.string().max(1000).default("") });

/* Marks a flagged punch as looked at. */
export const POST = phoneRoute(
  async (user, request) => {
    const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    const result = await reviewEntryFor(user, id, parsed.success ? parsed.data.note : "");
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
