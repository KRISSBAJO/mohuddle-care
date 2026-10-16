import { z } from "zod";
import { createDeviceSession, destroyDeviceSession, placesFor } from "@/server/auth";
import { phoneRoute, problem, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

const body = z.object({ agencyId: z.uuid() });

/* Moves the phone to another agency this person works for: this token ends and a new one is returned. */
export const POST = phoneRoute(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "invalid", "Choose an agency.");
  const place = (await placesFor(user.loginId)).find(item => item.agencyId === parsed.data.agencyId);
  if (!place) return problem(403, "not_your_agency", "You do not work for that agency.");
  if (place.agencyId === user.agencyId) return problem(400, "same_agency", "You are already in that agency.");
  await destroyDeviceSession();
  const session = await createDeviceSession({ id: place.userId, agencyId: place.agencyId }, user.device ?? "Phone");
  return reply({ token: session.token, expiresAt: session.expiresAt });
});
