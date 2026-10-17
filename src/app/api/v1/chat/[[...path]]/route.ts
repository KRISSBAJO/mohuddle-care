import { handleChat } from "@/server/chat/http";
import { phoneRoute } from "@/server/mobile/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Chat for the phone app: the same requests as the website's /api/chat, signed in with the phone's token. */
const handle = phoneRoute(async (user, request) => {
  const path = new URL(request.url).pathname.replace(/^\/api\/v1\/chat\/?/, "").split("/").filter(Boolean);
  return handleChat(user, request, path);
});

export const GET = handle;
export const POST = handle;
