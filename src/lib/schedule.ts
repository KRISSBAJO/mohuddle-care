/*
 * Scheduling rules shared by the server and the browser. No database code, so it is unit tested.
 * Times are instants (ISO strings); days are calendar days in the agency's time zone (YYYY-MM-DD).
 */
import { addDays, dateKey, zonedTime } from "./format";
import { zone } from "@/lib/format";

export type ShiftKind = "day" | "evening" | "overnight";
export type ShiftStatus = "open" | "scheduled" | "confirmed" | "completed" | "missed";

export type SchedShift = {
  id: string;
  homeId: string;
  staffId: string | null;
  startsAt: string;
  endsAt: string;
  kind: ShiftKind;
  patternId: string | null;
  status: ShiftStatus;
  note: string;
};

/* A named shift time set by admins, such as "Weekend day 07:00-19:00" on Saturdays and Sundays. */
export type ShiftPattern = {
  id: string;
  name: string;
  start: string;
  end: string;
  /* ISO weekdays: 1 = Monday ... 7 = Sunday, counted on the day the shift starts. */
  weekdays: number[];
};

export type SchedStaff = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  homeId: string | null;
  expiredCredentials: string[];
};

export type SchedHome = {
  id: string;
  name: string;
  type: string;
  /* Patterns that must always be staffed (null means every pattern), and the weekdays the home runs. */
  staffedPatterns: string[] | null;
  openDays: number[];
};

export type ScheduleRules = {
  coverageMinimum: number;
  overtimeHours: number;
  minRestHours: number;
  /* Active shift patterns, in display order. */
  patterns: ShiftPattern[];
};

export type Issue = {
  key: string;
  severity: "high" | "medium" | "low";
  type: "double" | "coverage" | "rest" | "overtime" | "credential";
  text: string;
  shiftId?: string;
  staffId?: string;
  homeId?: string;
  patternId?: string;
  day?: string;
};

const HOUR = 3_600_000;
const time = (iso: string) => Date.parse(iso);

/* Shifts that are not cancelled or missed still occupy the person. */
export const counts = (shift: SchedShift) => shift.status !== "missed";

export const shiftHours = (shift: Pick<SchedShift, "startsAt" | "endsAt">) => (time(shift.endsAt) - time(shift.startsAt)) / HOUR;

export const overlaps = (a: Pick<SchedShift, "startsAt" | "endsAt">, b: Pick<SchedShift, "startsAt" | "endsAt">) =>
  time(a.startsAt) < time(b.endsAt) && time(b.startsAt) < time(a.endsAt);

/* The day a shift belongs to is the agency's day it starts on. */
export const shiftDay = (shift: Pick<SchedShift, "startsAt">) => dateKey(new Date(shift.startsAt));

/* "07:00-15:00" on a day, as instants. An end at or before the start means the next morning. */
export function windowFor(day: string, hours: string): { startsAt: string; endsAt: string } {
  const [start, end] = hours.split("-");
  const endDay = end <= start ? addDays(day, 1) : day;
  return { startsAt: zonedTime(day, start).toISOString(), endsAt: zonedTime(endDay, end).toISOString() };
}

export const isoWeekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() || 7;

export const patternHours = (pattern: Pick<ShiftPattern, "start" | "end">) => `${pattern.start}-${pattern.end}`;

/* The colour group of a shift, from the hour it starts: morning starts are day, afternoon evening, the rest overnight. */
export function kindFor(start: string): ShiftKind {
  if (start >= "05:00" && start < "14:00") return "day";
  if (start >= "14:00" && start < "21:00") return "evening";
  return "overnight";
}

/* Patterns that run on a day of the week. */
export const patternsOn = (patterns: ShiftPattern[], day: string) => patterns.filter(pattern => pattern.weekdays.includes(isoWeekday(day)));

/* The patterns a home needs staffed on a day. None on days the home does not run. */
export function requiredPatterns(home: SchedHome, day: string, patterns: ShiftPattern[]): ShiftPattern[] {
  if (!home.openDays.includes(isoWeekday(day))) return [];
  return patternsOn(patterns, day).filter(pattern => home.staffedPatterns === null || home.staffedPatterns.includes(pattern.id));
}

