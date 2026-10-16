import { requestTime } from "@/server/clock";
import { phoneRoute, reply } from "@/server/mobile/api";
import { staffToday } from "@/server/mobile/today";

export const dynamic = "force-dynamic";

/* The phone app's Today screen. */
export const GET = phoneRoute(async user => reply(await staffToday(user, await requestTime())));
