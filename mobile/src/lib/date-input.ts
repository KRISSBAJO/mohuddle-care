export const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
export function calendarDays(month: string): (string | null)[] {
  const first = new Date(`${month}-01T12:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const empty = (first.getUTCDay() + 6) % 7;
  return [...Array.from({ length: empty }, () => null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
}
export function moveMonth(month: string, step: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 7);
}
export function parseClock(clock: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}
export const clockValue = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
