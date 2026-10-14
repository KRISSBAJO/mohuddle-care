import { getSessionUser } from "@/server/auth";
import { warmModel } from "@/server/scribe";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";

/* Asks Ollama to load the note model while staff are still speaking. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  const settings = await getSettings();
  if (settings.scribe_enabled === "on") warmModel(settings.scribe_model);
  return new Response(null, { status: 204 });
}
