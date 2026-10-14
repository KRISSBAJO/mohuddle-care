/*
 * A Community Participation note: an outing or activity in the community, written by the staff
 * member who supported it. The billable time is worked out from the start and end times.
 * No database access here, so the rules can be tested on their own.
 */

export type CommunityNote = {
  noteDate: string;
  startTime: string;
  endTime: string;
  minutes: number;
  trips: number | null;
  costCenter: string;
  otherParty: string;
  selection: string;
  location: string;
  activity: string;
  note: string;
  learning: string;
};

export type CommunityRules = { today: string; noteMin: number; costCenters: string[] };

type Source = { get(name: string): unknown };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

/* Minutes from start to end on the same day, or null when the end is not after the start. */
export function billableMinutes(start: string, end: string): number | null {
  if (!TIME.test(start) || !TIME.test(end)) return null;
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? diff : null;
}

/* "2 h 15 min", "45 min". */
export function durationWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/* True when two same-day time ranges share any minute. */
export function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }): boolean {
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

/* Checks a submitted note. Returns the clean note, or the first problem in a plain sentence. */
export function parseCommunityNote(form: Source, rules: CommunityRules): { note: CommunityNote } | { error: string } {
  const text = (name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max + 1);
  const noteDate = text("noteDate", 10);
  if (!DAY.test(noteDate)) return { error: "Choose the date of the activity." };
  if (noteDate > rules.today) return { error: "The date cannot be in the future." };
  const startTime = text("startTime", 5);
  const endTime = text("endTime", 5);
  if (!TIME.test(startTime) || !TIME.test(endTime)) return { error: "Enter the start and end times." };
  const minutes = billableMinutes(startTime, endTime);
  if (minutes === null) return { error: "The end time must be after the start time, on the same day." };

  const tripsRaw = text("trips", 4);
  const trips = tripsRaw === "" ? null : Number(tripsRaw);
  if (trips !== null && (!Number.isInteger(trips) || trips < 0 || trips > 50)) return { error: "Number of trips must be a whole number from 0 to 50." };

  const costCenter = text("costCenter", 120);
  if (costCenter && !rules.costCenters.includes(costCenter)) return { error: "Choose a cost center from the list." };

  const fields = { otherParty: 200, selection: 2000, location: 1000, activity: 2000, note: 5000, learning: 3000 } as const;
  const values = Object.fromEntries(Object.entries(fields).map(([name, max]) => [name, text(name, max)])) as Record<keyof typeof fields, string>;
  for (const [name, max] of Object.entries(fields)) {
    if (values[name as keyof typeof fields].length > max) return { error: `Keep ${words[name]} under ${max.toLocaleString("en-US")} characters.` };
  }
  if (!values.location) return { error: "Say where the activity took place." };
  if (!values.activity) return { error: "Describe the activity or action." };
  if (values.note.length < Math.max(1, rules.noteMin)) return { error: rules.noteMin > 1 ? `Write the note: at least ${rules.noteMin} characters about how it went.` : "Write the note." };
  if (form.get("attest") !== "on") return { error: "Confirm the note is accurate before you sign it." };

  return { note: { noteDate, startTime, endTime, minutes, trips, costCenter, ...values } };
}

const words: Record<string, string> = {
  otherParty: "the other responsible party",
  selection: "how the activity was selected",
  location: "the location",
  activity: "the activity",
  note: "the note",
  learning: "learning opportunities",
};
