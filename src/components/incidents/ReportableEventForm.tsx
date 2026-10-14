"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { AlertTriangle, BellRing, ClipboardList, FileWarning, HeartPulse, Loader2, MapPin, ShieldAlert, Siren, UserRound } from "lucide-react";
import { Select } from "@/components/app/Select";
import { cn } from "@/lib/cn";
import { EVENT_GROUPS, INJURED_PARTIES, INTERVENTION_GROUPS, INVOLVEMENT_QUESTIONS, REGIONS, eventTier } from "@/lib/reportable-events";
import type { FormState } from "@/server/actions/auth";
import type { IncidentFormData, PersonFacts } from "@/server/queries/incident-form";

type Notice = { on: boolean; date: string; time: string; name: string; comments: string };

function Section({ icon: Icon, title, hint, children, tone }: { icon: typeof MapPin; title: string; hint?: string; children: React.ReactNode; tone?: "red" }) {
  return (
    <section className={cn("card p-5 sm:p-6", tone === "red" && "border-l-4 border-l-flag")}>
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-bold"><Icon className="h-4 w-4 text-brand" /> {title}</h2>
        {hint && <p className="mt-0.5 text-xs text-mute">{hint}</p>}
      </header>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

const Label = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => <label htmlFor={htmlFor} className="label">{children}</label>;

function YesNo({ name, value, onChange }: { name: string; value: string; onChange: (value: "yes" | "no") => void }) {
  return (
    <div className="flex gap-2">
      {(["yes", "no"] as const).map(option => (
        <label key={option} className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky has-[:checked]:text-brand-deep">
          <input type="radio" name={name} className="sr-only" checked={value === option} onChange={() => onChange(option)} /> {option === "yes" ? "Yes" : "No"}
        </label>
      ))}
    </div>
  );
}

const fmtDay = (day: string | null) => (day ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${day}T12:00:00Z`)) : "Not recorded");

/*
 * The state's Reportable Event Form, laid out in the same order. Choosing the person fills in what
 * Mohuddle knows about them; when the form is opened from a person, they are already chosen.
 */
export function ReportableEventForm({
  action,
  data,
  lockedPersonId,
  homeId,
  reporter,
  today,
  nowTime,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  data: IncidentFormData;
  lockedPersonId: string | null;
  homeId: string | null;
  reporter: string;
  today: string;
  nowTime: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const choices = homeId ? data.people.filter(person => person.homeId === homeId) : data.people;
  const [personId, setPersonId] = useState(lockedPersonId ?? "");
  const person = data.people.find(item => item.id === personId) ?? null;
  const prefill = (facts: PersonFacts | null) => ({
    alias: facts?.alias ?? "",
    aliasAnswer: facts ? (facts.alias ? "yes" : "no") : "",
    waiverType: facts?.waiverType ?? "",
    mco: facts?.mco ?? "",
    eventLocation: facts?.homeId ? "Residence" : "",
    useHome: Boolean(facts?.homeId),
    eventAddress: facts?.address ?? "",
    eventCity: facts?.city ?? "",
    eventZip: facts?.zip ?? "",
    eventRegion: facts?.region ?? "",
    legalRep: facts ? (facts.hasGuardian ? "yes" : "no") : "",
  });
  const start = lockedPersonId ? prefill(data.people.find(item => item.id === lockedPersonId) ?? null) : homeId ? { ...prefill(null), ...homeAddress(homeId) } : prefill(null);
  function homeAddress(id: string) {
    const home = data.homes.find(item => item.id === id);
    return home ? { eventLocation: "Residence", useHome: true, eventAddress: home.address, eventCity: home.city, eventZip: home.zip, eventRegion: home.region } : {};
  }

  const [f, setF] = useState({
    responsibleProvider: data.provider,
    reportingProvider: data.provider,
    personAlias: start.alias,
    aliasAnswer: start.aliasAnswer as string,
    waiverType: start.waiverType,
    mco: start.mco,
    mcoNumber: "",
    eventLocation: start.eventLocation ?? "",
    useHome: start.useHome ?? false,
    eventAddress: start.eventAddress ?? "",
    eventCity: start.eventCity ?? "",
    eventState: "TN",
    eventZip: start.eventZip ?? "",
    eventRegion: start.eventRegion ?? "",
    occurredDate: today,
    occurredTime: nowTime,
    occurredUnknown: false,
    discoveredDate: "",
    discoveredTime: "",
    witnessType: "",
    witnessedBy: "",
    otherOn: false,
    otherEventText: "",
    prnGivenBy: "",
    description: "",
    injury: "",
    injuryDetails: "",
    actionsTaken: "",
    severity: "low",
  });
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF(current => ({ ...current, [key]: value }));
  const [types, setTypes] = useState<string[]>([]);
  const [injured, setInjured] = useState<string[]>([]);
  const [interventions, setInterventions] = useState<string[]>([]);
  const [involvement, setInvolvement] = useState<Record<string, "yes" | "no">>(start.legalRep ? { legal_rep: start.legalRep as "yes" | "no" } : {});
  const [notices, setNotices] = useState<Record<string, Notice>>({});

  const choosePerson = (id: string) => {
    setPersonId(id);
    const facts = data.people.find(item => item.id === id) ?? null;
    const next = prefill(facts);
    setF(current => ({ ...current, personAlias: next.alias, aliasAnswer: next.aliasAnswer, waiverType: next.waiverType, mco: next.mco, eventLocation: next.eventLocation || current.eventLocation, useHome: next.useHome, eventAddress: next.eventAddress, eventCity: next.eventCity, eventZip: next.eventZip, eventRegion: next.eventRegion }));
    if (next.legalRep) setInvolvement(current => ({ ...current, legal_rep: next.legalRep as "yes" | "no" }));
  };

  const tier = useMemo(() => {
    const found = eventTier(types);
    return found || (f.otherOn && f.otherEventText ? "reportable" : "");
  }, [types, f.otherOn, f.otherEventText]);

  const toggle = (list: string[], setter: (value: string[]) => void, key: string) => setter(list.includes(key) ? list.filter(item => item !== key) : [...list, key]);
  const witnessOptions = [{ value: "The person supported", label: "The person supported" }, ...data.staff.map(member => ({ value: member.label, label: member.label, hint: "Staff" })), { value: "Another person", label: "Another person" }];

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const payload = {
          ...f,
          individualId: personId,
          homeId: homeId ?? person?.homeId ?? "",
          personAlias: f.aliasAnswer === "yes" ? f.personAlias : "",
          otherEventText: f.otherOn ? f.otherEventText : "",
          eventTypes: types,
          injuredParties: injured,
          interventions,
          involvement,
          notifications: Object.entries(notices)
            .filter(([, notice]) => notice.on)
            .map(([party, notice]) => ({ party, date: notice.date, time: notice.time, name: notice.name, comments: notice.comments })),
        };
        const formData = new FormData();
        formData.set("payload", JSON.stringify(payload));
        startTransition(() => formAction(formData));
      }}
      className="grid gap-5"
    >
      {tier && (
        <div className={cn("sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-3 text-sm shadow-sm", tier === "tier1" ? "border-flag bg-flag-soft text-flag" : "border-accent bg-accent-soft text-[#8a5a10]")}>
          <Siren className="h-5 w-5 shrink-0" />
          <span className="font-bold">{tier === "tier1" ? "Tier 1 event" : tier === "tier2" ? "Tier 2 event" : "Reportable event"}</span>
          <span>
            {tier === "tier1"
              ? `Call DIDD Investigations within ${data.tier1Hours} hours, and file this form within ${data.fileHours} hours.`
              : `File this form with DIDD Event Management within ${data.fileHours} hours (one business day).`}
          </span>
        </div>
      )}

      <Section icon={UserRound} title="Event details" hint="Filled in from the person's record. Check it is right for this event.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="ref-resp">Responsible provider</Label><input id="ref-resp" className="field" value={f.responsibleProvider} onChange={event => set("responsibleProvider", event.target.value)} /></div>
          <div><Label htmlFor="ref-rep">Reporting provider</Label><input id="ref-rep" className="field" value={f.reportingProvider} onChange={event => set("reportingProvider", event.target.value)} /></div>
        </div>
        <div>
          <Label htmlFor="ref-person">Person supported</Label>
          {lockedPersonId && person ? (
            <p className="field bg-panel/50 font-semibold">{person.name}</p>
          ) : (
            <Select id="ref-person" searchable value={personId} onChange={choosePerson} emptyLabel="No specific person (not state reportable)" options={choices.map(item => ({ value: item.id, label: item.name, hint: item.home || undefined }))} />
          )}
        </div>
        {person && (
          <dl className="grid gap-3 rounded-xl bg-panel/50 p-4 text-sm sm:grid-cols-3">
            {(
              [
                ["Date of birth", fmtDay(person.dob)],
                ["Age", person.age !== null ? `${person.age} years` : "Not recorded"],
                ["Gender", person.gender || "Not recorded"],
                ["Medicaid ID", person.medicaidId || "Not recorded"],
                ["Home", person.home || "Not in one of our homes"],
                ["Legal representative", person.guardian || "None recorded"],
              ] as const
            ).map(([term, value]) => (
              <div key={term}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">{term}</dt>
                <dd className={value.startsWith("Not") || value.startsWith("None") ? "text-dim" : ""}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div>
          <p className="label">Does the person supported go by another name?</p>
          <YesNo name="ref-alias" value={f.aliasAnswer} onChange={value => set("aliasAnswer", value)} />
          {f.aliasAnswer === "yes" && <input aria-label="Other name" className="field mt-2 sm:max-w-sm" value={f.personAlias} onChange={event => set("personAlias", event.target.value)} placeholder="The name they go by" />}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ref-waiver">Waiver type</Label>
            <Select id="ref-waiver" value={f.waiverType} onChange={value => set("waiverType", value)} emptyLabel="Choose" options={[...new Set([f.waiverType, ...data.lists.waivers].filter(Boolean))].map(item => ({ value: item, label: item }))} />
          </div>
          <div>
            <Label htmlFor="ref-mco">MCO</Label>
            <Select id="ref-mco" value={f.mco} onChange={value => set("mco", value)} emptyLabel="Choose" options={[...new Set([f.mco, ...data.lists.mcos].filter(Boolean))].map(item => ({ value: item, label: item }))} />
          </div>
          <div><Label htmlFor="ref-mco-number">MCO number</Label><input id="ref-mco-number" className="field" value={f.mcoNumber} onChange={event => set("mcoNumber", event.target.value)} /></div>
        </div>
      </Section>

      <Section icon={MapPin} title="Where and when">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ref-location">Event location</Label>
            <Select id="ref-location" value={f.eventLocation} onChange={value => set("eventLocation", value)} options={data.lists.locations.map(item => ({ value: item, label: item }))} />
          </div>
          <div>
            <Label htmlFor="ref-region">Event region</Label>
            <Select id="ref-region" value={f.eventRegion} onChange={value => set("eventRegion", value as typeof f.eventRegion)} emptyLabel="Choose" options={Object.entries(REGIONS).map(([value, text]) => ({ value, label: text }))} />
          </div>
        </div>
        {person?.homeId && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.useHome}
              onChange={event => {
                set("useHome", event.target.checked);
                if (event.target.checked) setF(current => ({ ...current, useHome: true, eventAddress: person.address, eventCity: person.city, eventZip: person.zip, eventRegion: person.region }));
              }}
            />
            Use the person&apos;s home address ({person.home})
          </label>
        )}
        <div><Label htmlFor="ref-address">Event address</Label><input id="ref-address" className="field" value={f.eventAddress} onChange={event => { set("eventAddress", event.target.value); set("useHome", false); }} placeholder="Street address, or a description of the place" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="ref-city">City</Label><input id="ref-city" className="field" value={f.eventCity} onChange={event => set("eventCity", event.target.value)} /></div>
          <div><Label htmlFor="ref-state">State</Label><input id="ref-state" className="field" maxLength={40} value={f.eventState} onChange={event => set("eventState", event.target.value)} /></div>
          <div><Label htmlFor="ref-zip">ZIP code</Label><input id="ref-zip" className="field" inputMode="numeric" maxLength={10} value={f.eventZip} onChange={event => set("eventZip", event.target.value)} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><Label htmlFor="ref-date">Event date</Label><input id="ref-date" type="date" max={today} className="field" disabled={f.occurredUnknown} value={f.occurredDate} onChange={event => set("occurredDate", event.target.value)} /></div>
          <div><Label htmlFor="ref-time">Event time</Label><input id="ref-time" type="time" className="field" disabled={f.occurredUnknown} value={f.occurredTime} onChange={event => set("occurredTime", event.target.value)} /></div>
          <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" checked={f.occurredUnknown} onChange={event => set("occurredUnknown", event.target.checked)} /> Unknown</label>
        </div>
        {f.occurredUnknown && (
          <div className="grid gap-4 rounded-xl bg-accent-soft/50 p-4 sm:grid-cols-2">
            <p className="text-xs text-[#8a5a10] sm:col-span-2">The date and time of the event are unknown, so enter when it was discovered.</p>
            <div><Label htmlFor="ref-disc-date">Discovery date</Label><input id="ref-disc-date" type="date" max={today} className="field" value={f.discoveredDate} onChange={event => set("discoveredDate", event.target.value)} /></div>
            <div><Label htmlFor="ref-disc-time">Discovery time</Label><input id="ref-disc-time" type="time" className="field" value={f.discoveredTime} onChange={event => set("discoveredTime", event.target.value)} /></div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ref-witness">This event was</Label>
            <Select id="ref-witness" value={f.witnessType} onChange={value => set("witnessType", value)} options={[{ value: "witnessed", label: "Witnessed" }, { value: "discovered", label: "Discovered" }]} placeholder="Witnessed or discovered" />
          </div>
          <div>
            <Label htmlFor="ref-witness-by">By</Label>
            <Select id="ref-witness-by" searchable value={f.witnessedBy} onChange={value => set("witnessedBy", value)} options={witnessOptions} placeholder="Who witnessed or discovered it" />
          </div>
        </div>
      </Section>

      <Section icon={FileWarning} title="Type of event" hint="Tick everything that applies. The most serious tier decides how fast it must reach the state.">
        {EVENT_GROUPS.map(group => (
          <fieldset key={group.key} className={cn("rounded-xl border p-4", group.key === "tier1" ? "border-flag/40" : "border-line")}>
            <legend className={cn("px-1 text-sm font-bold", group.key === "tier1" ? "text-flag" : group.key === "tier2" ? "text-[#8a5a10]" : "text-ink")}>{group.title}</legend>
            <p className="mb-3 text-xs text-mute">{group.deadline}</p>
            <div className={cn("grid gap-2", group.key === "behavioral" || group.key === "medical" ? "lg:grid-cols-2" : "")}>
              {group.events.map(event => (
                <label key={event.key} className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm", types.includes(event.key) ? "bg-sky/60" : "hover:bg-panel/60")}>
                  <input type="checkbox" className="mt-0.5" checked={types.includes(event.key)} onChange={() => toggle(types, setTypes, event.key)} />
                  <span>
                    <span className="font-semibold">{event.label}</span>
                    {event.detail && <span className="block text-xs text-mute">{event.detail}</span>}
                  </span>
                </label>
              ))}
            </div>
            {group.key === "behavioral" && types.includes("b_injury_to_other") && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-panel/60 px-3 py-2 text-sm">
                <span className="text-xs font-semibold text-mute">Who was injured:</span>
                {Object.entries(INJURED_PARTIES).map(([key, text]) => (
                  <label key={key} className="flex items-center gap-1.5"><input type="checkbox" checked={injured.includes(key)} onChange={() => toggle(injured, setInjured, key)} /> {text}</label>
                ))}
              </div>
            )}
          </fieldset>
        ))}
        <div className="rounded-xl border border-line p-4">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.otherOn} onChange={event => set("otherOn", event.target.checked)} /> Other type of event</label>
          {f.otherOn && <textarea aria-label="Explain the other type of event" rows={2} className="field mt-2" value={f.otherEventText} onChange={event => set("otherEventText", event.target.value)} placeholder="Please explain" />}
        </div>
        <div className="grid gap-3 rounded-xl border border-line p-4">
          <p className="text-sm font-bold">Additional involvement</p>
          {INVOLVEMENT_QUESTIONS.map(question => (
            <div key={question.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{question.label}</span>
              <YesNo name={`ref-inv-${question.key}`} value={involvement[question.key] ?? ""} onChange={value => setInvolvement(current => ({ ...current, [question.key]: value }))} />
            </div>
          ))}
        </div>
      </Section>

      <Section icon={HeartPulse} title="Event interventions" hint="Check all that apply in each section.">
        {INTERVENTION_GROUPS.map(group => (
          <fieldset key={group.title}>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-mute">{group.title}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map(item => (
                <label key={item.key} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", interventions.includes(item.key) ? "bg-sky/60" : "hover:bg-panel/60")}>
                  <input type="checkbox" checked={interventions.includes(item.key)} onChange={() => toggle(interventions, setInterventions, item.key)} /> {item.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {interventions.includes("i_prn_psychotropic") && (
          <div className="sm:max-w-md">
            <Label htmlFor="ref-prn">Who gave the PRN psychotropic medication?</Label>
            <Select id="ref-prn" searchable value={f.prnGivenBy} onChange={value => set("prnGivenBy", value)} options={[...data.staff.map(member => ({ value: member.label, label: member.label })), { value: "Nurse", label: "Nurse" }, { value: "Medical professional", label: "Medical professional" }]} />
          </div>
        )}
      </Section>

      <Section icon={ClipboardList} title="Event description">
        <div>
          <Label htmlFor="ref-description">Brief event description: what, when, where, who and why</Label>
          <textarea id="ref-description" rows={6} className="field" value={f.description} onChange={event => set("description", event.target.value)} placeholder="Facts only, in order, using names. What you saw and heard, and what happened next." />
          <p className="mt-1 text-right text-xs text-dim">{f.description.trim().length} characters</p>
        </div>
        <div>
          <p className="label">Did the person supported sustain any injury during the event?</p>
          <YesNo name="ref-injury" value={f.injury} onChange={value => set("injury", value)} />
          {f.injury === "yes" && <textarea aria-label="Describe the injury" rows={2} className="field mt-2" value={f.injuryDetails} onChange={event => set("injuryDetails", event.target.value)} placeholder="Where, how big, and the treatment given" />}
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div><Label htmlFor="ref-actions">What was done</Label><textarea id="ref-actions" rows={3} className="field" value={f.actionsTaken} onChange={event => set("actionsTaken", event.target.value)} placeholder="First aid, who was called, how the person is now" /></div>
          <div>
            <Label htmlFor="ref-severity">Severity</Label>
            <Select id="ref-severity" value={f.severity} onChange={value => set("severity", value)} options={[{ value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }]} />
            {tier === "tier1" && <p className="mt-1 text-xs text-flag">Tier 1 events are recorded as critical.</p>}
          </div>
        </div>
      </Section>

      <Section icon={BellRing} title="Notifications" hint="Complete all that apply. More can be added on the incident's page later.">
        <div className="divide-y divide-line rounded-xl border border-line">
          {data.lists.parties.map(party => {
            const notice = notices[party] ?? { on: false, date: today, time: nowTime, name: "", comments: "" };
            const update = (patch: Partial<Notice>) => setNotices(current => ({ ...current, [party]: { ...notice, ...patch } }));
            const named = /investigator|law enforcement|police/i.test(party);
            return (
              <div key={party} className={cn("px-4 py-3", notice.on && "bg-sky/30")}>
                <label className="flex items-center gap-2.5 text-sm font-semibold"><input type="checkbox" checked={notice.on} onChange={event => update({ on: event.target.checked })} /> {party}</label>
                {notice.on && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_7rem_1fr]">
                    <input type="date" aria-label={`Date ${party} was notified`} max={today} className="field py-2 text-sm" value={notice.date} onChange={event => update({ date: event.target.value })} />
                    <input type="time" aria-label={`Time ${party} was notified`} className="field py-2 text-sm" value={notice.time} onChange={event => update({ time: event.target.value })} />
                    <input aria-label={`Comments for ${party}`} className="field py-2 text-sm" value={notice.comments} onChange={event => update({ comments: event.target.value })} placeholder="Additional comments" />
                    {named && <input aria-label={/investigator/i.test(party) ? "Investigator name" : "Police department"} className="field py-2 text-sm sm:col-span-3" value={notice.name} onChange={event => update({ name: event.target.value })} placeholder={/investigator/i.test(party) ? "Investigator name" : "Police department name"} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section icon={ShieldAlert} title="Submit">
        <p className="text-sm">Person completing this form: <span className="font-semibold">{reporter}</span></p>
        {state.error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-flag-soft px-4 py-3 text-sm font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> {state.error}</p>}
        <button type="submit" disabled={pending} className="btn-brand justify-self-start px-6 py-3">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Submit report
        </button>
      </Section>
    </form>
  );
}