/*
 * How many people cover a window at its thinnest point. Two people on 7-3 and 3-11 cover a 7-11 window
 * once; one person on 7-3 leaves 3-11 uncovered, so the answer is 0. Custom shifts count like any other.
 */
export function staffedThrough(window: { startsAt: string; endsAt: string }, shifts: Pick<SchedShift, "startsAt" | "endsAt" | "staffId" | "status">[]) {
  const from = time(window.startsAt);
  const to = time(window.endsAt);
  const working = shifts.filter(shift => shift.staffId && counts(shift as SchedShift) && time(shift.startsAt) < to && time(shift.endsAt) > from);
  const points = [...new Set([from, ...working.flatMap(shift => [time(shift.startsAt), time(shift.endsAt)]).filter(point => point > from && point < to)])].sort((a, b) => a - b);
  let thinnest = Infinity;
  for (const point of points) {
    const here = working.filter(shift => time(shift.startsAt) <= point && time(shift.endsAt) > point).length;
    thinnest = Math.min(thinnest, here);
  }
  return Number.isFinite(thinnest) ? thinnest : 0;
}

export function hoursByStaff(shifts: SchedShift[], from: string, to: string) {
  const totals = new Map<string, number>();
  for (const shift of shifts) {
    if (!shift.staffId || !counts(shift)) continue;
    const day = shiftDay(shift);
    if (day < from || day >= to) continue;
    totals.set(shift.staffId, (totals.get(shift.staffId) ?? 0) + shiftHours(shift));
  }
  return totals;
}

export type AssignmentCheck = {
  blocked: string | null;
  warnings: string[];
  hoursAfter: number;
};

/*
 * What happens if this person takes this shift. Double-booking blocks; everything else is a warning
 * the coordinator can accept, because sometimes a short rest or overtime is the only way to cover.
 */
export function checkAssignment(
  shift: Pick<SchedShift, "id" | "startsAt" | "endsAt">,
  person: SchedStaff,
  all: SchedShift[],
  rules: ScheduleRules,
  week: { from: string; to: string },
): AssignmentCheck {
  const theirs = all.filter(other => other.staffId === person.id && other.id !== shift.id && counts(other));
  const clash = theirs.find(other => overlaps(other, shift));
  const warnings: string[] = [];
  const restBefore = theirs
    .filter(other => time(other.endsAt) <= time(shift.startsAt))
    .map(other => (time(shift.startsAt) - time(other.endsAt)) / HOUR);
  const restAfter = theirs
    .filter(other => time(other.startsAt) >= time(shift.endsAt))
    .map(other => (time(other.startsAt) - time(shift.endsAt)) / HOUR);
  const shortest = Math.min(Infinity, ...restBefore, ...restAfter);
  if (rules.minRestHours > 0 && shortest < rules.minRestHours) warnings.push(`Only ${formatHours(shortest)} rest next to another shift`);
  const day = shiftDay(shift);
  const inWeek = day >= week.from && day < week.to;
  const current = hoursByStaff(theirs, week.from, week.to).get(person.id) ?? 0;
  const hoursAfter = current + (inWeek ? shiftHours(shift) : 0);
  if (hoursAfter > rules.overtimeHours) warnings.push(`${formatHours(hoursAfter)} this week, over ${rules.overtimeHours}`);
  if (person.expiredCredentials.length) warnings.push(`Expired: ${person.expiredCredentials.join(", ")}`);
  return {
    blocked: clash ? `Already working ${describeTime(clash)}` : null,
    warnings,
    hoursAfter,
  };
}

export type Candidate = { person: SchedStaff; check: AssignmentCheck; sameHome: boolean };

/* Everyone who could take a shift, best first: free, no warnings, based at that home, fewest hours. */
export function rankCandidates(
  shift: Pick<SchedShift, "id" | "startsAt" | "endsAt" | "homeId">,
  staff: SchedStaff[],
  all: SchedShift[],
  rules: ScheduleRules,
  week: { from: string; to: string },
): Candidate[] {
  return staff
    .map(person => ({ person, check: checkAssignment(shift, person, all, rules, week), sameHome: person.homeId === shift.homeId }))
    .sort(
      (a, b) =>
        Number(Boolean(a.check.blocked)) - Number(Boolean(b.check.blocked)) ||
        a.check.warnings.length - b.check.warnings.length ||
        Number(b.sameHome) - Number(a.sameHome) ||
        a.check.hoursAfter - b.check.hoursAfter ||
        a.person.firstName.localeCompare(b.person.firstName),
    );
}

