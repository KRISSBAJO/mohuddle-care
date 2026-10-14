import Link from "next/link";
import type { ShiftPattern } from "@/lib/schedule";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const runs = (weekdays: number[]) =>
  weekdays.length === 7 ? "every day" : weekdays.join() === "1,2,3,4,5" ? "weekdays" : weekdays.join() === "6,7" ? "weekends" : weekdays.map(day => DAYS[day - 1]).join(", ");

/*
 * What a home needs on the schedule. The schedule reports a coverage gap only for these patterns on
 * these days, so a host family home or a weekday program is not flagged for shifts it never has.
 */
export function HomeStaffingFields({
  patterns,
  staffedPatterns = null,
  openDays = [1, 2, 3, 4, 5, 6, 7],
  prefix = "home",
}: {
  patterns: ShiftPattern[];
  staffedPatterns?: string[] | null;
  openDays?: number[];
  prefix?: string;
}) {
  const box = "flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="staffingFields" value="1" />
      <fieldset>
        <legend className="label">Shift patterns that must always be staffed</legend>
        <div className="grid gap-2">
          {patterns.map(pattern => (
            <label key={pattern.id} className={box}>
              <input
                type="checkbox"
                name="staffedPatterns"
                value={pattern.id}
                defaultChecked={staffedPatterns === null || staffedPatterns.includes(pattern.id)}
                className="h-4 w-4 accent-[#1b6fa8]"
                id={`${prefix}-pattern-${pattern.id}`}
              />
              <span>
                {pattern.name} <span className="text-xs text-mute">{pattern.start}–{pattern.end}, {runs(pattern.weekdays)}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-mute">
          Tick all for a home staffed around the clock; new patterns are then included too. Leave all empty for a host family or drop-in support.{" "}
          <Link href="/app/settings/shifts" className="font-semibold text-brand">Edit shift patterns</Link>
        </p>
      </fieldset>
      <fieldset>
        <legend className="label">Days it runs</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((text, index) => (
            <label key={text} className={box + " px-2.5"}>
              <input type="checkbox" name="openDays" value={index + 1} defaultChecked={openDays.includes(index + 1)} className="h-4 w-4 accent-[#1b6fa8]" id={`${prefix}-day-${index + 1}`} />
              {text}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
