/*
 * A daily log is a full shift note: who, when and where, personal care, meals, sleep, health,
 * plan goal data, activities, behaviour, contacts, a written summary and the writer's signature.
 * This module checks a submitted note. It has no database access so it can be tested on its own.
 */

export const SHIFTS = ["day", "evening", "overnight"] as const;
export const MOODS = ["great", "good", "okay", "low", "distressed"] as const;
export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export const INTAKE = ["All", "Most", "About half", "A little", "None", "Refused", "Not offered", "Ate out or away"] as const;
export const SLEEP_QUALITY = ["Slept well", "Woke once or twice", "Restless", "Awake most of the night", "Not on this shift"] as const;
/* Personal care answers besides the support levels from settings. */
export const ADL_EXTRA = ["Refused", "Not needed this shift"] as const;
export const GOAL_OFFERED = { yes: "Worked on it", refused: "Offered, refused", no: "Not this shift" } as const;
export const GOAL_OUTCOME = { met: "Met today's target", progressing: "Progressing", not_met: "Not met" } as const;

export type LogRules = {
  today: string;
  requiredChecks: string[];
  summaryMin: number;
  locations: string[];
  adlItems: string[];
  promptLevels: string[];
  activityTypes: string[];
  goalIds: string[];
};

export type GoalEntry = {
  goalId: string;
  offered: keyof typeof GOAL_OFFERED;
  promptLevel: string;
  outcome: string;
  attempts: number | null;
  successes: number | null;
  note: string;
};

export type LogNote = {
  logDate: string;
  shift: (typeof SHIFTS)[number];
  timeIn: string;
  timeOut: string;
  location: string;
  mood: (typeof MOODS)[number];
  presentation: string;
  checks: string[];
  adl: Record<string, string>;
  mealIntake: Record<string, string>;
  meals: string;
  fluidsOz: number | null;
  sleepHours: number | null;
  sleepQuality: string;
  bowelMovements: number | null;
  incontinence: number | null;
  vitals: Partial<Record<"bpSys" | "bpDia" | "pulse" | "temp" | "weight" | "pain", number>>;
  seizure: boolean;
  seizureNotes: string;
  health: string;
  goals: GoalEntry[];
  goalProgress: string;
  activityTypes: string[];
  activities: string;
  behaviourOccurred: boolean;
  behaviours: string;
  antecedent: string;
  intervention: string;
  behaviourOutcome: string;
  familyContact: string;
  appointments: string;
  notes: string;
};

