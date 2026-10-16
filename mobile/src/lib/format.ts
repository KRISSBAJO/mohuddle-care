/* Dates and times in the agency's own time zone, the way the website shows them. */
const formatter = (zone: string | undefined, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: zone, ...options });

export const fmt = {
  time: (at: string | Date, zone?: string) => formatter(zone, { hour: "numeric", minute: "2-digit" }).format(new Date(at)),
  dayLong: (at: string | Date, zone?: string) => formatter(zone, { weekday: "long", month: "short", day: "numeric" }).format(new Date(at)),
  dayShort: (at: string | Date, zone?: string) => formatter(zone, { weekday: "short", month: "short", day: "numeric" }).format(new Date(at)),
  hour: (at: Date, zone?: string) => Number(formatter(zone, { hour: "numeric", hourCycle: "h23" }).format(at)),
};

/* "2 h 14 min" since a moment. */
export function duration(fromIso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/* Minutes as hours, the way timesheets show them: "8 h", "7.5 h". */
export const hoursText = (minutes: number) => `${Number((minutes / 60).toFixed(2))} h`;

/* The time when it is today, "Thu 3:00 PM" within the last week, otherwise "Oct 2, 8:00 AM". */
export function whenText(at: string, zone?: string, now = Date.now()) {
  const day = (value: string | number) => formatter(zone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  if (day(at) === day(now)) return fmt.time(at, zone);
  const recent = Math.abs(now - new Date(at).getTime()) < 6 * 86_400_000;
  return recent ? `${formatter(zone, { weekday: "short" }).format(new Date(at))} ${fmt.time(at, zone)}` : `${formatter(zone, { month: "short", day: "numeric" }).format(new Date(at))}, ${fmt.time(at, zone)}`;
}

/* "Oct 30", or "Oct 30 – Oct 31", for days given as 2026-10-30. */
export function daysText(start: string, end: string) {
  const day = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00Z`));
  return start === end ? day(start) : `${day(start)} – ${day(end)}`;
}
