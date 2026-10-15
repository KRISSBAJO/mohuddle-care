import { getSessionUser } from "@/server/auth";
import { morningDigest } from "@/server/digest";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/* Today's manager summary as JSON, for the mobile app. For the roles that get the morning summary. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const settings = await getSettings();
  if (!settings.digest_roles.includes(user.role)) return Response.json({ error: "The morning summary is for managers." }, { status: 403 });
  return Response.json({ lines: await morningDigest(Date.now()) });
}
