"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Ban, CheckCircle2, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { label } from "@/lib/format";
import {
  clockOf,
  describeTime,
  formatHours,
  isoWeekday,
  rankCandidates,
  shiftDay,
  windowFor,
  type SchedHome,
  type SchedShift,
  type SchedStaff,
  type ScheduleRules,
} from "@/lib/schedule";
import { changeShiftStatus, deleteShift, saveShift } from "@/server/actions/schedule";

export type EditorTarget = { shiftId: string } | { homeId: string; day: string; patternId: string | null };

type Props = {
  target: EditorTarget;
  shifts: SchedShift[];
  homes: SchedHome[];
  staff: SchedStaff[];
  names: Map<string, string>;
  rules: ScheduleRules;
  week: { from: string; to: string };
  manager: boolean;
  myStaffId: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

const FINAL = new Set(["completed", "missed"]);

export function ShiftEditor({ target, shifts, homes, staff, names, rules, week, manager, myStaffId, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const existing = "shiftId" in target ? shifts.find(shift => shift.id === target.shiftId) ?? null : null;
  const initialDay = existing ? shiftDay(existing) : "day" in target ? target.day : week.from;
  // A new shift starts from the pattern asked for, or the first pattern that runs that weekday.
  const initialPattern =
    existing?.patternId ?? ("patternId" in target && target.patternId ? target.patternId : rules.patterns.find(pattern => pattern.weekdays.includes(isoWeekday(initialDay)))?.id ?? null);
  const startPattern = rules.patterns.find(pattern => pattern.id === initialPattern);
  const [homeId, setHomeId] = useState(existing?.homeId ?? ("homeId" in target ? target.homeId : homes[0]?.id ?? ""));
  const [day, setDay] = useState(initialDay);
  const [patternId, setPatternId] = useState<string | null>(existing ? existing.patternId : startPattern?.id ?? null);
  const [start, setStart] = useState(existing ? clockOf(existing.startsAt) : startPattern?.start ?? "09:00");
  const [end, setEnd] = useState(existing ? clockOf(existing.endsAt) : startPattern?.end ?? "17:00");
  const pattern = rules.patterns.find(option => option.id === patternId) ?? null;
  const weekday = isoWeekday(day);
  const [staffId, setStaffId] = useState<string | null>(existing?.staffId ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const closed = () => onClose();
    element?.addEventListener("close", closed);
    return () => element?.removeEventListener("close", closed);
  }, [onClose]);

  const final = existing ? FINAL.has(existing.status) : false;
  const editable = manager && !final;
  const slot = start && end && start !== end ? windowFor(day, `${start}-${end}`) : null;
  const length = slot ? (Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 3_600_000 : 0;

  const candidates = useMemo(() => {
    if (!slot) return [];
    const draft = { id: existing?.id ?? "draft", homeId, ...slot };
    const ranked = rankCandidates(draft, staff, shifts, rules, week);
    const term = query.trim().toLowerCase();
    return term ? ranked.filter(c => `${c.person.firstName} ${c.person.lastName}`.toLowerCase().includes(term)) : ranked;
  }, [slot?.startsAt, slot?.endsAt, homeId, staff, shifts, rules, week, query, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = staffId ? candidates.find(c => c.person.id === staffId) ?? null : null;

  function run(work: () => Promise<{ error?: string }>, message: string) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error) setError(result.error);
      else {
        onDone(message);
        dialog.current?.close();
      }
    });
  }

  const save = () => {
    if (!slot) return setError("Choose a start and end time.");
    if (chosen?.check.blocked) return setError(`${chosen.person.firstName} cannot take this shift. ${chosen.check.blocked}.`);
    run(() => saveShift({ id: existing?.id, homeId, day, start, end, patternId, staffId, note }), existing ? "Shift saved" : "Shift added");
  };

  const homeName = homes.find(home => home.id === (existing?.homeId ?? homeId))?.name ?? "Closed home";
  const isMine = existing?.staffId != null && existing.staffId === myStaffId;

  return (
    <dialog
      ref={dialog}
      className="hub-dialog"
      style={{ width: "min(760px, calc(100vw - 32px))" }}
      aria-labelledby="shift-editor-title"
      onClick={event => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="hub-dialog-body">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id="shift-editor-title" className="text-lg font-bold">
              {existing ? `${homeName} · ${rules.patterns.find(option => option.id === existing.patternId)?.name ?? `${label("shiftKind", existing.kind)} shift`}` : "Add a shift"}
            </h2>
            <p className="mt-1 text-xs text-mute">
              {existing ? `${describeTime(existing)} · ${label("shiftStatus", existing.status)}` : "Pick a shift pattern, or set custom times for a one-off."}
            </p>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="Close" onClick={() => dialog.current?.close()}>
            <X className="h-4 w-4" />
          </button>
        </header>

        {!editable ? (
          <div className="space-y-4 px-6 py-5 text-sm">
            {final && <p className="rounded-xl bg-panel px-3.5 py-2.5 text-mute">This shift is {existing?.status}. It is part of the record and cannot be changed.</p>}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="label">Home</dt><dd>{homeName}</dd></div>
              <div><dt className="label">When</dt><dd>{existing ? describeTime(existing) : ""}</dd></div>
              <div><dt className="label">Staff</dt><dd>{existing?.staffId ? names.get(existing.staffId) ?? "Former staff" : "Open"}</dd></div>
              <div><dt className="label">Note</dt><dd>{existing?.note || "—"}</dd></div>
            </dl>
            {error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 font-medium text-flag" role="alert">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              {isMine && existing?.status === "scheduled" && (
                <button type="button" disabled={pending} className="btn-brand btn-sm" onClick={() => run(() => changeShiftStatus(existing.id, "confirmed"), "Shift confirmed")}>
                  <CheckCircle2 className="h-4 w-4" /> Confirm I&apos;m on
                </button>
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={() => dialog.current?.close()}>Close</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
            <div className="space-y-4 border-b border-line px-6 py-5 md:border-b-0 md:border-r">
              <div>
                <label htmlFor="se-home" className="label">Home</label>
                <select id="se-home" className="field" value={homeId} onChange={event => setHomeId(event.target.value)}>
                  {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="se-day" className="label">Date</label>
                  <input id="se-day" type="date" className="field" value={day} onChange={event => event.target.value && setDay(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="se-kind" className="label">Shift pattern</label>
                  <select
                    id="se-kind"
                    className="field"
                    value={patternId ?? ""}
                    onChange={event => {
                      const next = rules.patterns.find(option => option.id === event.target.value) ?? null;
                      setPatternId(next?.id ?? null);
                      if (next) {
                        setStart(next.start);
                        setEnd(next.end);
                      }
                    }}
                  >
                    <optgroup label="Runs on this day">
                      {rules.patterns.filter(option => option.weekdays.includes(weekday)).map(option => <option key={option.id} value={option.id}>{option.name} · {option.start}–{option.end}</option>)}
                    </optgroup>
                    {rules.patterns.some(option => !option.weekdays.includes(weekday)) && (
                      <optgroup label="Other days">
                        {rules.patterns.filter(option => !option.weekdays.includes(weekday)).map(option => <option key={option.id} value={option.id}>{option.name} · {option.start}–{option.end}</option>)}
                      </optgroup>
                    )}
                    <option value="">Custom times</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="se-start" className="label">Starts</label>
                  <input id="se-start" type="time" step={900} className="field" value={start} onChange={event => setStart(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="se-end" className="label">Ends</label>
                  <input id="se-end" type="time" step={900} className="field" value={end} onChange={event => setEnd(event.target.value)} />
                </div>
              </div>
              <p className="text-xs text-mute">
                {slot ? `${formatHours(length)} shift${end <= start ? ", ending the next morning" : ""}.` : "Choose a start and end time."}
                {length > 16 && <span className="font-semibold text-flag"> Shifts can be at most 16 hours.</span>}
                {pattern && (start !== pattern.start || end !== pattern.end) && <span> Times differ from {pattern.name}; it stays labelled as that pattern.</span>}
                {pattern && !pattern.weekdays.includes(weekday) && <span className="text-[#8a5a10]"> {pattern.name} does not normally run on this day.</span>}
              </p>
              <div>
                <label htmlFor="se-note" className="label">Note</label>
                <input id="se-note" className="field" maxLength={300} value={note} placeholder="Optional, for example covering a doctor's visit" onChange={event => setNote(event.target.value)} />
              </div>
              {existing && existing.staffId && (
                <div>
                  <p className="label">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {existing.status === "scheduled" && (
                      <button type="button" disabled={pending} className="btn-ghost btn-sm" onClick={() => run(() => changeShiftStatus(existing.id, "confirmed"), "Shift confirmed")}>
                        <CheckCircle2 className="h-4 w-4 text-sage" /> Confirmed
                      </button>
                    )}
                    <button type="button" disabled={pending} className="btn-ghost btn-sm" onClick={() => run(() => changeShiftStatus(existing.id, "completed"), "Shift marked worked")}>
                      <CheckCircle2 className="h-4 w-4 text-brand" /> Worked
                    </button>
                    <button type="button" disabled={pending} className="btn-ghost btn-sm" onClick={() => run(() => changeShiftStatus(existing.id, "missed"), "Shift marked missed")}>
                      <Ban className="h-4 w-4 text-flag" /> Missed
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex min-h-[320px] flex-col px-6 py-5">
              <div className="flex items-center justify-between">
                <p className="label mb-0">Who works it</p>
                <span className="text-[11px] text-mute">Best fit first</span>
              </div>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" aria-hidden="true" />
                <input className="field py-2 pl-9 text-sm" placeholder="Find a person" value={query} onChange={event => setQuery(event.target.value)} aria-label="Find a person" />
              </div>
              <ul className="mt-2 max-h-[340px] flex-1 space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Staff">
                <li>
                  <button type="button" role="option" aria-selected={staffId === null} onClick={() => setStaffId(null)} className={cn("w-full rounded-xl border px-3 py-2 text-left text-sm", staffId === null ? "border-flag/50 bg-flag-soft/60" : "border-line hover:bg-panel")}>
                    <span className="font-semibold">Leave open</span>
                    <span className="block text-xs text-mute">Shows as a gap until someone takes it</span>
                  </button>
                </li>
                {candidates.map(({ person, check, sameHome }) => {
                  const selected = staffId === person.id;
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-disabled={Boolean(check.blocked)}
                        onClick={() => !check.blocked && setStaffId(person.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
                          selected ? "border-brand bg-sky/60" : "border-line hover:bg-panel",
                          check.blocked && "cursor-not-allowed opacity-50 hover:bg-transparent",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{person.firstName} {person.lastName}</span>
                          <span className="text-xs text-mute">{formatHours(check.hoursAfter)} this week</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-mute">{label("staffRole", person.role)}</span>
                          {sameHome && <span className="chip bg-sage-soft px-1.5 py-0 text-sage">Based here</span>}
                          {check.blocked && <span className="chip bg-panel px-1.5 py-0 text-mute">{check.blocked}</span>}
                          {!check.blocked && check.warnings.map(warning => (
                            <span key={warning} className="chip bg-accent-soft px-1.5 py-0 text-[#8a5a10]">
                              <AlertTriangle className="h-3 w-3" /> {warning}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {candidates.length === 0 && <li className="px-3 py-6 text-center text-xs text-mute">No one matches.</li>}
              </ul>
            </div>
          </div>
        )}

        {editable && (
          <footer className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {existing && (
                <button
                  type="button"
                  disabled={pending}
                  className="btn-ghost btn-sm text-flag hover:bg-flag-soft"
                  onClick={() => {
                    if (globalThis.confirm("Delete this shift? It is removed from the schedule.")) run(() => deleteShift(existing.id), "Shift deleted");
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {error && <p className="text-sm font-medium text-flag" role="alert">{error}</p>}
              {chosen && chosen.check.warnings.length > 0 && !error && <p className="text-xs text-[#8a5a10]">Saving anyway is allowed. The warning stays on the schedule.</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => dialog.current?.close()}>Cancel</button>
                <button type="button" disabled={pending || !slot || length > 16} className="btn-brand btn-sm disabled:opacity-60" onClick={save}>
                  {pending ? "Saving…" : existing ? "Save shift" : "Add shift"}
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    </dialog>
  );
}

