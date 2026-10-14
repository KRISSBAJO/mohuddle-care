/*
 * How often a plan goal has been worked on against how often the plan says: "documented 1 of 3
 * this week". Periods follow the calendar, as plans are written: today, this week (Monday to
 * Sunday) or this month.
 */

import { weekStart } from "./format";

export type GoalPeriod = "day" | "week" | "month";

/* The first day of the period that contains a day. */
export function periodStart(period: GoalPeriod, day: string): string {
  if (period === "day") return day;
  if (period === "week") return weekStart(day);
  return `${day.slice(0, 8)}01`;
}

export const periodWord = { day: "today", week: "this week", month: "this month" } as const;

/* Days the goal was worked on in the current period, from the days of earlier notes that say so. */
export function documentedCount(workedDays: string[], period: GoalPeriod, today: string): number {
  const start = periodStart(period, today);
  return workedDays.filter(day => day >= start && day <= today).length;
}

export type GoalProgress = { count: number; target: number | null; period: GoalPeriod; met: boolean; label: string };

/* Plain words for the goal card: "Documented 1 of 3 this week" or, without a target, "Worked on 2 times this week". */
export function goalProgress(workedDays: string[], target: number | null, period: GoalPeriod | null, today: string): GoalProgress {
  const span = period ?? "week";
  const count = documentedCount(workedDays, span, today);
  if (!target) return { count, target: null, period: span, met: false, label: `Worked on ${count} ${count === 1 ? "time" : "times"} ${periodWord[span]}` };
  return { count, target, period: span, met: count >= target, label: `Documented ${count} of ${target} ${periodWord[span]}` };
}

/* The earliest day any of these goals' periods begins, for one query that covers them all. */
export function earliestStart(periods: (GoalPeriod | null)[], today: string): string {
  return periods.map(period => periodStart(period ?? "week", today)).reduce((min, day) => (day < min ? day : min), today);
}
