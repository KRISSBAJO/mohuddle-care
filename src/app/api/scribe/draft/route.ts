import { and, eq } from "drizzle-orm";
import { filledCount, type ScribeKind } from "@/lib/scribe";
import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { draftNote, ScribeError } from "@/server/scribe";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

/* Sorts what was said into the note's parts. The words are not stored; only the signed note is. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const settings = await getSettings();
  if (settings.scribe_enabled !== "on") return Response.json({ error: "Speaking notes is switched off in settings." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string; text?: string; person?: string };
  const kind: ScribeKind = body.kind === "community" ? "community" : "daily";
  const text = String(body.text ?? "").slice(0, 12_000);
  let person = "the person supported";
  let names: string[] = [];
  if (body.person && /^[0-9a-f-]{36}$/.test(body.person)) {
    const [row] = await db.select({ first: schema.individuals.firstName, last: schema.individuals.lastName }).from(schema.individuals).where(eq(schema.individuals.id, body.person)).limit(1);
    if (row) person = `${row.first} ${row.last}`;
    // Their medications, so a misheard drug name can be put right.
    const meds = await db.select({ name: schema.medications.name }).from(schema.medications).where(and(eq(schema.medications.individualId, body.person), eq(schema.medications.active, true)));
    names = meds.map(med => med.name);
  }
  try {
    const started = Date.now();
    const draft = await draftNote(kind, text, settings.scribe_model, { person, extra: names.length ? `medications ${names.join(", ")}` : undefined });
    return Response.json({ draft, filled: filledCount(draft), ms: Date.now() - started });
  } catch (error) {
    return Response.json({ error: error instanceof ScribeError ? error.message : "Something went wrong drafting the note." }, { status: 503 });
  }
}
