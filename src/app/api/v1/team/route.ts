import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { teamNow } from "@/server/mobile/team";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/* The manager's Team screen: who needs a call, who is on shift, new incidents, and what waits for a decision. */
export const GET = phoneRoute(async user => {
  if (!canManage(user)) return problem(403, "not_manager", "This is for coordinators and administrators.");
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  return reply(await teamNow(now, settings));
});
