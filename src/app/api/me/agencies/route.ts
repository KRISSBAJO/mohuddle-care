import { z } from "zod";
import { getSessionUser, placesFor, switchAgencyFor } from "@/server/auth";

export const dynamic = "force-dynamic";

/* The agencies the signed-in person works for, and which one this session is in. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const places = await placesFor(user.loginId);
  return Response.json({ current: user.agencyId, agencies: places.map(place => ({ id: place.agencyId, name: place.name, slug: place.slug, role: place.role })) });
}

const body = z.object({ agencyId: z.uuid() });

/* Switches this session to another of their agencies. The session cookie is replaced. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose an agency." }, { status: 400 });
  if (!(await switchAgencyFor(user, parsed.data.agencyId))) return Response.json({ error: "You do not work for that agency." }, { status: 403 });
  return Response.json({ ok: true, current: parsed.data.agencyId });
}
