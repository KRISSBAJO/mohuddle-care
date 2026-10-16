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
