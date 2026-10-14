"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { compactRange, patternHours, requiredPatterns, weekdayLabel, windowFor, type SchedHome, type SchedShift, type SchedStaff, type ScheduleRules } from "@/lib/schedule";
import { bulkCreateShifts } from "@/server/actions/schedule";
import { SearchSelect } from "@/components/app/SearchSelect";

type Props = {
  homes: SchedHome[];
  staff: SchedStaff[];
  shifts: SchedShift[];
  days: string[];
  today: string;
  rules: ScheduleRules;
  onClose: () => void;
  onDone: (message: string) => void;
};

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* Adds shifts from the shift patterns for many homes and days at once, skipping ones that already exist. */
export function BulkAddDialog({ homes, staff, shifts, days, today, rules, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [homeIds, setHomeIds] = useState<string[]>(homes.map(home => home.id));
  const [chosenDays, setChosenDays] = useState<string[]>(days.filter(day => day >= today));
  const [patternIds, setPatternIds] = useState<string[]>(rules.patterns.map(pattern => pattern.id));
  const [staffId, setStaffId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const closed = () => onClose();
    element?.addEventListener("close", closed);
    return () => element?.removeEventListener("close", closed);
  }, [onClose]);

  // The same preview the server will apply: patterns that run that weekday and that the home needs, minus ones already there.
  const preview = useMemo(() => {
    const existing = new Set(shifts.map(shift => `${shift.homeId}|${Date.parse(shift.startsAt)}|${Date.parse(shift.endsAt)}`));
    const chosen = rules.patterns.filter(pattern => patternIds.includes(pattern.id));
    let add = 0;
    let skip = 0;
    for (const home of homes.filter(h => homeIds.includes(h.id))) {
      for (const day of chosenDays) {
        for (const pattern of requiredPatterns(home, day, chosen)) {
          const { startsAt, endsAt } = windowFor(day, patternHours(pattern));
          if (existing.has(`${home.id}|${Date.parse(startsAt)}|${Date.parse(endsAt)}`)) skip++;
          else add++;
        }
      }
    }
    return { add, skip };
  }, [homes, homeIds, chosenDays, patternIds, shifts, rules]);

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await bulkCreateShifts({ homeIds, days: chosenDays, patternIds, staffId: staffId || null });
      if (result.error) return setError(result.error);
      const parts = [`Added ${result.created} ${result.created === 1 ? "shift" : "shifts"}`];
      if (result.skipped) parts.push(`${result.skipped} already existed`);
      if (result.unassigned) parts.push(`${result.unassigned} left open where they were busy`);
      onDone(parts.join(". "));
      dialog.current?.close();
    });
  };

  const box = "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50";

  return (
    <dialog
      ref={dialog}
      className="hub-dialog"
      aria-labelledby="bulk-title"
      onClick={event => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="hub-dialog-body">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id="bulk-title" className="text-lg font-bold">Add shifts</h2>
            <p className="mt-1 text-xs text-mute">Shift patterns from Settings, on the days each one runs. Shifts that already exist are skipped, so this is safe to run twice.</p>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="Close" onClick={() => dialog.current?.close()}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-5 px-6 py-5">
          <fieldset>
            <legend className="label flex w-full items-center justify-between">
              Homes
              <button type="button" className="text-[11px] font-semibold normal-case tracking-normal text-brand" onClick={() => setHomeIds(homeIds.length === homes.length ? [] : homes.map(h => h.id))}>
                {homeIds.length === homes.length ? "None" : "All"}
              </button>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {homes.map(home => (
                <label key={home.id} className={box}>
                  <input type="checkbox" className="h-4 w-4 accent-[#1b6fa8]" checked={homeIds.includes(home.id)} onChange={() => setHomeIds(toggle(homeIds, home.id))} />
                  {home.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label flex w-full items-center justify-between">
              Days
              <button type="button" className="text-[11px] font-semibold normal-case tracking-normal text-brand" onClick={() => setChosenDays(chosenDays.length === days.length ? [] : days)}>
                {chosenDays.length === days.length ? "None" : "Whole week"}
              </button>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {days.map(day => (
                <label key={day} className={cn(box, day < today && "opacity-60")}>
                  <input type="checkbox" className="h-4 w-4 accent-[#1b6fa8]" checked={chosenDays.includes(day)} onChange={() => setChosenDays(toggle(chosenDays, day))} />
                  {weekdayLabel(day)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="label">Shift patterns</legend>
              <div className="grid gap-2">
                {rules.patterns.map(pattern => (
                  <label key={pattern.id} className={box}>
                    <input type="checkbox" className="h-4 w-4 accent-[#1b6fa8]" checked={patternIds.includes(pattern.id)} onChange={() => setPatternIds(toggle(patternIds, pattern.id))} />
                    <span className="min-w-0">
                      {pattern.name}
                      <span className="block text-xs text-mute">
                        {compactRange(windowFor("2026-01-05", patternHours(pattern)))} · {pattern.weekdays.length === 7 ? "every day" : pattern.weekdays.map(day => WEEKDAY[day - 1]).join(", ")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-mute">Each home only gets the patterns and days it needs, as set on its Details tab under Homes.</p>
            </fieldset>
            <div>
              <label htmlFor="bulk-staff" className="label">Give them to</label>
              <SearchSelect id="bulk-staff" name="bulkStaff" defaultValue={staffId} emptyLabel="Nobody yet (leave open)" placeholder="Search staff" onChange={setStaffId} options={staff.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))} />
              <p className="mt-2 text-[11px] text-mute">Where they are already working, the shift is added open instead.</p>
            </div>
          </div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold">{preview.add} new {preview.add === 1 ? "shift" : "shifts"}</span>
            {preview.skip > 0 && <span className="text-mute"> · {preview.skip} already there</span>}
          </p>
          <div className="flex items-center gap-2">
            {error && <p className="text-sm font-medium text-flag" role="alert">{error}</p>}
            <button type="button" className="btn-ghost btn-sm" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" disabled={pending || preview.add === 0} className="btn-brand btn-sm disabled:opacity-60" onClick={submit}>
              {pending ? "Adding…" : `Add ${preview.add}`}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
