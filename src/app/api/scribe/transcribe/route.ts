import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { assistantVocabulary } from "@/server/assistant";
import { MAX_PCM_BYTES, ScribeError, transcribe } from "@/server/scribe";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

/* Names Whisper should listen for: the person, the staff, their medications and home. Helps it spell them. */
async function vocabulary(individualId: string | null) {
  const staff = await db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.active, true));
  const words = staff.flatMap(row => [row.first, row.last]);
  if (individualId && /^[0-9a-f-]{36}$/.test(individualId)) {
    const [person] = await db.select({ first: schema.individuals.firstName, last: schema.individuals.lastName, home: schema.homes.name }).from(schema.individuals).leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId)).where(eq(schema.individuals.id, individualId)).limit(1);
    const meds = await db.select({ name: schema.medications.name }).from(schema.medications).where(and(eq(schema.medications.individualId, individualId), eq(schema.medications.active, true)));
    if (person) words.unshift(person.first, person.last, ...(person.home ? [person.home] : []));
    words.push(...meds.map(med => med.name));
  }
  return [...new Set(words.filter(Boolean))];
}

/*
 * Turns a recording into words. The body is 16 kHz mono 16-bit PCM, decoded in the browser.
 * The audio is only held in memory for this request; it is never saved.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const settings = await getSettings();
  const params = new URL(request.url).searchParams;
  const forAssistant = params.get("mode") === "assistant";
  // Speaking to Ask Mohuddle needs only the speech engine; speaking a note needs the scribe switched on.
  if (forAssistant ? settings.assistant_enabled !== "on" : settings.scribe_enabled !== "on") return Response.json({ error: "Speaking is switched off in settings." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PCM_BYTES) return Response.json({ error: "Recordings can be up to ten minutes." }, { status: 413 });
  const pcm = Buffer.from(await request.arrayBuffer());
  try {
    const result = await transcribe(pcm, settings.scribe_speech, forAssistant ? await assistantVocabulary() : await vocabulary(params.get("person")));
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof ScribeError ? error.message : "Something went wrong turning speech into words." }, { status: 503 });
  }
}
