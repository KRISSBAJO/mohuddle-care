/*
 * The note scribe: what a local language model is asked for when it drafts a note from what a
 * staff member said, and how its answer is checked before it reaches the form. The model only
 * drafts. Staff read every line, change what is wrong, and sign it themselves.
 */

import { MOODS } from "./log-note";

export type ScribeKind = "daily" | "community";

type Field = { type: "text"; max: number; hint: string } | { type: "number"; min: number; max: number; hint: string } | { type: "boolean"; hint: string } | { type: "mood"; hint: string };

/* The form fields each note kind can be drafted into, with what each one holds. */
export const SCRIBE_FIELDS: Record<ScribeKind, Record<string, Field>> = {
  daily: {
    mood: { type: "mood", hint: "Overall mood: good unless the worker clearly said otherwise; great only if they said great or excellent; okay if mixed; low if sad or withdrawn; distressed for serious distress" },
    presentation: { type: "text", max: 500, hint: "How they presented: appearance, mood changes, engagement" },
    meals: { type: "text", max: 1000, hint: "What and how much they ate and drank, meal by meal" },
    fluidsOz: { type: "number", min: 0, max: 400, hint: "Total of the drink amounts that were clearly said, in US fluid ounces (a cup or glass = 8 oz, a bottle of water = 16 oz). Null if no amounts were said" },
    sleepHours: { type: "number", min: 0, max: 24, hint: "Hours slept, only if said, else null" },
    sleepNotes: { type: "text", max: 1000, hint: "Sleep and night checks" },
    health: { type: "text", max: 3000, hint: "Health: medications taken or refused, pain, injuries, falls, illness, symptoms. Medications always go here, never in activities" },
    activities: { type: "text", max: 3000, hint: "Activities and outings in and out of the home, such as the library, shopping, walks, TV, chores. Not medications, goals or phone calls" },
    goalProgress: { type: "text", max: 2000, hint: "Work on support plan goals: what they did and how much help they needed" },
    behaviourOccurred: { type: "boolean", hint: "True only if a behaviour of concern was described" },
    antecedent: { type: "text", max: 2000, hint: "What happened just before the behaviour" },
    behaviours: { type: "text", max: 3000, hint: "The behaviour: what was seen and heard, and how long it lasted" },
    intervention: { type: "text", max: 3000, hint: "What staff did in response" },
    behaviourOutcome: { type: "text", max: 2000, hint: "How it ended and how they were afterwards" },
    familyContact: { type: "text", max: 1000, hint: "Calls or visits with family or guardian" },
    appointments: { type: "text", max: 1000, hint: "Medical, dental, therapy or service appointments only. Outings are activities, not appointments" },
    notes: { type: "text", max: 5000, hint: "Shift summary: two to four sentences on how the whole shift went, mentioning the main events" },
  },
  community: {
    selection: { type: "text", max: 2000, hint: "How the activity was chosen, and by whom" },
    location: { type: "text", max: 1000, hint: "Where the activity took place" },
    activity: { type: "text", max: 2000, hint: "The activity or action, briefly" },
    trips: { type: "number", min: 0, max: 50, hint: "Number of trips, only if said, else null" },
    note: { type: "text", max: 5000, hint: "What happened, how they took part, and anything to follow up" },
    learning: { type: "text", max: 3000, hint: "Skills practised, choices made, chances to learn" },
  },
};

/* The JSON schema Ollama is held to, so the answer always has these fields and types. */
export function scribeSchema(kind: ScribeKind) {
  const properties: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(SCRIBE_FIELDS[kind])) {
    properties[name] =
      field.type === "text" ? { type: "string", description: field.hint }
      : field.type === "number" ? { type: ["number", "null"], description: field.hint }
      : field.type === "boolean" ? { type: "boolean", description: field.hint }
      : { type: "string", enum: [...MOODS], description: field.hint };
  }
  return { type: "object", properties, required: Object.keys(properties) };
}

/* The instructions. Plain rules against invention matter more than style. */
export function scribePrompt(kind: ScribeKind, context: { person: string; extra?: string }) {
  const fields = Object.entries(SCRIBE_FIELDS[kind]).map(([name, field]) => `- ${name}: ${field.hint}`).join("\n");
  return [
    `You turn a support worker's spoken words into a ${kind === "daily" ? "daily shift note" : "Community Participation note"} for a provider supporting people with intellectual and developmental disabilities. The person supported is ${context.person}.`,
    "Rules:",
    "- Use only facts the worker said. Never invent times, amounts, names, places, medications or events.",
    "- Leave a text field as an empty string, and a number as null, when the worker did not mention it.",
    "- Put each fact in the one field it belongs to; only the summary repeats the main points.",
    "- Do not add general statements that were not said, such as 'engaged well' or 'communicated normally'.",
    "- Speech-to-text can mishear names. When a word clearly sounds like one of the known names below, write the known name.",
    "- Write times as the worker said them, such as 7 a.m. or about 2 p.m.",
    "- Write in the past tense and third person, in plain, objective, professional English. Describe what was seen and heard, not opinions.",
    "- Keep the person's dignity: no labels such as 'aggressive' or 'non-compliant'; describe the behaviour instead.",
    "- Do not mention these rules or that you are a model.",
    context.extra ? `Known names: ${context.extra}` : "",
    "Fields:",
    fields,
  ]
    .filter(Boolean)
    .join("\n");
}

export type ScribeDraft = Record<string, string | number | boolean | null>;

/* Checks the model's answer field by field: right type, in range, trimmed to length. Unknown fields are dropped. */
export function cleanDraft(kind: ScribeKind, raw: unknown): ScribeDraft {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: ScribeDraft = {};
  for (const [name, field] of Object.entries(SCRIBE_FIELDS[kind])) {
    const value = source[name];
    if (field.type === "text") out[name] = typeof value === "string" ? value.trim().slice(0, field.max) : "";
    else if (field.type === "number") out[name] = typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max ? Math.round(value * 10) / 10 : null;
    else if (field.type === "boolean") out[name] = value === true;
    else out[name] = typeof value === "string" && (MOODS as readonly string[]).includes(value) ? value : null;
  }
  // Behaviour details only count when a behaviour was described.
  if (kind === "daily" && !out.behaviourOccurred) for (const name of ["antecedent", "behaviours", "intervention", "behaviourOutcome"]) out[name] = "";
  return out;
}

/* How many fields the draft filled, for "Filled 9 parts of the note". */
export function filledCount(draft: ScribeDraft): number {
  return Object.entries(draft).filter(([name, value]) => name !== "behaviourOccurred" && value !== "" && value !== null && value !== false).length;
}
