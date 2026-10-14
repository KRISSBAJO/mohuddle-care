"use client";

import { startTransition, useActionState, useState } from "react";
import { CalendarClock, ClipboardList, MapPin, Stethoscope, UserRound, Users } from "lucide-react";
import { SearchSelect } from "@/components/app/SearchSelect";
import { cn } from "@/lib/cn";
import type { FormState } from "@/server/actions/auth";

export type CareContact = { id: string; role: string; name: string; organization: string; phone: string; address: string };
type Values = { individualId: string; type: string; provider: string; clinic: string; phone: string; address: string; date: string; time: string; durationMinutes: number; reason: string; prep: string; transport: string; escortStaffId: string; followUpOf: string };

function Section({ icon: Icon, title, hint, children }: { icon: typeof MapPin; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line pb-6 last:border-b-0 last:pb-0 md:grid-cols-[200px_1fr]">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-brand" /> {title}</h2>
        {hint && <p className="mt-1 text-xs leading-relaxed text-mute">{hint}</p>}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => <label htmlFor={htmlFor} className="label">{children}</label>;

/*
 * Booking or changing an appointment on its own page. Choosing someone from the person's care team
 * fills in the clinician, clinic, phone and address.
 */
export function AppointmentForm({
  action,
  submitLabel,
  types,
  staff,
  people,
  contacts,
  initial,
  lockPerson = false,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  types: string[];
  staff: { value: string; label: string; hint?: string }[];
  people: { value: string; label: string; hint?: string }[];
  contacts: Record<string, CareContact[]>;
  initial: Values;
  lockPerson?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [personId, setPersonId] = useState(initial.individualId);
  const [where, setWhere] = useState({ provider: initial.provider, clinic: initial.clinic, phone: initial.phone, address: initial.address });
  const team = (contacts[personId] ?? []).filter(contact => !/guardian|family|pharmacy|employer/i.test(contact.role));
  const typeOptions = initial.type && !types.includes(initial.type) ? [initial.type, ...types] : types;

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="card grid gap-6 p-6"
    >
      {initial.followUpOf && <input type="hidden" name="followUpOf" value={initial.followUpOf} />}
      <Section icon={UserRound} title="Who and what" hint="Who the visit is for and the kind of appointment.">
        <div>
          <Label htmlFor="appt-person">Person</Label>
          {lockPerson ? (
            <>
              <input type="hidden" name="individualId" value={personId} />
              <p className="field bg-panel/60">{people.find(person => person.value === personId)?.label ?? "Unknown"}</p>
            </>
          ) : (
            <SearchSelect id="appt-person" name="individualId" required defaultValue={personId} placeholder="Search people" options={people} onChange={setPersonId} />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="appt-type">Type</Label>
            <select id="appt-type" name="type" required className="field" defaultValue={initial.type}>
              <option value="" disabled>Choose</option>
              {typeOptions.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="appt-provider">Doctor or clinician</Label>
            <input id="appt-provider" name="provider" maxLength={120} className="field" value={where.provider} onChange={event => setWhere({ ...where, provider: event.target.value })} placeholder="Dr. Owens" />
          </div>
        </div>
        {team.length > 0 && (
          <div>
            <p className="label">From the care team</p>
            <div className="flex flex-wrap gap-2">
              {team.map(contact => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => setWhere({ provider: contact.name, clinic: contact.organization, phone: contact.phone, address: contact.address })}
                  className={cn("rounded-xl border px-3 py-2 text-left text-xs transition hover:border-brand hover:bg-sky/50", where.provider === contact.name ? "border-brand bg-sky/50" : "border-line")}
                >
                  <span className="block font-semibold text-ink">{contact.name}</span>
                  <span className="text-mute">{contact.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section icon={CalendarClock} title="When" hint="Escorts are reminded before the visit and on the day.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="appt-date">Date</Label>
            <input id="appt-date" name="date" type="date" required className="field" defaultValue={initial.date} />
          </div>
          <div>
            <Label htmlFor="appt-time">Time</Label>
            <input id="appt-time" name="time" type="time" required className="field" defaultValue={initial.time} />
          </div>
          <div>
            <Label htmlFor="appt-length">Length (minutes)</Label>
            <input id="appt-length" name="durationMinutes" type="number" min={5} max={600} className="field" defaultValue={initial.durationMinutes} />
          </div>
        </div>
      </Section>

      <Section icon={MapPin} title="Where">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="appt-clinic">Clinic</Label>
            <input id="appt-clinic" name="clinic" maxLength={120} className="field" value={where.clinic} onChange={event => setWhere({ ...where, clinic: event.target.value })} placeholder="Vanderbilt Family Medicine" />
          </div>
          <div>
            <Label htmlFor="appt-phone">Clinic phone</Label>
            <input id="appt-phone" name="phone" type="tel" maxLength={40} className="field" value={where.phone} onChange={event => setWhere({ ...where, phone: event.target.value })} />
          </div>
        </div>
        <div>
          <Label htmlFor="appt-address">Address</Label>
          <input id="appt-address" name="address" maxLength={200} className="field" value={where.address} onChange={event => setWhere({ ...where, address: event.target.value })} />
        </div>
      </Section>

      <Section icon={Users} title="Getting there" hint="The staff member going gets reminders and documents the visit.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="appt-escort">Staff going with them</Label>
            <SearchSelect id="appt-escort" name="escortStaffId" defaultValue={initial.escortStaffId} emptyLabel="Not decided yet" placeholder="Search staff" options={staff} />
          </div>
          <div>
            <Label htmlFor="appt-transport">Transport</Label>
            <input id="appt-transport" name="transport" maxLength={200} className="field" defaultValue={initial.transport} placeholder="Home van, wheelchair ramp" />
          </div>
        </div>
      </Section>

      <Section icon={ClipboardList} title="Reason and preparation">
        <div>
          <Label htmlFor="appt-reason">Reason for the visit</Label>
          <textarea id="appt-reason" name="reason" rows={3} maxLength={1000} className="field" defaultValue={initial.reason} placeholder="Annual physical; ask about knee pain on transfers." />
        </div>
        <div>
          <Label htmlFor="appt-prep">Before the visit</Label>
          <textarea id="appt-prep" name="prep" rows={3} maxLength={1000} className="field" defaultValue={initial.prep} placeholder="No food after midnight. Bring the medication list and insurance card." />
        </div>
      </Section>

      {state.error && <p className="rounded-xl bg-flag-soft px-4 py-3 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <div className="flex justify-end">
        <button disabled={pending} className="btn-brand disabled:opacity-60"><Stethoscope className="h-4 w-4" /> {pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
