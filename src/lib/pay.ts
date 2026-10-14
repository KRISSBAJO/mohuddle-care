/*
 * Estimated gross pay from hours, rates and differentials. An estimate for checking payroll, not a
 * payslip: the payroll provider remains the record of what was paid.
 *
 * Overtime follows the federal "regular rate" rule: in each workweek, straight-time pay plus
 * differentials divided by all hours gives the regular rate, and overtime hours earn the extra half
 * (or whatever the overtime percent is) of that rate on top of their straight time.
 */

import { addDays, dateKey, zonedTime } from "./format";
import { workweekStart, type PunchLine } from "./payroll";

export type Rate = { effectiveFrom: string; centsPerHour: number };
export type Differential = {
  id: string;
  name: string;
  kind: "hours" | "days" | "home";
  startTime: string;
  endTime: string;
  days: number[];
  homeId: string | null;
  centsPerHour: number;
};

/* The rate in force on a day: the latest one that started on or before it. */
export function rateOn(rates: Rate[], day: string): number | null {
  let best: Rate | null = null;
  for (const rate of rates) if (rate.effectiveFrom <= day && (!best || rate.effectiveFrom > best.effectiveFrom)) best = rate;
  return best?.centsPerHour ?? null;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const isoDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; // 1 = Monday ... 7 = Sunday
};

/*
 * Minutes of a punch that a differential applies to, scaled down by its unpaid meal time so a meal
 * break inside the window is not paid extra. Time windows may cross midnight (23:00 to 07:00).
 */
export function differentialMinutes(diff: Differential, line: { clockInAt: Date; clockOutAt: Date | null; minutes: number; homeId: string | null }): number {
  if (!line.clockOutAt || line.minutes <= 0) return 0;
  const start = line.clockInAt.getTime();
  const end = line.clockOutAt.getTime();
  const span = (end - start) / 60_000;
  if (span <= 0) return 0;
  let covered = 0;
  if (diff.kind === "home") covered = diff.homeId && diff.homeId === line.homeId ? span : 0;
  else {
    const first = addDays(dateKey(line.clockInAt), -1);
    const last = dateKey(line.clockOutAt);
    for (let day = first; day <= last; day = addDays(day, 1)) {
      if (diff.kind === "days") {
        if (diff.days.includes(isoDay(day))) covered += overlap(start, end, zonedTime(day, "00:00").getTime(), zonedTime(addDays(day, 1), "00:00").getTime()) / 60_000;
      } else {
        // The window opens on this day; when it ends earlier than it starts, it closes the next morning.
        if (diff.days.length && !diff.days.includes(isoDay(day))) continue;
        const open = zonedTime(day, diff.startTime).getTime();
        const close = zonedTime(diff.endTime <= diff.startTime ? addDays(day, 1) : day, diff.endTime).getTime();
        covered += overlap(start, end, open, close) / 60_000;
      }
    }
  }
  return Math.round(Math.min(covered, span) * (line.minutes / span));
}

export type PayRules = { overtimePercent: number; holidayPercent: number; weekStartsOn: number };
export type PayLineInput = Pick<PunchLine, "id" | "day" | "clockInAt" | "clockOutAt" | "minutes" | "overtime" | "homeId" | "holiday" | "open" | "paidStart">;

export type GrossPay = {
  straight: number;
  differentials: number;
  overtimePremium: number;
  holidayPremium: number;
  timeOff: number;
  adjustments: number;
  gross: number;
  missingRate: boolean;
  byDifferential: { name: string; minutes: number; cents: number }[];
};

/*
 * Estimated gross pay in cents for the lines inside a period. allLines are every line in the
 * workweeks touching the period, so the regular rate uses the whole week.
 */
