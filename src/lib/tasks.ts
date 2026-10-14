/* When a task is due, in words people use: overdue, today, tomorrow, this week, later. Pure and tested. */

export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export const BUCKETS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next 7 days",
  later: "Later",
  none: "No due date",
};

export function dueBucket(dueAt: Date | null, now: number, dayOf: (at: Date) => string): DueBucket {
  if (!dueAt) return "none";
  if (dueAt.getTime() < now) return "overdue";
  const today = dayOf(new Date(now));
  const day = dayOf(dueAt);
  if (day === today) return "today";
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return "tomorrow";
  return diff <= 7 ? "week" : "later";
}

/* "in 3 hours", "2 days overdue", "in 5 days". */
export function relativeDue(dueAt: Date, now: number) {
  const minutes = Math.round((dueAt.getTime() - now) / 60_000);
  const late = minutes < 0;
  const size = Math.abs(minutes);
  const text = size < 60 ? `${Math.max(1, size)} min` : size < 60 * 24 ? `${Math.round(size / 60)} h` : `${Math.round(size / 1440)} ${Math.round(size / 1440) === 1 ? "day" : "days"}`;
  return late ? `${text} overdue` : `in ${text}`;
}
