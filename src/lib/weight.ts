/*
 * The weight chart: BMI from weight and height, whether a weight is inside the suggested range,
 * and whether it changed fast. No database access, so the rules can be tested on their own.
 */

import { addDays } from "./format";

/* Body Mass Index from pounds and inches, to one decimal place. Null without a height. */
export function bmi(pounds: number, inches: number | null | undefined): number | null {
  if (!inches || inches <= 0) return null;
  return Math.round(((703 * pounds) / (inches * inches)) * 10) / 10;
}

/* The CDC adult bands. */
export function bmiBand(value: number): { word: string; tone: "good" | "warn" | "bad" } {
  if (value < 18.5) return { word: "Underweight", tone: "warn" };
  if (value < 25) return { word: "Healthy weight", tone: "good" };
  if (value < 30) return { word: "Overweight", tone: "warn" };
  return { word: "Obesity", tone: "bad" };
}

/* "Below range", "Above range" or null when inside it or no range is set. */
export function rangeCheck(pounds: number, low: number | null, high: number | null): "below" | "above" | null {
  if (low !== null && pounds < low) return "below";
  if (high !== null && pounds > high) return "above";
  return null;
}

export type Weighing = { day: string; pounds: number };

/*
 * The change from the earliest weighing in the period up to the newest one, when it is at least the
 * threshold percent either way. Null when it is smaller or there is nothing to compare.
 */
export function fastChange(weighings: Weighing[], days: number, percent: number): { from: Weighing; to: Weighing; percent: number } | null {
  if (weighings.length < 2) return null;
  const sorted = [...weighings].sort((a, b) => a.day.localeCompare(b.day));
  const to = sorted[sorted.length - 1];
  const start = addDays(to.day, -days);
  const from = sorted.find(item => item.day >= start && item !== to);
  if (!from || from.day === to.day) return null;
  const change = Math.round(((to.pounds - from.pounds) / from.pounds) * 1000) / 10;
  return Math.abs(change) >= percent ? { from, to, percent: change } : null;
}

/* "5 ft 11 in". */
export function feetAndInches(inches: number): string {
  const whole = Math.round(inches);
  return `${Math.floor(whole / 12)} ft ${whole % 12} in`;
}
