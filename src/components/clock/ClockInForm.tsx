"use client";

import { startTransition, useActionState, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Loader2, LocateFixed, MapPin, RefreshCw, ScrollText, ShieldCheck } from "lucide-react";
import { HandoverCard, type HandoverView } from "@/components/clock/HandoverCard";
import { usePosition } from "@/components/clock/usePosition";
import { cn } from "@/lib/cn";
import { locationVerdict } from "@/lib/timeclock";
import type { FormState } from "@/server/actions/auth";

type Shift = { id: string; homeId: string; home: string; pattern: string | null; startsAt: string; endsAt: string };
type Home = { id: string; name: string; latitude: number | null; longitude: number | null };

const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", month: "short", day: "numeric" }).format(new Date(iso));

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-3 text-base font-bold">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", done ? "bg-sage text-white" : "bg-panel text-mute")}>{done ? <Check className="h-4 w-4" /> : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/*
 * Clocking in, top to bottom: the shift, where you are, the last handover, and the statements.
 * The button stays off until each required part is done; the server checks it all again.
 */
export function ClockInForm({
  action,
  shift,
  upcoming,
  earlyMinutes,
  homes,
  handovers,
  statements,
  requirements,
  radius,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  shift: Shift | null;
  upcoming: Shift | null;
  earlyMinutes: number;
  homes: Home[];
  handovers: (HandoverView & { id: string; homeId: string })[];
  statements: string[];
  requirements: string[];
  radius: number;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [unscheduled, setUnscheduled] = useState(!shift);
  const [homeId, setHomeId] = useState(shift?.homeId ?? "");
  const [reason, setReason] = useState("");
  const [read, setRead] = useState<string[]>([]);
  const [ticked, setTicked] = useState<string[]>([]);
  const needLocation = requirements.includes("location");
  const needHandover = requirements.includes("handover");
  const needStatements = requirements.includes("statements");
  const location = usePosition(needLocation);

  const useShift = Boolean(shift) && !unscheduled;
  const chosenHome = useShift ? shift!.homeId : homeId;
  const home = homes.find(item => item.id === chosenHome) ?? null;
  const verdict = locationVerdict(home, location.position, radius, needLocation);
  const awayOrUnknown = needLocation && Boolean(home) && (verdict.state === "outside" || (location.status !== "asking" && verdict.state === "unavailable"));
  const toRead = needHandover ? handovers.filter(item => item.homeId === chosenHome) : [];
  const reasonNeeded = !useShift || awayOrUnknown;

  const shiftDone = useShift || Boolean(homeId);
  const locationDone = !needLocation || verdict.state === "ok" || verdict.state === "home_not_set" || (awayOrUnknown && reason.trim().length >= 5);
  const handoverDone = toRead.every(item => read.includes(item.id));
  const statementsDone = !needStatements || statements.every(statement => ticked.includes(statement));
  const reasonDone = !reasonNeeded || reason.trim().length >= 5;
  const ready = shiftDone && locationDone && handoverDone && statementsDone && reasonDone && (!needLocation || location.status !== "asking");

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData();
        data.set(
          "payload",
          JSON.stringify({
            shiftId: useShift ? shift!.id : null,
            homeId: useShift ? null : homeId,
            position: location.position,
            reason: reason.trim(),
            statements: needStatements ? ticked : [],
            handoversRead: read,
          }),
        );
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
      <Step n={1} title="Your shift" done={shiftDone}>
        {shift ? (
          <div className={cn("rounded-xl border p-4", useShift ? "border-brand bg-sky/40" : "border-line")}>
            <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-brand" /> {shift.pattern ?? "Scheduled shift"} at {shift.home}</p>
            <p className="mt-1 text-sm text-mute">{day(shift.startsAt)} · {time(shift.startsAt)} to {time(shift.endsAt)}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-panel/50 p-4 text-sm">
            <p className="font-semibold">No shift to clock in to right now.</p>
            <p className="mt-1 text-mute">
              {upcoming
                ? `Your next shift is ${upcoming.pattern ?? "a shift"} at ${upcoming.home}, ${day(upcoming.startsAt)} at ${time(upcoming.startsAt)}. You can clock in from ${time(new Date(new Date(upcoming.startsAt).getTime() - earlyMinutes * 60_000).toISOString())}.`
                : "You have no shift in the next day and a half."}{" "}
              If you were asked to work, clock in below and say why. A manager will approve it.
            </p>
          </div>
        )}
        {shift && (
          <label className="mt-3 flex items-center gap-2 text-sm text-mute">
            <input type="checkbox" checked={unscheduled} onChange={event => setUnscheduled(event.target.checked)} /> I am working somewhere else or a different shift
          </label>
        )}
        {!useShift && (
          <div className="mt-3">
            <label htmlFor="clock-home" className="label">Home you are working at</label>
            <select id="clock-home" className="field" value={homeId} onChange={event => { setHomeId(event.target.value); setRead([]); }}>
              <option value="">Choose</option>
              {homes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        )}
      </Step>

      {needLocation && (
        <Step n={2} title="Where you are" done={locationDone}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {location.status === "asking" ? (
              <span className="flex items-center gap-2 text-mute"><Loader2 className="h-4 w-4 animate-spin" /> Finding your location…</span>
            ) : !home ? (
              <span className="text-mute">Choose the home first.</span>
            ) : verdict.state === "ok" ? (
              <span className="flex items-center gap-2 font-semibold text-sage"><MapPin className="h-4 w-4" /> At {home.name}{verdict.distance !== null ? ` (about ${verdict.distance} m)` : ""}</span>
            ) : verdict.state === "home_not_set" ? (
              <span className="flex items-center gap-2 text-mute"><MapPin className="h-4 w-4" /> Location recorded. {home.name} has no map location set yet, so distance is not checked.</span>
            ) : verdict.state === "outside" ? (
              <span className="flex items-center gap-2 font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> About {verdict.distance} m from {home.name}. Staff must be within {radius} m.</span>
            ) : (
              <span className="flex items-center gap-2 font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> {location.message || "Location not available."}</span>
            )}
            {location.status !== "asking" && (
              <button type="button" onClick={location.retry} className="btn-ghost btn-sm"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-dim"><LocateFixed className="h-3.5 w-3.5" /> Your location is only read now and when you clock out. It is never tracked during your shift.</p>
        </Step>
      )}

      {reasonNeeded && (
        <section className="card border-l-4 border-l-accent p-5">
          <label htmlFor="clock-reason" className="label">{!useShift ? "Why are you working without a scheduled shift?" : "Why are you not at the home?"}</label>
          <textarea id="clock-reason" rows={3} maxLength={500} className="field" value={reason} onChange={event => setReason(event.target.value)} placeholder={!useShift ? "Called in to cover for Sam, who is sick" : "Picking Tasha up from her day program first"} />
          <p className="mt-1 text-xs text-mute">A manager sees this with your punch.</p>
        </section>
      )}

      {needHandover && (
        <Step n={needLocation ? 3 : 2} title="Handover from the last shift" done={handoverDone}>
          {!chosenHome ? (
            <p className="text-sm text-mute">Choose the home first.</p>
          ) : toRead.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-mute"><ScrollText className="h-4 w-4" /> No new handover at this home in the last day.</p>
          ) : (
            <div className="space-y-3">
              {toRead.map(item => (
                <div key={item.id} className={cn("rounded-xl border p-4", read.includes(item.id) ? "border-sage/40 bg-sage-soft/30" : "border-line")}>
                  <HandoverCard handover={item} />
                  <label className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm font-semibold">
                    <input type="checkbox" checked={read.includes(item.id)} onChange={event => setRead(event.target.checked ? [...read, item.id] : read.filter(id => id !== item.id))} /> I have read this handover
                  </label>
                </div>
              ))}
            </div>
          )}
        </Step>
      )}

      {needStatements && statements.length > 0 && (
        <Step n={1 + Number(needLocation) + Number(needHandover) + 1} title="Before you start" done={statementsDone}>
          <ul className="space-y-2">
            {statements.map(statement => (
              <li key={statement}>
                <label className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm has-[:checked]:border-sage/50 has-[:checked]:bg-sage-soft/30">
                  <input type="checkbox" className="mt-0.5" checked={ticked.includes(statement)} onChange={event => setTicked(event.target.checked ? [...ticked, statement] : ticked.filter(item => item !== statement))} />
                  {statement}
                </label>
              </li>
            ))}
          </ul>
        </Step>
      )}

      {state.error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-flag-soft px-4 py-3 text-sm font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> {state.error}</p>}

      <button type="submit" disabled={!ready || pending} className="btn-brand w-full justify-center py-4 text-base disabled:opacity-50">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />} Clock in now
      </button>
      {!ready && !pending && <p className="text-center text-xs text-mute">Finish each step above to clock in.</p>}
    </form>
  );
}
