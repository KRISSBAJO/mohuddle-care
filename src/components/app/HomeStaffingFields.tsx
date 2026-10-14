const KINDS = [
  ["day", "Day"],
  ["evening", "Evening"],
  ["overnight", "Overnight"],
] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/*
 * What a home needs on the schedule. The schedule reports a coverage gap only for these shifts on
 * these days, so a host family home or a weekday program is not flagged for shifts it never has.
 */
export function HomeStaffingFields({ staffedKinds = ["day", "evening", "overnight"], openDays = [1, 2, 3, 4, 5, 6, 7], prefix = "home" }: { staffedKinds?: string[]; openDays?: number[]; prefix?: string }) {
  const box =
    "flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="staffingFields" value="1" />
      <fieldset>
        <legend className="label">Shifts that must always be staffed</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([value, text]) => (
            <label key={value} className={box}>
              <input type="checkbox" name="staffedKinds" value={value} defaultChecked={staffedKinds.includes(value)} className="h-4 w-4 accent-[#1b6fa8]" id={`${prefix}-kind-${value}`} />
              {text}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-mute">Leave all empty for a host family or drop-in support.</p>
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
