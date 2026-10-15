import { answer } from "@/server/assistant";
import { getSessionUser } from "@/server/auth";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/* Ask Mohuddle: one request in, one answer out. Actions come back as cards to confirm, never done here. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const settings = await getSettings();
  if (settings.assistant_enabled !== "on") return Response.json({ error: "Ask Mohuddle is switched off in settings." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim().slice(0, 500);
  if (!text) return Response.json({ error: "Say or type what you need." }, { status: 400 });
  return Response.json(await answer(text, user, settings, Date.now()));
}
