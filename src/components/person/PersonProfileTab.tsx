import Link from "next/link";
import { CircleStop, ClipboardPen, Flag, Pill, PlayCircle, ShieldAlert, Target } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { age, dateKey, fmt, label } from "@/lib/format";
import { dischargeIndividual, readmitIndividual } from "@/server/actions/editing";
import type { schema } from "@/server/db";
import { personHistory, type HistoryEvent } from "@/server/queries/person";

type Person = typeof schema.individuals.$inferSelect;
type Home = typeof schema.homes.$inferSelect;

const eventIcon: Record<HistoryEvent["kind"], typeof Flag> = { start: PlayCircle, end: CircleStop, edit: ClipboardPen, goal: Target, med: Pill, incident: ShieldAlert };
const eventTone: Record<HistoryEvent["kind"], string> = {
  start: "bg-sage-soft text-sage",
  end: "bg-panel text-mute",
  edit: "bg-sky text-brand-deep",
  goal: "bg-sky text-brand-deep",
  med: "bg-plum-soft text-plum",
  incident: "bg-flag-soft text-flag",
};

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wider text-mute">{term}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Phone({ number }: { number: string }) {
  return number ? <a href={`tel:${number}`} className="font-semibold text-brand">{number}</a> : <span className="text-mute">No phone</span>;
}

/* Who the person is, who to call, how to support them, and the life of the record. */
export async function PersonProfileTab({ id, person, home, manager }: { id: string; person: Person; home: Home | null; manager: boolean }) {
  const history = await personHistory(id, person);
  const years = age(person.dob);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Panel title="Personal details">
          <dl className="divide-y divide-line/60">
            <Row term="Full name">{person.firstName} {person.lastName}</Row>
            <Row term="Date of birth">{person.dob ? `${fmt.dayLong(person.dob)}${years !== null ? ` (${years})` : ""}` : <span className="text-mute">Not recorded</span>}</Row>
            <Row term="Service">{label("serviceType", person.serviceType)}</Row>
            <Row term="Home">{home ? <Link href={`/app/homes/${home.id}`} className="font-semibold text-brand">{home.name}</Link> : <span className="text-mute">Not in a Milestone home</span>}{home?.address ? <span className="text-mute"> · {[home.address, home.city].filter(Boolean).join(", ")}</span> : null}</Row>
            <Row term="Supported since">{person.admittedAt ? fmt.dayLong(person.admittedAt) : <span className="text-mute">Not recorded</span>}</Row>
            {!person.active && <Row term="Support ended">{person.dischargedAt ? fmt.dayLong(person.dischargedAt) : "Yes"}{person.dischargeReason && <span className="text-mute"> · {person.dischargeReason}</span>}</Row>}
            <Row term="Record created">{fmt.dayLong(dateKey(person.createdAt))}</Row>
          </dl>
        </Panel>

        <Panel title="Contacts">
          <dl className="divide-y divide-line/60">
            <Row term="Guardian">{person.guardianName ? <>{person.guardianName} · <Phone number={person.guardianPhone} /></> : <span className="text-mute">None recorded</span>}</Row>
            <Row term="Emergency contact">{person.emergencyContact ? <>{person.emergencyContact} · <Phone number={person.emergencyPhone} /></> : <span className="text-mute">None recorded</span>}</Row>
          </dl>
        </Panel>

        <Panel title={`How to support ${person.firstName} well`}>
          <p className="whitespace-pre-line p-5 text-sm leading-relaxed">{person.supportNotes || <span className="text-mute">No support notes yet. Coordinators add these with Edit details.</span>}</p>
        </Panel>

        {manager && (
          <Panel title="Care status">
            <div className="space-y-3 p-5 text-sm">
              {person.active ? (
                <>
                  <p className="text-mute">
                    When support ends, {person.firstName} leaves the daily lists, their place in a home is freed and upcoming medication doses stop. Logs, goals and incidents stay on record.
                  </p>
                  <ModalForm action={dischargeIndividual.bind(null, id)} title={`End support for ${person.firstName}`} description="This can be undone later with Readmit." triggerLabel="End support" triggerIcon="none" triggerTone="ghost" submitLabel="End support">
                    <Field label="Last day of support" htmlFor="discharge-date"><input id="discharge-date" name="date" type="date" required className="field" defaultValue={dateKey()} /></Field>
                    <Field label="Reason" htmlFor="discharge-reason" hint="For example moved to another provider or moved out of state.">
                      <textarea id="discharge-reason" name="reason" rows={3} required minLength={3} maxLength={500} className="field" />
                    </Field>
                  </ModalForm>
                </>
              ) : (
                <>
                  <p className="text-mute">Readmitting lists {person.firstName} again. If their old place is taken or the home is closed, they come back without a home so you can choose one.</p>
                  <ConfirmAction action={readmitIndividual.bind(null, id)} label="Readmit" confirm={`Readmit ${person.firstName} ${person.lastName}?`} />
                </>
              )}
            </div>
          </Panel>
        )}
      </div>

      <Panel title="Record history">
        {history.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ol className="relative px-5 py-4">
            <span className="absolute bottom-6 left-[2.15rem] top-6 w-px bg-line" aria-hidden="true" />
            {history.map((event, index) => {
              const Icon = eventIcon[event.kind];
              return (
                <li key={`${event.at.getTime()}-${index}`} className="relative flex gap-3 py-2.5">
                  <span className={cn("z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white", eventTone[event.kind])}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 pt-1 text-sm">
                    <p className="font-semibold">{event.title}</p>
                    {event.detail && <p className="text-mute first-letter:uppercase">{event.detail}</p>}
                    <p className="text-xs text-dim">{event.kind === "start" && event.title === "Support started" ? fmt.dayLong(dateKey(event.at)) : fmt.dateTime(event.at)}{event.by ? ` · ${event.by}` : ""}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}
