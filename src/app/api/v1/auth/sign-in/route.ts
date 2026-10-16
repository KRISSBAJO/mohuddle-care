import { z } from "zod";
import { checkCredentials, createDeviceSession, placesFor, placesInOrder } from "@/server/auth";
import { problem, reply } from "@/server/mobile/api";
import { ipFrom, signInFailed, signInPaused, signInSucceeded } from "@/server/sign-in-guard";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  // Chosen when the login works for more than one agency.
  agencyId: z.uuid().optional(),
  // The phone's name, such as "Grace's iPhone", so a lost phone can be found and signed out.
  device: z.string().max(80).default("Phone"),
});

/*
 * Phone app sign-in. One agency: returns a token. Several and none chosen: returns the list to
 * choose from, and the app asks again with agencyId.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, "invalid", "Enter your email address and password.");
  const { email, password, agencyId, device } = parsed.data;
  // Repeated wrong passwords pause sign-in for a while, before the password is even checked.
  const ip = ipFrom(request.headers);
  const paused = await signInPaused(email, ip);
  if (paused) return problem(429, "too_many", paused);
  const login = await checkCredentials(email, password);
  if (!login) {
    await signInFailed(email, ip);
    return problem(401, "wrong_password", "That email and password do not match.");
  }
  await signInSucceeded(email, ip);
  const places = await placesInOrder(login.id);
  if (!places.length) return problem(403, "no_agency", "Your login is not active at any agency. Ask your office.");
  if (!agencyId && places.length > 1) {
    const named = await placesFor(login.id);
    return reply({ choose: named.map(place => ({ agencyId: place.agencyId, name: place.name })) });
  }
  const place = agencyId ? places.find(item => item.agencyId === agencyId) : places[0];
  if (!place) return problem(403, "not_your_agency", "You do not work for that agency.");
  const session = await createDeviceSession(place, device);
  return reply({ token: session.token, expiresAt: session.expiresAt });
}