/* Anything with get and getAll, such as FormData or URLSearchParams. */
type Source = { get(name: string): unknown; getAll(name: string): unknown[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

class NoteError extends Error {}
const fail = (message: string): never => {
  throw new NoteError(message);
};

/* Checks a submitted note against the rules. Returns the clean note, or the first problem in a plain sentence. */
export function parseLogNote(form: Source, rules: LogRules): { note: LogNote } | { error: string } {
  try {
    return { note: read(form, rules) };
  } catch (error) {
    if (error instanceof NoteError) return { error: error.message };
    throw error;
  }
}

function read(form: Source, rules: LogRules): LogNote {
  const text = (name: string, max = 3000) => {
    const value = String(form.get(name) ?? "").trim();
    if (value.length > max) fail(`Keep ${describe(name)} under ${max.toLocaleString("en-US")} characters.`);
    return value;
  };
  const number = (name: string, min: number, max: number, whole = true) => {
    const raw = String(form.get(name) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || (whole && !Number.isInteger(value)) || value < min || value > max) fail(`${capital(describe(name))} must be ${whole ? "a whole number " : ""}from ${min} to ${max}.`);
    return value;
  };
  const yes = (name: string) => form.get(name) === "on";

  const logDate = text("logDate", 10);
  if (!DAY.test(logDate)) fail("Choose the date of the shift.");
  if (logDate > rules.today) fail("The log date cannot be in the future.");

  const shift = text("shift", 20) as LogNote["shift"];
  if (!SHIFTS.includes(shift)) fail("Choose which shift this log is for.");
  const timeIn = text("timeIn", 5);
  const timeOut = text("timeOut", 5);
  if (!TIME.test(timeIn) || !TIME.test(timeOut)) fail("Enter the time you started and finished supporting them.");
  if (timeIn === timeOut) fail("The start and finish times cannot be the same.");
  const location = text("location", 120);
  if (!rules.locations.includes(location)) fail("Choose where support was given.");

  const mood = text("mood", 20) as LogNote["mood"];
  if (!MOODS.includes(mood)) fail("Choose their mood.");

  const checks = form.getAll("checks").map(String).filter(Boolean);
  const missing = rules.requiredChecks.filter(item => !checks.includes(item));
  if (missing.length) fail(`Confirm every required check. Missing: ${missing.join(", ")}.`);

  const adlAnswers = new Set<string>([...rules.promptLevels, ...ADL_EXTRA]);
  const adl: Record<string, string> = {};
  rules.adlItems.forEach((item, index) => {
    const value = text(`adl.${index}`, 80);
    if (!value) return;
    if (!adlAnswers.has(value)) fail(`Choose a support level for ${item}.`);
    adl[item] = value;
  });

  const mealIntake: Record<string, string> = {};
  for (const meal of MEALS) {
    const value = text(`meal.${meal}`, 40);
    if (!value) continue;
    if (!(INTAKE as readonly string[]).includes(value)) fail(`Choose how much they ate at ${meal.toLowerCase()}.`);
    mealIntake[meal] = value;
  }

  const sleepQuality = text("sleepQuality", 60);
  if (sleepQuality && !(SLEEP_QUALITY as readonly string[]).includes(sleepQuality)) fail("Choose how they slept.");

  const vitals: LogNote["vitals"] = {};
  const vital = (key: keyof LogNote["vitals"], min: number, max: number, whole = true) => {
    const value = number(key, min, max, whole);
    if (value !== null) vitals[key] = value;
  };
  vital("bpSys", 60, 260);
  vital("bpDia", 30, 160);
  vital("pulse", 20, 250);
  vital("temp", 90, 110, false);
  vital("weight", 30, 700, false);
  vital("pain", 0, 10);
  if ((vitals.bpSys === undefined) !== (vitals.bpDia === undefined)) fail("Enter both blood pressure numbers, or neither.");
  if (vitals.bpSys !== undefined && vitals.bpDia !== undefined && vitals.bpDia >= vitals.bpSys) fail("The lower blood pressure number must be below the upper one.");

  const seizure = yes("seizure");
  const seizureNotes = text("seizureNotes");
  if (seizure && seizureNotes.length < 10) fail("Describe the seizure: when it started, how long it lasted, what it looked like and what you did.");

  const goals: GoalEntry[] = rules.goalIds.map(goalId => {
    const offered = (text(`goal.${goalId}.offered`, 10) || "no") as GoalEntry["offered"];
    if (!(offered in GOAL_OFFERED)) fail("Choose whether each goal was worked on.");
    const promptLevel = text(`goal.${goalId}.prompt`, 80);
    const outcome = text(`goal.${goalId}.outcome`, 20);
    const attempts = number(`goal.${goalId}.attempts`, 0, 100);
    const successes = number(`goal.${goalId}.successes`, 0, 100);
    if (offered === "yes") {
      if (!rules.promptLevels.includes(promptLevel)) fail("For each goal worked on, choose how much support was needed.");
      if (!(outcome in GOAL_OUTCOME)) fail("For each goal worked on, choose how it went.");
      if (attempts !== null && successes !== null && successes > attempts) fail("A goal cannot have more successes than attempts.");
    }
    return {
      goalId,
      offered,
      promptLevel: offered === "yes" ? promptLevel : "",
      outcome: offered === "yes" ? outcome : "",
      attempts: offered === "yes" ? attempts : null,
      successes: offered === "yes" ? successes : null,
      note: text(`goal.${goalId}.note`, 1000),
    };
  });

  const activityTypes = form.getAll("activityTypes").map(String).filter(Boolean);
  const unknown = activityTypes.find(type => !rules.activityTypes.includes(type));
  if (unknown) fail(`"${unknown}" is not an activity type. Refresh the page.`);

  const behaviourOccurred = yes("behaviourOccurred");
  const behaviours = text("behaviours");
  const intervention = text("intervention");
  if (behaviourOccurred && behaviours.length < 10) fail("Describe the behaviour: what you saw and heard, and how long it lasted.");
  if (behaviourOccurred && intervention.length < 5) fail("Say what staff did in response to the behaviour.");

  const notes = text("notes", 5000);
  if (notes.length < rules.summaryMin) fail(`Write the shift summary: at least ${rules.summaryMin} characters about how the shift went.`);
  if (!yes("attest")) fail("Confirm the note is accurate before you sign it.");

  return {
    logDate,
    shift,
    timeIn,
    timeOut,
    location,
    mood,
    presentation: text("presentation", 500),
    checks,
    adl,
    mealIntake,
    meals: text("meals", 1000),
    fluidsOz: number("fluidsOz", 0, 400),
    sleepHours: number("sleepHours", 0, 24, false),
    sleepQuality,
    bowelMovements: number("bowelMovements", 0, 20),
    incontinence: number("incontinence", 0, 30),
    vitals,
    seizure,
    seizureNotes: seizure ? seizureNotes : "",
    health: text("health"),
    goals,
    goalProgress: text("goalProgress", 2000),
    activityTypes,
    activities: text("activities"),
    behaviourOccurred,
    behaviours: behaviourOccurred ? behaviours : "",
    antecedent: behaviourOccurred ? text("antecedent", 2000) : "",
    intervention: behaviourOccurred ? intervention : "",
    behaviourOutcome: behaviourOccurred ? text("behaviourOutcome", 2000) : "",
    familyContact: text("familyContact", 1000),
    appointments: text("appointments", 1000),
    notes,
  };
}

const names: Record<string, string> = {
  fluidsOz: "fluids",
  sleepHours: "hours slept",
  bowelMovements: "bowel movements",
  incontinence: "incontinence episodes",
  bpSys: "the upper blood pressure number",
  bpDia: "the lower blood pressure number",
  pulse: "pulse",
  temp: "temperature",
  weight: "weight",
  pain: "pain score",
  notes: "the shift summary",
};

function describe(name: string) {
  if (name.endsWith(".attempts")) return "attempts";
  if (name.endsWith(".successes")) return "successes";
  return names[name] ?? name.replace(/([A-Z])/g, " $1").toLowerCase();
}
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/* Minutes worked on a shift. An end before the start means the shift ran past midnight. */
export function shiftMinutes(timeIn: string, timeOut: string) {
  if (!TIME.test(timeIn) || !TIME.test(timeOut)) return null;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const diff = toMinutes(timeOut) - toMinutes(timeIn);
  return diff > 0 ? diff : diff + 24 * 60;
}

/* A log written after the day it describes is a late entry. Reviewers expect it to be marked. */
export function isLateEntry(logDate: string, writtenDay: string) {
  return writtenDay > logDate;
}
