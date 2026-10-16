import { answer } from "@/server/assistant";
import { forPhone } from "@/server/mobile/assistant";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/* Ask Mohuddle on the phone: the website's assistant, with links to the app's own screens. Nothing is changed here. */
export const POST = phoneRoute(async (user, request) => {
  const settings = await getSettings();
  if (settings.assistant_enabled !== "on") return problem(403, "off", "Ask Mohuddle is switched off in settings.");
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = String(body.text ?? "").trim().slice(0, 500);
  if (!text) return problem(400, "invalid", "Say or type what you need.");
  return reply(forPhone(await answer(text, user, settings, Date.now())));
});
