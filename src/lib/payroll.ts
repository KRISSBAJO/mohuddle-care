/*
 * Pay periods, rounding and overtime, as pure functions over Central date keys (YYYY-MM-DD) and
 * minutes. Hours only: pay rates are worked out by the payroll provider from the export.
 */

import { addDays, dateKey, daysBetween } from "./format";

export type PeriodType = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type Period = { start: string; end: string };

const lastOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/* The pay period that contains a day. Weekly and every-two-weeks periods count from the anchor date. */
export function periodFor(day: string, type: PeriodType, anchor: string): Period {
  const [y, m, d] = day.split("-").map(Number);
  if (type === "monthly") return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastOfMonth(y, m))}` };
  if (type === "semimonthly") return d <= 15 ? { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15` } : { start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(lastOfMonth(y, m))}` };
  const length = type === "weekly" ? 7 : 14;
  const offset = ((daysBetween(anchor, day) % length) + length) % length;
  const start = addDays(day, -offset);
  return { start, end: addDays(start, length - 1) };
}

export const previousPeriod = (period: Period, type: PeriodType, anchor: string) => periodFor(addDays(period.start, -1), type, anchor);
export const nextPeriod = (period: Period, type: PeriodType, anchor: string) => periodFor(addDays(period.end, 1), type, anchor);

/* The first day of the workweek that contains a day. weekStartsOn: 1 = Monday ... 7 = Sunday. */
export function workweekStart(day: string, weekStartsOn: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; // 1..7, Monday first
  return addDays(day, -((dow - weekStartsOn + 7) % 7));
}

/* A punch time rounded to the nearest step of minutes, as federal rules allow when it is even-handed. */
export function roundTime(at: number, step: number): number {
  if (step <= 1) return at;
  const unit = step * 60_000;
  return Math.round(at / unit) * unit;
}

/* "2026-11-26 Thanksgiving" lines into day → name. Lines that do not start with a date are ignored. */
export function parseHolidays(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const match = line.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
    if (match) map.set(match[1], match[2].trim() || "Holiday");
  }
  return map;
}

export type Punch = { id: string; clockInAt: Date; clockOutAt: Date | null; mealMinutes: number; homeId: string | null; home: string | null; shiftStart?: Date | null };
export type PunchLine = Punch & { day: string; minutes: number; regular: number; overtime: number; holiday: string | null; open: boolean; paidStart?: Date };
export type Adjustment = { minutes: number; overtime: boolean };

export type SheetRules = { rounding: number; overtimeAfterHours: number; weekStartsOn: number; holidays: Map<string, string>; payFromShiftStart?: boolean };

/*
 * Lines and totals for one person's punches. Overtime is per workweek: punches are taken in order and
 * the minutes past the threshold in that week are overtime, so a week split across two pay periods
 * gives the same answer whichever period it is viewed from. Pass every punch in the workweeks that
 * touch the period; only lines inside the period are counted in the totals.
 */
export function timesheet(punches: Punch[], period: Period, rules: SheetRules, adjustments: Adjustment[] = []) {
  const ordered = [...punches].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  const weekUsed = new Map<string, number>();
  const threshold = rules.overtimeAfterHours * 60;
  const lines: PunchLine[] = ordered.map(punch => {
    const day = dateKey(punch.clockInAt);
    if (!punch.clockOutAt) return { ...punch, day, minutes: 0, regular: 0, overtime: 0, holiday: rules.holidays.get(day) ?? null, open: true };
    // An early clock-in can be paid from the shift start instead; the real punch is kept either way.
    const begin = rules.payFromShiftStart && punch.shiftStart && punch.shiftStart > punch.clockInAt ? punch.shiftStart : punch.clockInAt;
    const start = roundTime(begin.getTime(), rules.rounding);
    const end = roundTime(punch.clockOutAt.getTime(), rules.rounding);
    const minutes = Math.max(0, Math.round((end - start) / 60_000) - punch.mealMinutes);
    const week = workweekStart(day, rules.weekStartsOn);
    const before = weekUsed.get(week) ?? 0;
    const regular = Math.max(0, Math.min(minutes, threshold - before));
    weekUsed.set(week, before + minutes);
    return { ...punch, day, minutes, regular, overtime: minutes - regular, holiday: rules.holidays.get(day) ?? null, open: false, paidStart: begin };
  });
  const inside = lines.filter(line => line.day >= period.start && line.day <= period.end);
  const adjusted = {
    regular: adjustments.filter(item => !item.overtime).reduce((sum, item) => sum + item.minutes, 0),
    overtime: adjustments.filter(item => item.overtime).reduce((sum, item) => sum + item.minutes, 0),
  };
  const regular = inside.reduce((sum, line) => sum + line.regular, 0) + adjusted.regular;
  const overtime = inside.reduce((sum, line) => sum + line.overtime, 0) + adjusted.overtime;
  const byHome = new Map<string, { home: string; minutes: number }>();
  for (const line of inside) {
    const key = line.homeId ?? "none";
    const entry = byHome.get(key) ?? { home: line.home ?? "No home", minutes: 0 };
    entry.minutes += line.minutes;
    byHome.set(key, entry);
  }
  return {
    lines: inside,
    // Every line in the workweeks given, for working out the regular rate behind overtime pay.
    allLines: lines,
    totals: {
      regular,
      overtime,
      total: regular + overtime,
      holiday: inside.filter(line => line.holiday).reduce((sum, line) => sum + line.minutes, 0),
      adjustments: adjusted.regular + adjusted.overtime,
      open: inside.filter(line => line.open).length,
      punches: inside.length,
    },
    byHome: [...byHome.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

export type SheetTotals = ReturnType<typeof timesheet>["totals"];

/* Hours to two decimals, as payroll systems expect. */
export const hours = (minutes: number) => (Math.round((minutes / 60) * 100) / 100).toFixed(2);

/* One CSV cell, quoted when it needs to be, and safe from spreadsheet formulas. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const EXPORT_COLUMNS = {
  employee_number: "Employee number",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  period_start: "Period start",
  period_end: "Period end",
  regular_hours: "Regular hours",
  overtime_hours: "Overtime hours",
  total_hours: "Total hours",
  holiday_hours: "Holiday hours worked",
  adjustment_hours: "Adjustment hours",
  time_off_hours: "Paid time off hours",
  hourly_rate: "Hourly rate",
  gross_pay: "Gross pay (estimate)",
  status: "Timesheet status",
} as const;
export type ExportColumn = keyof typeof EXPORT_COLUMNS;
