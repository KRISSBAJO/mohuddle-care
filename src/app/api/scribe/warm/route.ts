import { getSessionUser } from "@/server/auth";
import { warmModel, warmSpeech } from "@/server/scribe";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";

/* Loads the speech engine and the note model ahead of use, while staff are still getting ready to speak. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  const settings = await getSettings();
  if (settings.scribe_enabled === "on" || settings.assistant_enabled === "on") warmSpeech(settings.scribe_speech);
  // Ask Mohuddle only needs speech: loading the large note model at the same time slows speech down.
  if (settings.scribe_enabled === "on" && new URL(request.url).searchParams.get("for") !== "assistant") warmModel(settings.scribe_model);
  return new Response(null, { status: 204 });
}
