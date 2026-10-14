/*
 * Pure rules for the time clock: distance from the home, which shift a punch belongs to, lateness,
 * time worked, and what a handover must contain. No database, so they are easy to test.
 */

export type Point = { latitude: number; longitude: number };
export type LocationState = "ok" | "outside" | "unavailable" | "home_not_set" | "not_checked";

/* Distance in meters between two points on the earth (haversine). */
export function distanceMeters(a: Point, b: Point): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/*
 * Whether a phone was at the home. A weak GPS fix gets the benefit of its own accuracy, up to the
 * radius again, so someone standing in the kitchen with a poor signal is not marked as away.
 */
export function locationVerdict(home: { latitude?: number | null; longitude?: number | null } | null, phone: (Point & { accuracy?: number }) | null, radius: number, checked = true): { state: LocationState; distance: number | null } {
  if (!checked) return { state: "not_checked", distance: null };
  if (!phone) return { state: "unavailable", distance: null };
  if (home?.latitude == null || home?.longitude == null) return { state: "home_not_set", distance: null };
  const distance = distanceMeters({ latitude: home.latitude, longitude: home.longitude }, phone);
  const slack = Math.min(Math.max(phone.accuracy ?? 0, 0), radius);
  return { state: distance <= radius + slack ? "ok" : "outside", distance };
}

export type ShiftWindow = { id: string; startsAt: Date; endsAt: Date };

/*
 * The shift someone can clock in to now: it has not ended, and it starts no more than earlyMinutes
 * from now. When several fit, the one that started or starts closest to now wins.
 */
export function clockableShift<T extends ShiftWindow>(shifts: T[], now: number, earlyMinutes: number): T | null {
  const open = shifts.filter(shift => shift.endsAt.getTime() > now && shift.startsAt.getTime() - earlyMinutes * 60_000 <= now);
  open.sort((a, b) => Math.abs(a.startsAt.getTime() - now) - Math.abs(b.startsAt.getTime() - now));
  return open[0] ?? null;
}

/* The next shift that has not started yet, for "you can clock in from 6:45". */
export function nextShift<T extends ShiftWindow>(shifts: T[], now: number): T | null {
  return [...shifts].filter(shift => shift.startsAt.getTime() > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}

/* Minutes late, counted from the shift start, but only once past the grace period. */
export function lateMinutes(shiftStart: Date, clockIn: number, graceMinutes: number): number {
  const late = Math.floor((clockIn - shiftStart.getTime()) / 60_000);
  return late > graceMinutes ? late : 0;
}

/* Minutes past the shift end, when beyond the allowance; otherwise 0. */
export function overstayMinutes(shiftEnd: Date | null, clockOut: number, allowedMinutes: number): number {
  if (!shiftEnd) return 0;
  const over = Math.floor((clockOut - shiftEnd.getTime()) / 60_000);
  return over > allowedMinutes ? over : 0;
}

export type BreakSpan = { kind: "meal" | "rest"; startAt: Date; endAt: Date | null };

/* Minutes worked: clock in to clock out (or now), less unpaid meal breaks. Rest breaks are paid. */
export function workedMinutes(clockIn: Date, clockOut: Date | null, breaks: BreakSpan[], now: number): number {
  const end = clockOut?.getTime() ?? now;
  const unpaid = breaks
    .filter(item => item.kind === "meal")
    .reduce((sum, item) => sum + Math.max(0, Math.min(item.endAt?.getTime() ?? end, end) - Math.max(item.startAt.getTime(), clockIn.getTime())), 0);
  return Math.max(0, Math.floor((end - clockIn.getTime() - unpaid) / 60_000));
}

/* "7 h 05 m" style. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}

/* The ticks a home's handover asks for: the agency list, then the home's own, without repeats. */
export function handoverChecklist(agency: string[], home: string[]): string[] {
  const seen = new Set<string>();
  return [...agency, ...home].filter(label => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type HandoverInput = {
  note: string;
  checks: { label: string; done: boolean; comment: string }[];
  incident: "none" | "reported" | "not_reported";
};

/*
 * What is missing from a handover, as sentences. Each tick is either done or explained: an unticked
 * item needs a comment saying why.
 */
export function handoverProblems(input: HandoverInput, rules: { minChars: number; checklist: string[]; requireNote: boolean; requireChecks: boolean; requireIncident: boolean }): string[] {
  const problems: string[] = [];
  if (rules.requireNote && input.note.trim().length < Math.max(1, rules.minChars)) {
    problems.push(rules.minChars > 1 ? `Write a handover note of at least ${rules.minChars} characters.` : "Write a handover note.");
  }
  if (rules.requireChecks) {
    for (const label of rules.checklist) {
      const check = input.checks.find(item => item.label === label);
      if (!check || (!check.done && check.comment.trim().length < 3)) problems.push(`Tick "${label}" or say why not.`);
    }
  }
  if (rules.requireIncident && input.incident === "not_reported") problems.push("An incident happened on this shift. Report it before clocking out.");
  return problems;
}

/* The full name typed to sign the clock-out must match the staff record, ignoring case and spaces. */
export function nameMatches(typed: string, first: string, last: string): boolean {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
  return clean(typed) === clean(`${first}${last}`);
}

/* Plain words for the flags a manager sees on a punch. */
const flagWords: Record<string, string> = {
  late: "Late",
  unscheduled: "No shift",
  away_in: "Away at clock in",
  away_out: "Away at clock out",
  no_location_in: "No location in",
  no_location_out: "No location out",
  overstay: "Stayed late",
  left_early: "Left early",
  left_undone: "Left work undone",
  forgot_clock_out: "Forgot clock out",
  edited: "Edited",
  corrected: "Corrected",
};
export const flagLabel = (flag: string) => flagWords[flag] ?? flag;
