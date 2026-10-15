/*
 * Every date shown or compared in Mohuddle is in the agency's own time zone. zone() gives it for the
 * code running now: on the server from the agency being worked for (src/server/zone.ts), in the
 * browser from the page (ZoneSync). Without either, Central time.
 */
export const DEFAULT_ZONE = "America/Chicago";

/* Time zones an agency can choose, with the words used for them. */
export const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Mountain, no daylight saving (Arizona)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

type ZoneSource = () => string | null | undefined;
const zoneHolder = globalThis as unknown as { mohuddleZoneSource?: ZoneSource; mohuddleBrowserZone?: string };

/* Where zone() looks. The server sets this once; tests may set it. */
export function setZoneSource(source: ZoneSource | undefined) {
  zoneHolder.mohuddleZoneSource = source;
}

/* The browser's copy of the page's zone, set by ZoneSync before anything on the page shows a time. */
export function setBrowserZone(value: string) {
  zoneHolder.mohuddleBrowserZone = value;
}

export function zone(): string {
  return zoneHolder.mohuddleZoneSource?.() ?? zoneHolder.mohuddleBrowserZone ?? DEFAULT_ZONE;
}

/* "Central time", "Eastern time": how the zone is named on screen. */
export function zoneLabel(value = zone()) {
  const known = TIME_ZONES.find(item => item.value === value);
  return known ? `${known.label.split(",")[0]} time` : value.replace(/_/g, " ");
}

export const labels = {
  serviceType: {
    day_services: "Day Services",
    supported_living: "Supported Living",
    family_model: "Family Model",
    foster_care: "Foster Care",
    supported_employment: "Supported Employment",
    personal_assistance: "Personal Assistance",
    residential_rehabilitation: "Residential Rehabilitation",
    respite: "Respite",
    semi_independent: "Semi-Independent",
  },
  homeType: {
    group_home: "Group home",
    family_model: "Family model home",
    supported_living: "Supported living",
    day_program: "Day program",
  },
  staffRole: {
    dsp: "Direct Support Professional",
    coordinator: "Program Coordinator",
    residential_manager: "Residential Manager",
    nurse: "Nurse",
    admin: "Administrator",
  },
  shiftKind: { day: "Day", evening: "Evening", overnight: "Overnight" },
  shiftStatus: { open: "Open", scheduled: "Scheduled", confirmed: "Confirmed", completed: "Completed", missed: "Missed" },
  mood: { great: "Great", good: "Good", okay: "Okay", low: "Low", distressed: "Distressed" },
  medStatus: { due: "Due", given: "Given", refused: "Refused", missed: "Missed", held: "Held" },
  incidentCategory: {
    injury: "Injury",
    medication_error: "Medication error",
    behavioural: "Behavioural",
    allegation: "Abuse or neglect allegation",
    elopement: "Elopement",
    property: "Property",
    other: "Other",
  },
  incidentSeverity: { low: "Low", moderate: "Moderate", high: "High", critical: "Critical" },
  incidentStatus: { open: "Open", under_review: "Under review", closed: "Closed" },
  taskPriority: { low: "Low", normal: "Normal", high: "High" },
  issuePriority: { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" },
  issueStatus: { open: "Open", in_progress: "In progress", resolved: "Resolved" },
  expenseStatus: { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected" },
  paymentMethod: { company_card: "Company card", petty_cash: "Petty cash", staff_paid: "Staff paid, to reimburse", invoice: "Invoice" },
} as const;

export type LabelGroup = keyof typeof labels;

export function label<G extends LabelGroup>(group: G, value: string | null | undefined): string {
  if (!value) return "";
  const map = labels[group] as Record<string, string>;
  return map[value] ?? value;
}

/* YYYY-MM-DD for a moment, in the agency's time zone. */
export function dateKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone(), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/* The instant the agency's wall clock reads the given date and HH:MM. */
export function zonedTime(day: string, hhmm: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMinutes(new Date(guess));
  const first = new Date(guess - offset * 60_000);
  const actualOffset = tzOffsetMinutes(first);
  return new Date(guess - actualOffset * 60_000);
}

/* Minutes the agency's time zone is ahead of UTC at the given instant (negative in the US). */
export function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone(),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return next.toISOString().slice(0, 10);
}

/* Monday of the week that contains the day. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/* "Sat, Oct 17, 10:25 PM": when a one-time link stops working. */
export const linkExpiry = (at: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: zone(), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);

export const fmt = {
  time: (at: Date | null | undefined) =>
    at ? new Intl.DateTimeFormat("en-US", { timeZone: zone(), hour: "numeric", minute: "2-digit" }).format(at) : "",
  day: (day: string | Date | null | undefined) => {
    if (!day) return "";
    const at = typeof day === "string" ? new Date(`${day}T12:00:00Z`) : day;
    return new Intl.DateTimeFormat("en-US", { timeZone: typeof day === "string" ? "UTC" : zone(), month: "short", day: "numeric" }).format(at);
  },
  dayLong: (day: string | null | undefined) =>
    day
      ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(
          new Date(`${day}T12:00:00Z`),
        )
      : "",
  dateTime: (at: Date | null | undefined) =>
    at ? new Intl.DateTimeFormat("en-US", { timeZone: zone(), month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at) : "",
  weekday: (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${day}T12:00:00Z`)),
};

export function age(dob: string | null | undefined, today = dateKey()): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let years = ty - y;
  if (tm < m || (tm === m && td < d)) years -= 1;
  return years;
}

export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/* Money is stored in cents and shown in dollars. */
export const money = (cents: number | null | undefined, whole = false) => (whole ? wholeDollars : dollars).format((cents ?? 0) / 100);

/* "12.50" or "$1,200" typed by a person, as cents. Null when it is not a valid amount. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/* A calendar month "2026-10": its first day, and the first day of the next month. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