export type WeekAnalysis = {
  hours: Map<string, number>;
  doubleBooked: Set<string>;
  shortRest: Set<string>;
  overtime: Set<string>;
  credentialRisk: Set<string>;
  coverage: Map<string, { required: number; filled: number; shifts: number }>;
  issues: Issue[];
};

export const coverageKey = (homeId: string, day: string, patternId: string) => `${homeId}|${day}|${patternId}`;

/* Every problem in a week, for the issues panel and the warning marks on the grid. */
export function analyzeWeek(
  shifts: SchedShift[],
  staff: SchedStaff[],
  homes: SchedHome[],
  days: string[],
  rules: ScheduleRules,
  today: string,
): WeekAnalysis {
  const from = days[0];
  const to = addDays(days[days.length - 1], 1);
  const people = new Map(staff.map(person => [person.id, person]));
  const name = (id: string) => {
    const person = people.get(id);
    return person ? `${person.firstName} ${person.lastName}` : "A former staff member";
  };
  const homeName = new Map(homes.map(home => [home.id, home.name]));
  const visible = shifts.filter(shift => {
    const day = shiftDay(shift);
    return day >= from && day < to;
  });
  const issues: Issue[] = [];
  const doubleBooked = new Set<string>();
  const shortRest = new Set<string>();

  const byStaff = new Map<string, SchedShift[]>();
  for (const shift of shifts) {
    if (!shift.staffId || !counts(shift)) continue;
    byStaff.set(shift.staffId, [...(byStaff.get(shift.staffId) ?? []), shift]);
  }
  for (const [staffId, theirs] of byStaff) {
    const sorted = [...theirs].sort((a, b) => time(a.startsAt) - time(b.startsAt));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && time(sorted[j].startsAt) < time(sorted[i].endsAt); j++) {
        if (!overlaps(sorted[i], sorted[j])) continue;
        doubleBooked.add(sorted[i].id).add(sorted[j].id);
        const day = shiftDay(sorted[j]);
        if (day >= from && day < to) {
          issues.push({
            key: `double-${sorted[i].id}-${sorted[j].id}`,
            severity: "high",
            type: "double",
            text: `${name(staffId)} is booked twice: ${describeTime(sorted[i])} and ${describeTime(sorted[j])}`,
            shiftId: sorted[j].id,
            staffId,
            day,
          });
        }
      }
      const next = sorted[i + 1];
      if (next && rules.minRestHours > 0) {
        const rest = (time(next.startsAt) - time(sorted[i].endsAt)) / HOUR;
        const day = shiftDay(next);
        if (rest >= 0 && rest < rules.minRestHours && day >= from && day < to) {
          shortRest.add(next.id);
          issues.push({
            key: `rest-${next.id}`,
            severity: "medium",
            type: "rest",
            text: `${name(staffId)} has ${formatHours(rest)} rest before ${describeTime(next)}`,
            shiftId: next.id,
            staffId,
            day,
          });
        }
      }
    }
  }

  const hours = hoursByStaff(shifts, from, to);
  const overtime = new Set<string>();
  for (const [staffId, total] of hours) {
    if (total <= rules.overtimeHours) continue;
    overtime.add(staffId);
    issues.push({ key: `overtime-${staffId}`, severity: "medium", type: "overtime", text: `${name(staffId)} is scheduled ${formatHours(total)} this week`, staffId });
  }

  // One warning per person, not per shift: the fix is renewing the credential, once.
  const credentialRisk = new Set<string>();
  const riskByStaff = new Map<string, SchedShift[]>();
  for (const shift of visible) {
    if (!shift.staffId || !counts(shift) || shiftDay(shift) < today) continue;
    if (!people.get(shift.staffId)?.expiredCredentials.length) continue;
    credentialRisk.add(shift.id);
    riskByStaff.set(shift.staffId, [...(riskByStaff.get(shift.staffId) ?? []), shift]);
  }
  for (const [staffId, theirs] of riskByStaff) {
    const first = [...theirs].sort((a, b) => time(a.startsAt) - time(b.startsAt))[0];
    issues.push({
      key: `credential-${staffId}`,
      severity: "medium",
      type: "credential",
      text: `${name(staffId)} has an expired ${people.get(staffId)!.expiredCredentials.join(", ")} and ${theirs.length} upcoming ${theirs.length === 1 ? "shift" : "shifts"}`,
      staffId,
      day: shiftDay(first),
    });
  }

  const coverage = new Map<string, { required: number; filled: number; shifts: number }>();
  for (const home of homes) {
    const atHome = shifts.filter(shift => shift.homeId === home.id && counts(shift));
    for (const day of days) {
      for (const pattern of requiredPatterns(home, day, rules.patterns)) {
        const window = windowFor(day, patternHours(pattern));
        const here = atHome.filter(shift => overlaps(shift, window));
        const filled = staffedThrough(window, here);
        coverage.set(coverageKey(home.id, day, pattern.id), { required: rules.coverageMinimum, filled, shifts: here.length });
        if (filled >= rules.coverageMinimum || day < today) continue;
        const missing = rules.coverageMinimum - filled;
        const soon = day <= addDays(today, 1);
        issues.push({
          key: `coverage-${home.id}-${day}-${pattern.id}`,
          severity: soon ? "high" : "medium",
          type: "coverage",
          text: `${homeName.get(home.id)} ${pattern.name} (${compactRange(window)}) on ${weekdayLabel(day)} needs ${missing} more ${missing === 1 ? "person" : "people"}`,
          shiftId: visible.find(shift => shift.homeId === home.id && !shift.staffId && overlaps(shift, window))?.id,
          homeId: home.id,
          patternId: pattern.id,
          day,
        });
      }
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.day ?? "").localeCompare(b.day ?? ""));
  return { hours, doubleBooked, shortRest, overtime, credentialRisk, coverage, issues };
}

