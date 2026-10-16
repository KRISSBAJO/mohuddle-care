import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { teamApprovals } from "@/server/mobile/team";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/* Time off, punch fixes, flagged punches and signed timesheets waiting for a decision. */
export const GET = phoneRoute(async user => {
  if (!canManage(user)) return problem(403, "not_manager", "This is for coordinators and administrators.");
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  return reply(await teamApprovals(now, settings));
});
