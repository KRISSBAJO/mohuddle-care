import { getSessionUser } from "@/server/auth";
import { shiftHuddle, shiftWrapUp } from "@/server/huddle";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/*
 * The signed-in staff member's shift, as JSON, for the web and the mobile app: the huddle (null with
 * no shift) and what is left before clocking out (null when not clocked in).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.staffId) return Response.json({ huddle: null, wrapUp: null });
  const settings = await getSettings();
  const now = Date.now();
  const [huddle, wrapUp] = await Promise.all([shiftHuddle(user.staffId, now, settings), shiftWrapUp(user.staffId, now, settings, true)]);
  return Response.json({ huddle, wrapUp });
}