export function grossPay(input: {
  lines: PayLineInput[];
  allLines: PayLineInput[];
  rates: Rate[];
  differentials: Differential[];
  rules: PayRules;
  timeOff: { day: string; minutes: number }[];
  adjustments: { minutes: number; overtime: boolean; day: string }[];
}): GrossPay {
  const { rates, differentials, rules } = input;
  let missingRate = false;
  const rate = (day: string) => {
    const cents = rateOn(rates, day);
    if (cents === null) missingRate = true;
    return cents ?? 0;
  };
  const diffTotals = new Map<string, { name: string; minutes: number; cents: number }>();
  const lineStraight = (line: PayLineInput, track: boolean) => {
    if (line.open || line.minutes <= 0) return { straight: 0, diff: 0 };
    const straight = (line.minutes * rate(line.day)) / 60;
    let diff = 0;
    for (const item of differentials) {
      // Differentials follow the paid time: an early clock-in paid from the shift start earns nothing extra before it.
      const minutes = differentialMinutes(item, { ...line, clockInAt: line.paidStart ?? line.clockInAt });
      if (!minutes) continue;
      const cents = (minutes * item.centsPerHour) / 60;
      diff += cents;
      if (track) {
        const entry = diffTotals.get(item.id) ?? { name: item.name, minutes: 0, cents: 0 };
        entry.minutes += minutes;
        entry.cents += cents;
        diffTotals.set(item.id, entry);
      }
    }
    return { straight, diff };
  };

  const inside = new Set(input.lines.map(line => line.id));
  let straight = 0;
  let diffs = 0;
  let overtimePremium = 0;
  let holidayPremium = 0;
  const weeks = new Map<string, PayLineInput[]>();
  for (const line of input.allLines) {
    const week = workweekStart(line.day, rules.weekStartsOn);
    weeks.set(week, [...(weeks.get(week) ?? []), line]);
  }
  for (const lines of weeks.values()) {
    let weekPay = 0;
    let weekMinutes = 0;
    for (const line of lines) {
      const pay = lineStraight(line, inside.has(line.id));
      weekPay += pay.straight + pay.diff;
      weekMinutes += line.open ? 0 : line.minutes;
      if (inside.has(line.id)) {
        straight += pay.straight;
        diffs += pay.diff;
        if (line.holiday && rules.holidayPercent > 100) holidayPremium += (line.minutes * rate(line.day) * (rules.holidayPercent - 100)) / 100 / 60;
      }
    }
    const regularRate = weekMinutes ? weekPay / weekMinutes : 0; // cents per minute
    const overtimeInside = lines.filter(line => inside.has(line.id)).reduce((sum, line) => sum + line.overtime, 0);
    overtimePremium += (overtimeInside * regularRate * (rules.overtimePercent - 100)) / 100;
  }
  const timeOff = input.timeOff.reduce((sum, item) => sum + (item.minutes * rate(item.day)) / 60, 0);
  const adjustments = input.adjustments.reduce((sum, item) => sum + (item.minutes * rate(item.day) * (item.overtime ? rules.overtimePercent : 100)) / 100 / 60, 0);
  const round = (cents: number) => Math.round(cents);
  const result = {
    straight: round(straight),
    differentials: round(diffs),
    overtimePremium: round(overtimePremium),
    holidayPremium: round(holidayPremium),
    timeOff: round(timeOff),
    adjustments: round(adjustments),
  };
  return {
    ...result,
    gross: result.straight + result.differentials + result.overtimePremium + result.holidayPremium + result.timeOff + result.adjustments,
    missingRate,
    byDifferential: [...diffTotals.values()].map(item => ({ ...item, cents: round(item.cents) })),
  };
}

/* ---------- Time off ---------- */

/* Working days from one date to another, inclusive, for spreading a request's hours. */
export function daysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end && days.length < 366; day = addDays(day, 1)) days.push(day);
  return days;
}

/* A request's minutes spread evenly over its days, for the days that fall inside a period. */
export function timeOffInPeriod(request: { startDate: string; endDate: string; minutes: number }, period: { start: string; end: string }) {
  const days = daysInRange(request.startDate, request.endDate);
  if (!days.length) return [];
  const each = request.minutes / days.length;
  return days.filter(day => day >= period.start && day <= period.end).map(day => ({ day, minutes: Math.round(each) }));
}

/* Minutes of leave earned for minutes worked, capped so the balance never passes the maximum. */
export function accrual(workedMinutes: number, perHoursWorked: number, balance: number, maxBalanceMinutes: number): number {
  if (perHoursWorked <= 0 || workedMinutes <= 0) return 0;
  const earned = Math.floor(workedMinutes / perHoursWorked);
  return Math.max(0, Math.min(earned, maxBalanceMinutes - balance));
}

/* "$1,234.56" from cents. */
export const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
