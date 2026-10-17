import { getSessionUser } from "@/server/auth";
import { handleChat } from "@/server/chat/http";
import { asAgency } from "@/server/db";
import { noteProblem } from "@/server/health-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Chat for the website, signed in with the browser's cookie. Changes must carry the X-Mohuddle-Chat
 * header, which another site cannot add to a request, so a cookie alone never sends a message.
 */
async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ code: "signed_out", error: "Sign in again." }, { status: 401 });
  if (request.method === "POST" && request.headers.get("x-mohuddle-chat") !== "1") return Response.json({ code: "refused", error: "Refresh the page and try again." }, { status: 403 });
  const { path = [] } = await params;
  return asAgency(user.agencyId, async () => {
    try {
      return await handleChat(user, request, path);
    } catch (error) {
      noteProblem(`Chat ${new URL(request.url).pathname}`, error);
      return Response.json({ code: "failed", error: "Something went wrong. Try again." }, { status: 500 });
    }
  });
}

export const GET = handle;
export const POST = handle;
