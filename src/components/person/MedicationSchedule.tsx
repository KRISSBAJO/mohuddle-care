"use client";

import { useState } from "react";
import { Field } from "@/components/app/ui";

type Initial = { asNeeded?: boolean; times?: string[]; prnUse?: string; prnMinHours?: number | null; prnMaxPerDay?: number | null };

/* When a medicine is given: at set times, or as needed with when to use it and its limits. */
export function MedicationSchedule({ id, initial = {} }: { id: string; initial?: Initial }) {
  const [asNeeded, setAsNeeded] = useState(Boolean(initial.asNeeded));
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="asNeeded" checked={asNeeded} onChange={event => setAsNeeded(event.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-semibold">Given as needed (PRN)</span> <span className="text-mute">No set times. Staff give it when it is needed, with a reason, and record how it worked.</span>
        </span>
      </label>
      {asNeeded ? (
        <>
          <Field label="When to give it" htmlFor={`${id}-use`}>
            <input id={`${id}-use`} name="prnUse" required minLength={3} maxLength={200} className="field" defaultValue={initial.prnUse ?? ""} placeholder="For pain over 4 out of 10" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="At least this many hours apart" htmlFor={`${id}-hours`} hint="Leave empty for no limit">
              <input id={`${id}-hours`} name="prnMinHours" type="number" min={1} max={72} className="field" defaultValue={initial.prnMinHours ?? ""} placeholder="4" />
            </Field>
            <Field label="Most doses in 24 hours" htmlFor={`${id}-max`} hint="Leave empty for no limit">
              <input id={`${id}-max`} name="prnMaxPerDay" type="number" min={1} max={24} className="field" defaultValue={initial.prnMaxPerDay ?? ""} placeholder="4" />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Times" htmlFor={`${id}-times`} hint="24-hour, separated by commas">
          <input id={`${id}-times`} name="times" required className="field" defaultValue={initial.times?.join(", ") ?? ""} placeholder="08:00, 20:00" />
        </Field>
      )}
    </div>
  );
}
