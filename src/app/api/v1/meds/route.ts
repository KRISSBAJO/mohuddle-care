import { requestTime } from "@/server/clock";
import { homeRound } from "@/server/medication-round";
import { phoneRoute, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* Today's medicine round at the staff member's home, or at ?home=… */
export const GET = phoneRoute(async (user, request) => {
  const home = new URL(request.url).searchParams.get("home");
  return reply(await homeRound(user, home && /^[0-9a-f-]{36}$/.test(home) ? home : null, await requestTime()));
});
