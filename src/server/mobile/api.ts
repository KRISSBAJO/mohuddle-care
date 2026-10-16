import "server-only";
import { getSessionUser, type SessionUser } from "@/server/auth";
import { readOnlyNow } from "@/server/billing";
import { asAgency } from "@/server/db";
import { noteProblem } from "@/server/health-log";

/* A JSON reply for the phone app. Errors carry a short code the app can act on, and words to show. */
export const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const problem = (status: number, code: string, error: string) => reply({ code, error }, status);

/*
 * Wraps a phone API route: checks the session (the phone's token), runs as that
 * agency so times use its zone, refuses changes while the agency is read-only, and turns an
 * unexpected failure into a plain message.
 */
export function phoneRoute(handler: (user: SessionUser, request: Request) => Promise<Response>, options: { writes?: boolean } = {}) {
  return async (request: Request) => {
    // The phone signs in with a token only. A browser cookie is never accepted here, so another
    // site cannot use someone's website sign-in to call these routes.
    if (!/^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "")) return problem(401, "signed_out", "Sign in again.");
    const user = await getSessionUser();
    if (!user) return problem(401, "signed_out", "Sign in again.");
    return asAgency(user.agencyId, async () => {
      if (options.writes && (await readOnlyNow())) return problem(403, "read_only", "This agency's Mohuddle subscription has lapsed, so nothing can be changed right now. Ask your office.");
      try {
        return await handler(user, request);
      } catch (error) {
        noteProblem(`Phone API ${new URL(request.url).pathname}`, error);
        return problem(500, "failed", "Something went wrong. Try again.");
      }
    });
  };
}
