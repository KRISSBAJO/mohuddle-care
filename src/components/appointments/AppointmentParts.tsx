import Link from "next/link";
import { CalendarClock, MapPin, Pill, Repeat, UserRound } from "lucide-react";
import { Badge, Empty, Field } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { followUpState, visitState, VISIT_STATE } from "@/lib/appointments";
import { dateKey, fmt } from "@/lib/format";
import type { schema } from "@/server/db";

type Appointment = typeof schema.appointments.$inferSelect;
type StaffOption = { id: string; firstName: string; lastName: string };

const clock = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

/* The booking form, used to book, follow up and reschedule. */
export function AppointmentFields({
  types,
  staff,
  people,
  appointment,
  prefix,
  defaults,
}: {
  types: string[];
  staff: StaffOption[];
  people?: { id: string; name: string }[];
  appointment?: Partial<Appointment> & { scheduledAt?: Date };
  prefix: string;
  defaults?: { individualId?: string; followUpOf?: string; date?: string };
}) {
  const typeOptions = appointment?.type && !types.includes(appointment.type) ? [appointment.type, ...types] : types;
  return (
    <>
      {people ? (
        <Field label="Person" htmlFor={`${prefix}-person`}>
          <select id={`${prefix}-person`} name="individualId" required className="field" defaultValue={defaults?.individualId ?? ""}>
            <option value="" disabled>Choose a person</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </Field>
      ) : (
        defaults?.individualId && <input type="hidden" name="individualId" value={defaults.individualId} />
      )}
      {defaults?.followUpOf && <input type="hidden" name="followUpOf" value={defaults.followUpOf} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${prefix}-type`}>
          <select id={`${prefix}-type`} name="type" required className="field" defaultValue={appointment?.type ?? ""}>
            <option value="" disabled>Choose</option>
            {typeOptions.map(type => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Doctor or clinician" htmlFor={`${prefix}-provider`}>
          <input id={`${prefix}-provider`} name="provider" maxLength={120} className="field" defaultValue={appointment?.provider} placeholder="Dr. Owens" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor={`${prefix}-date`}>
          <input id={`${prefix}-date`} name="date" type="date" required className="field" defaultValue={appointment?.scheduledAt ? dateKey(appointment.scheduledAt) : defaults?.date} />
        </Field>
        <Field label="Time" htmlFor={`${prefix}-time`}>
          <input id={`${prefix}-time`} name="time" type="time" required className="field" defaultValue={appointment?.scheduledAt ? clock(appointment.scheduledAt) : "10:00"} />
        </Field>
        <Field label="Length (minutes)" htmlFor={`${prefix}-length`}>
          <input id={`${prefix}-length`} name="durationMinutes" type="number" min={5} max={600} className="field" defaultValue={appointment?.durationMinutes ?? 60} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinic" htmlFor={`${prefix}-clinic`}>
          <input id={`${prefix}-clinic`} name="clinic" maxLength={120} className="field" defaultValue={appointment?.clinic} placeholder="Vanderbilt Family Medicine" />
        </Field>
        <Field label="Clinic phone" htmlFor={`${prefix}-phone`}>
          <input id={`${prefix}-phone`} name="phone" type="tel" maxLength={40} className="field" defaultValue={appointment?.phone} />
        </Field>
      </div>
      <Field label="Address" htmlFor={`${prefix}-address`}>
        <input id={`${prefix}-address`} name="address" maxLength={200} className="field" defaultValue={appointment?.address} />
      </Field>
      <Field label="Reason for the visit" htmlFor={`${prefix}-reason`}>
        <textarea id={`${prefix}-reason`} name="reason" rows={2} maxLength={1000} className="field" defaultValue={appointment?.reason} placeholder="Annual physical; ask about knee pain on transfers." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Staff going with them" htmlFor={`${prefix}-escort`} hint="They get reminders and document the visit.">
          <select id={`${prefix}-escort`} name="escortStaffId" className="field" defaultValue={appointment?.escortStaffId ?? ""}>
            <option value="">Not decided yet</option>
            {staff.map(member => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
          </select>
        </Field>
        <Field label="Transport" htmlFor={`${prefix}-transport`}>
          <input id={`${prefix}-transport`} name="transport" maxLength={200} className="field" defaultValue={appointment?.transport} placeholder="Home van, wheelchair ramp" />
        </Field>
      </div>
      <Field label="Before the visit" htmlFor={`${prefix}-prep`} hint="Fasting, paperwork, what to bring.">
        <textarea id={`${prefix}-prep`} name="prep" rows={2} maxLength={1000} className="field" defaultValue={appointment?.prep} placeholder="No food after midnight. Bring the medication list and insurance card." />
      </Field>
    </>
  );
}

type Row = {
  id: string;
  individualId: string;
  type: string;
  provider: string;
  clinic: string;
  scheduledAt: Date;
  status: "scheduled" | "completed" | "cancelled" | "missed";
  statusReason: string;
  documentedAt: Date | null;
  followUpNeeded: boolean;
  followUpBy: string | null;
  nextAppointmentId: string | null;
  medicationChanges: string;
  first: string;
  last: string;
  home: string | null;
  escort: string | null;
};

/* A list of appointments with a date block, who, what, who goes, and where it stands. */
export function AppointmentList({ rows, now, documentHours, showPerson = true, empty }: { rows: Row[]; now: number; documentHours: number; showPerson?: boolean; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const today = dateKey(new Date(now));
  return (
    <ul className="divide-y divide-line/60">
      {rows.map(row => {
        const state = visitState(row, now, documentHours, today, dateKey);
        const follow = followUpState(row, today);
        const badge = VISIT_STATE[state];
        return (
          <li key={row.id}>
            <Link href={`/app/appointments/${row.id}`} className="flex gap-4 px-5 py-3.5 hover:bg-panel/50">
              <span className={cn("grid w-14 shrink-0 place-items-center rounded-xl py-1.5 text-center", state === "today" ? "bg-plum-soft text-plum" : state === "upcoming" ? "bg-sky text-brand-deep" : "bg-panel text-mute")}>
                <span className="text-[10px] font-semibold uppercase">{fmt.weekday(dateKey(row.scheduledAt))}</span>
                <span className="font-display text-lg font-bold leading-none">{Number(dateKey(row.scheduledAt).slice(8))}</span>
                <span className="text-[10px]">{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(new Date(`${dateKey(row.scheduledAt)}T12:00:00Z`))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.type}{row.provider ? ` · ${row.provider}` : ""}</span>
                  <Badge tone={badge.tone}>{badge.text}</Badge>
                  {follow === "to_book" && <Badge tone="warn"><Repeat className="h-3 w-3" /> Follow-up to book</Badge>}
                  {follow === "overdue" && <Badge tone="bad"><Repeat className="h-3 w-3" /> Follow-up overdue</Badge>}
                  {row.medicationChanges && <Badge tone="plum"><Pill className="h-3 w-3" /> Medication change</Badge>}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mute">
                  {showPerson && <span className="font-semibold text-ink">{row.first} {row.last}{row.home ? ` · ${row.home}` : ""}</span>}
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmt.time(row.scheduledAt)}</span>
                  {row.clinic && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row.clinic}</span>}
                  <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{row.escort ?? "No escort yet"}</span>
                </span>
                {row.statusReason && (row.status === "cancelled" || row.status === "missed") && <span className="mt-0.5 block text-xs text-mute">{row.statusReason}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
