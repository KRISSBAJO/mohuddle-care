import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";

/*
 * The browser calls this while someone is actively using a page (typing a long note, say) so the
 * server knows the session is in use. Reading the session updates its last-used time.
 */
export async function POST() {
  const user = await getSessionUser();
  return new Response(null, { status: user ? 204 : 401 });
}
