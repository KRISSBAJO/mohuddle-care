/*
 * Pure helpers for browsing daily notes by home, person and day. A "day" is a date key in the agency's time zone (YYYY-MM-DD).
 */

import { addDays } from "./format";

/* Every day from one date to another, inclusive. Empty when the range is backwards. Capped to keep pages fast. */
export function dayList(from: string, to: string, max = 400): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < max; day = addDays(day, 1)) days.push(day);
  return days;
}

export type Coverage = "none" | "complete" | "partial" | "missing" | "upcoming";

/*
 * How well a day is documented. "none" means no shift was worked so nothing was owed; "upcoming"
 * means shifts are still running or notes are not yet due.
 */
export function coverage(expected: number, written: number, stillOpen = false): Coverage {
  if (expected === 0) return written > 0 ? "complete" : "none";
  if (written >= expected) return "complete";
  if (stillOpen) return "upcoming";
  return written === 0 ? "missing" : "partial";
}

/* A share as a whole percentage, or null when nothing was expected. */
export function percent(written: number, expected: number): number | null {
  if (expected <= 0) return null;
  return Math.min(100, Math.round((written / expected) * 100));
}

/* Notes that need a second look: a hard mood, a seizure or a behaviour of concern. */
export function isConcern(log: { mood: string; seizure?: boolean | null; behaviourOccurred?: boolean | null }) {
  return log.mood === "low" || log.mood === "distressed" || Boolean(log.seizure) || Boolean(log.behaviourOccurred);
}

/* Splits a list into one page, clamping the page number to what exists. */
export function paginate<T>(rows: T[], page: number, per: number) {
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((current - 1) * per, current * per), page: current, pages, total: rows.length };
}
