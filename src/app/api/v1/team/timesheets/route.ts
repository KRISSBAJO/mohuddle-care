import { z } from "zod";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { approveTimesheetFor, returnTimesheetFor } from "@/server/time-approvals";

export const dynamic = "force-dynamic";

const body = z.object({ periodId: z.string(), staffId: z.string(), action: z.enum(["approve", "return"]), note: z.string().max(1000).default("") });

/* Approves a timesheet, or sends it back to be checked. */
export const POST = phoneRoute(
  async (user, request) => {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problem(400, "invalid", "Choose approve or send back.");
    const { periodId, staffId, action, note } = parsed.data;
    const result = action === "approve" ? await approveTimesheetFor(user, periodId, staffId, note) : await returnTimesheetFor(user, periodId, staffId, note);
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
