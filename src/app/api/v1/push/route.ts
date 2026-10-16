import { z } from "zod";
import { setDevicePushToken } from "@/server/auth";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().regex(/^Expo(nent)?PushToken\[[^\]]{8,200}\]$/).nullable() });

/* The phone allows notifications (its Expo push address), or turns them off (null). */
export const POST = phoneRoute(async (_user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "invalid", "That is not a Mohuddle notification address.");
  if (!(await setDevicePushToken(parsed.data.token))) return problem(400, "not_phone", "Notifications are for the phone app.");
  return reply({ ok: true });
});
