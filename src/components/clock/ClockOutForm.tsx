"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, ClipboardList, Loader2, LogOut, MapPin, Pill, RefreshCw } from "lucide-react";
import { usePosition } from "@/components/clock/usePosition";
import { cn } from "@/lib/cn";
import { locationVerdict } from "@/lib/timeclock";
import type { FormState } from "@/server/actions/auth";
import { DraftKeeper } from "@/components/app/DraftKeeper";
import { zone } from "@/lib/format";

type Person = { id: string; first: string; last: string; noteWritten: boolean; dosesDue: { id: string; medication: string; scheduledFor: string }[] };

const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone(), hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function Section({ title, hint, tone, children }: { title: string; hint?: string; tone?: "must" | "warn"; children: React.ReactNode }) {
  return (
    <section className={cn("card p-5", tone === "must" && "border-l-4 border-l-flag", tone === "warn" && "border-l-4 border-l-accent")}>
      <h2 className="text-base font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-mute">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Tag = ({ must }: { must: boolean }) => <span className={cn("chip ml-2 align-middle text-[10px]", must ? "bg-flag-soft text-flag" : "bg-accent-soft text-[#8a5a10]")}>{must ? "Must be done" : "Warning"}</span>;

/*
 * Clocking out: what is still undone, the handover for the next shift, the ticks, any incident, and a
 * signature. What blocks the clock-out is set in Settings; the rest is recorded as a warning.
 */
export function ClockOutForm({
  action,
  home,
  homePoint,
  hasHome,
  office = false,
  people,
  checklist,
  blocking,
  minChars,
  overstay,
  leftEarly,
  needLocation,
  radius,
  fullName,
  summary,
  draftKey,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  home: string;
  homePoint: { latitude: number | null; longitude: number | null };
  hasHome: boolean;
  office?: boolean;
  people: Person[];
  checklist: string[];
  blocking: string[];
  minChars: number;
  overstay: number;
  leftEarly: number;
  needLocation: boolean;
  radius: number;
  fullName: string;
  summary: React.ReactNode;
  /* Where this device keeps an unsaved copy of the handover, per staff member and punch. */
  draftKey: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [note, setNote] = useState("");
  const [personNotes, setPersonNotes] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, { done: boolean; comment: string }>>({});
  const [incident, setIncident] = useState<"none" | "reported" | "not_reported" | "">("");
  const [overstayReason, setOverstayReason] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [signed, setSigned] = useState("");
  const location = usePosition(needLocation && (hasHome || office));
  const verdict = locationVerdict(homePoint, location.position, radius, needLocation && (hasHome || office));
  const away = needLocation && (hasHome || office) && location.status !== "asking" && verdict.state === "outside";
  const unknown = needLocation && (hasHome || office) && location.status !== "asking" && verdict.state === "unavailable";

  const notesMissing = people.filter(person => !person.noteWritten);
  const dosesMissing = people.flatMap(person => person.dosesDue.map(dose => ({ ...dose, person })));
  const must = (key: string) => blocking.includes(key);
  const warnings = [notesMissing.length && !must("notes"), dosesMissing.length && !must("doses"), incident === "not_reported" && !must("incident")].filter(Boolean).length;
  const blocked =
    (must("notes") && notesMissing.length > 0) ||
    (must("doses") && dosesMissing.length > 0) ||
    (hasHome && must("handover") && note.trim().length < Math.max(1, minChars)) ||
    (hasHome && must("checks") && checklist.some(label => !checks[label]?.done && (checks[label]?.comment ?? "").trim().length < 3)) ||
    (hasHome && incident === "") ||
    (must("incident") && incident === "not_reported") ||
    ((overstay > 0 || leftEarly > 0) && overstayReason.trim().length < 5) ||
    (away && reason.trim().length < 5) ||
    (warnings > 0 && !confirm) ||
    signed.trim().length < 3 ||
    (needLocation && (hasHome || office) && location.status === "asking");

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData();
        data.set(
          "payload",
          JSON.stringify({
            position: location.position,
            reason: reason.trim(),
            note: note.trim(),
            people: Object.entries(personNotes).map(([individualId, text]) => ({ individualId, note: text.trim() })).filter(row => row.note),
            checks: checklist.map(label => ({ label, done: checks[label]?.done ?? false, comment: (checks[label]?.comment ?? "").trim() })),
            incident: incident || "none",
            overstayReason: overstayReason.trim(),
            attestedName: signed.trim(),
            confirmWarnings: confirm,
          }),
        );
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
      {summary}
      <DraftKeeper name={draftKey} label="handover" />

      {(notesMissing.length > 0 || dosesMissing.length > 0) && (
        <Section title="Still to do" hint="Open each one in a new tab, then refresh this page." tone={(must("notes") && notesMissing.length) || (must("doses") && dosesMissing.length) ? "must" : "warn"}>
          <ul className="space-y-2 text-sm">
            {notesMissing.map(person => (
              <li key={person.id} className="flex flex-wrap items-center gap-2">
                <ClipboardList className="h-4 w-4 text-mute" /> Daily note for <span className="font-semibold">{person.first} {person.last}</span>
                <Tag must={must("notes")} />
                <Link href={`/app/daily-logs/new?individual=${person.id}`} target="_blank" className="ml-auto text-xs font-semibold text-brand">Write it</Link>
              </li>
            ))}
            {dosesMissing.map(dose => (
              <li key={dose.id} className="flex flex-wrap items-center gap-2">
                <Pill className="h-4 w-4 text-plum" /> {dose.medication} for <span className="font-semibold">{dose.person.first}</span> at {time(dose.scheduledFor)}
                <Tag must={must("doses")} />
                <Link href={`/app/individuals/${dose.person.id}?tab=medications`} target="_blank" className="ml-auto text-xs font-semibold text-brand">Record it</Link>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => window.location.reload()} className="btn-ghost btn-sm mt-3"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </Section>
      )}

      {hasHome && (
        <Section title={`Handover for the next shift at ${home}`} hint="The next staff member reads this before they can clock in." tone={must("handover") ? "must" : undefined}>
          <label htmlFor="handover-note" className="label">How the shift went{must("handover") ? "" : " (optional)"}</label>
          <textarea id="handover-note" name="handoverNote" rows={4} maxLength={4000} className="field" value={note} onChange={event => setNote(event.target.value)} placeholder="Quiet evening. Brianna had a headache after dinner, gave water and rest, fine by 8pm. Groceries are low on milk." />
          {minChars > 0 && must("handover") && <p className={cn("mt-1 text-right text-xs", note.trim().length >= minChars ? "text-sage" : "text-dim")}>{note.trim().length} / {minChars} characters</p>}
          {people.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="label">Anything about each person (optional)</p>
              {people.map(person => (
                <div key={person.id} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:items-center">
                  <label htmlFor={`handover-${person.id}`} className="text-sm font-semibold">{person.first} {person.last}</label>
                  <input id={`handover-${person.id}`} maxLength={1000} className="field" value={personNotes[person.id] ?? ""} onChange={event => setPersonNotes({ ...personNotes, [person.id]: event.target.value })} placeholder="Appointment tomorrow at 9" />
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {hasHome && checklist.length > 0 && (
        <Section title="Handover ticks" hint="Tick each one, or say why it was not done." tone={must("checks") ? "must" : undefined}>
          <ul className="space-y-2">
            {checklist.map(label => {
              const check = checks[label] ?? { done: false, comment: "" };
              return (
                <li key={label} className={cn("rounded-xl border px-4 py-3", check.done ? "border-sage/40 bg-sage-soft/30" : "border-line")}>
                  <label className="flex items-center gap-3 text-sm font-semibold">
                    <input type="checkbox" checked={check.done} onChange={event => setChecks({ ...checks, [label]: { ...check, done: event.target.checked } })} /> {label}
                  </label>
                  {!check.done && (
                    <input
                      aria-label={`Why "${label}" was not done`}
                      maxLength={500}
                      className="field mt-2 py-2 text-sm"
                      value={check.comment}
                      onChange={event => setChecks({ ...checks, [label]: { ...check, comment: event.target.value } })}
                      placeholder="Not done because…"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {hasHome && (
        <Section title="Incidents" tone={incident === "not_reported" ? (must("incident") ? "must" : "warn") : undefined}>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["none", "No incident this shift"],
                ["reported", "Yes, and I reported it"],
                ["not_reported", "Yes, not reported yet"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/40">
                <input type="radio" name="incident" checked={incident === value} onChange={() => setIncident(value)} /> {text}
              </label>
            ))}
          </div>
          {incident === "not_reported" && (
            <p className="mt-3 text-sm">
              <Link href="/app/incidents/new" target="_blank" className="font-semibold text-brand">Report the incident now</Link>
              {must("incident") ? ", then choose \"Yes, and I reported it\"." : ". Your manager will be told it is not reported yet."}
            </p>
          )}
        </Section>
      )}

      {leftEarly > 0 && (
        <Section title="You are leaving early" hint={`Your shift ends in ${leftEarly} minutes.`} tone="must">
          <label htmlFor="early" className="label">Why are you leaving early?</label>
          <input id="early" maxLength={500} className="field" value={overstayReason} onChange={event => setOverstayReason(event.target.value)} placeholder="Relieved early by the night staff; manager agreed" />
        </Section>
      )}

      {overstay > 0 && (
        <Section title="You stayed late" hint={`You are ${overstay} minutes past the end of your shift.`} tone="must">
          <label htmlFor="overstay" className="label">Why did you stay?</label>
          <input id="overstay" maxLength={500} className="field" value={overstayReason} onChange={event => setOverstayReason(event.target.value)} placeholder="Waited for the night staff, who was 30 minutes late" />
        </Section>
      )}

      {needLocation && (hasHome || office) && (
        <Section title="Where you are" tone={away ? "must" : undefined}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {location.status === "asking" ? (
              <span className="flex items-center gap-2 text-mute"><Loader2 className="h-4 w-4 animate-spin" /> Finding your location…</span>
            ) : verdict.state === "ok" ? (
              <span className="flex items-center gap-2 font-semibold text-sage"><MapPin className="h-4 w-4" /> At {home}</span>
            ) : verdict.state === "home_not_set" ? (
              <span className="text-mute">Location recorded. This home has no map location yet.</span>
            ) : (
              verdict.state === "outside" ? (
                <span className="flex items-center gap-2 font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> About {verdict.distance} m from {home}</span>
              ) : (
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 font-semibold text-[#8a5a10]"><AlertTriangle className="h-4 w-4" /> We could not read your location.</span>
                  <span className="text-xs text-mute">You can still clock out. It is recorded as an exception and your home manager is told.</span>
                </span>
              )
            )}
            {location.status !== "asking" && <button type="button" onClick={location.retry} className="btn-ghost btn-sm"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>}
          </div>
          {(away || unknown) && (
            <input
              aria-label={away ? "Why you are not at the home" : "Anything your manager should know about your location"}
              maxLength={500}
              className="field mt-3"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder={away ? "Why you are clocking out away from the home" : "Optional: for example, my phone's location is switched off"}
            />
          )}
        </Section>
      )}

      <Section title="Sign off">
        {warnings > 0 && (
          <label className="mb-4 flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
            <input type="checkbox" className="mt-0.5" checked={confirm} onChange={event => setConfirm(event.target.checked)} />
            <span>I know some things above are not done. My manager will see them with this punch.</span>
          </label>
        )}
        <p className="text-sm">My times are accurate, I took the breaks I recorded, and the handover is true.</p>
        <label htmlFor="sign" className="label mt-3">Type your full name to sign</label>
        <input id="sign" autoComplete="off" className="field" value={signed} onChange={event => setSigned(event.target.value)} placeholder={fullName} />
      </Section>

      {state.error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-flag-soft px-4 py-3 text-sm font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> {state.error}</p>}

      <button type="submit" disabled={blocked || pending} className="btn-brand w-full justify-center py-4 text-base disabled:opacity-50">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />} Clock out now
      </button>
      {blocked && !pending && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-mute">
          {notesMissing.length && must("notes") ? <CircleX className="h-3.5 w-3.5 text-flag" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Finish each part above to clock out.
        </p>
      )}
    </form>
  );
}
