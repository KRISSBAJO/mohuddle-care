import { requestTime } from "@/server/clock";
import { phoneRoute, reply } from "@/server/mobile/api";
import { clockScreen } from "@/server/mobile/clock";

export const dynamic = "force-dynamic";

/* The phone app's clock screen: how to clock in, or how to clock out. */
export const GET = phoneRoute(async user => reply(await clockScreen(user, await requestTime())));