export function formatHours(hours: number) {
  if (!Number.isFinite(hours)) return "0h";
  const rounded = Math.round(hours * 4) / 4;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(rounded * 4 % 2 ? 2 : 1)}h`;
}

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: zone(), hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(":00", "");

export const weekdayLabel = (day: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));

export const describeTime = (shift: Pick<SchedShift, "startsAt" | "endsAt">) =>
  `${weekdayLabel(shiftDay(shift))} ${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`;

export const shiftTimeRange = (shift: Pick<SchedShift, "startsAt" | "endsAt">) => `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`;

/* "7a–3p", "7:30a–11p": short enough for a schedule card. */
export function compactRange(shift: Pick<SchedShift, "startsAt" | "endsAt">) {
  const short = (iso: string) => {
    const [hh, mm] = clockOf(iso).split(":").map(Number);
    const hour = hh % 12 || 12;
    return `${hour}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${hh < 12 ? "a" : "p"}`;
  };
  return `${short(shift.startsAt)}–${short(shift.endsAt)}`;
}

/* Wall-clock HH:MM of an instant in the agency's time zone, for filling time inputs. */
export function clockOf(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/* Spreadsheet export of a week. Values are quoted so commas in notes cannot break columns. */
export function scheduleCsv(shifts: SchedShift[], homes: SchedHome[], staff: SchedStaff[], patterns: ShiftPattern[] = []) {
  const patternName = new Map(patterns.map(pattern => [pattern.id, pattern.name]));
  const homeName = new Map(homes.map(home => [home.id, home.name]));
  const personName = new Map(staff.map(person => [person.id, `${person.firstName} ${person.lastName}`]));
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [["Date", "Home", "Shift", "Start", "End", "Hours", "Staff", "Status", "Note"]];
  for (const shift of [...shifts].sort((a, b) => time(a.startsAt) - time(b.startsAt))) {
    rows.push([
      shiftDay(shift),
      homeName.get(shift.homeId) ?? "",
      (shift.patternId && patternName.get(shift.patternId)) || `Custom (${shift.kind})`,
      clockOf(shift.startsAt),
      clockOf(shift.endsAt),
      String(Math.round(shiftHours(shift) * 100) / 100),
      shift.staffId ? personName.get(shift.staffId) ?? "Former staff" : "OPEN",
      shift.status,
      shift.note,
    ]);
  }
  // A leading =, +, - or @ would run as a formula in a spreadsheet, so those cells start with a quote mark.
  return rows.map(row => row.map(cell => quote(/^[=+\-@]/.test(cell) ? `'${cell}` : cell)).join(",")).join("\r\n");
}
