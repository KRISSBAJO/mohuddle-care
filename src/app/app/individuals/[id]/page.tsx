import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ClipboardList, Phone } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { IndividualFields } from "@/components/app/IndividualForm";
import { ModalForm } from "@/components/app/ModalForm";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { age, dateKey, fmt, initials, label } from "@/lib/format";
import { dischargeIndividual, readmitIndividual } from "@/server/actions/editing";
import { addGoal, addMedication, setGoalStatus, updateIndividual } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { individualDetail, listHomes } from "@/server/queries/hub";

export const metadata = { title: "Person" };

const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;

export default async function IndividualPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, homes] = await Promise.all([individualDetail(id), listHomes()]);
  if (!detail) notFound();
  const { person, home, goals, meds, stoppedMeds, logs, incidents } = detail;
  const years = age(person.dob);
  const manager = canManage(user);
  const active = person.active;
  const activeGoals = goals.filter(goal => goal.status === "active").length;
  const openIncidents = incidents.filter(incident => incident.status !== "closed").length;
  const today = dateKey();
  const lastLog = logs[0]?.logDate ?? null;

  return (
    <>
      <Link href="/app/individuals" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All people
      </Link>
      <PageHeader
        eyebrow={label("serviceType", person.serviceType)}
        title={`${person.firstName} ${person.lastName}`}
        description={[years !== null ? `${years} years old` : null, home ? `${person.active ? "Lives" : "Lived"} at ${home.name}` : "Not in a Milestone home", person.admittedAt ? `Supported since ${fmt.day(person.admittedAt)}` : null].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            {manager && (
              <ModalForm
                action={updateIndividual.bind(null, id)}
                title={`Edit ${person.firstName}'s details`}
                triggerLabel="Edit details"
                triggerIcon="pencil"
                triggerTone="ghost"
                submitLabel="Save details"
              >
                <IndividualFields homes={homes} person={person} prefix="edit-person" />
              </ModalForm>
            )}
            {active && <Link href={`/app/incidents/new?individual=${id}`} className="btn-ghost btn-sm"><AlertTriangle className="h-3.5 w-3.5" /> Incident</Link>}
            {active && <Link href={`/app/daily-logs/new?individual=${id}`} className="btn-brand btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Daily log</Link>}
          </div>
        }
      />
      {saved === "log" && <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Daily log saved. Thank you.</p>}
      {!active && (
        <p className="mb-6 rounded-xl bg-panel px-4 py-3 text-sm font-medium text-mute">
          Support ended{person.dischargedAt ? ` on ${fmt.dayLong(person.dischargedAt)}` : ""}.{person.dischargeReason && ` ${person.dischargeReason.replace(/[.!?]?$/, ".")}`} Their records stay on file.
        </p>
      )}

      {saved === "created" && (
        <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">
          {person.firstName} has been added. Next, use Edit details for support notes and contacts, then add goals and medications.
        </p>
      )}
      {saved === "medication" && <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Medication updated. The medication record follows from now on.</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Active goals", String(activeGoals), "neutral"],
          ["Medications", String(meds.length), "neutral"],
          ["Last daily log", lastLog ? (lastLog === today ? "Today" : fmt.day(lastLog)) : "Never", lastLog === today ? "good" : "warn"],
          ["Open incidents", String(openIncidents), openIncidents ? "warn" : "good"],
        ].map(([title, value, tone]) => (
          <div key={title} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${tone === "warn" ? "text-[#8a5a10]" : tone === "good" ? "text-sage" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="How to support this person well">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <Avatar initials={initials(person.firstName, person.lastName)} size="lg" />
                <p className="whitespace-pre-line text-sm leading-relaxed">{person.supportNotes || "No support notes yet. Coordinators add these with Edit details."}</p>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
                <div><dt className="label">Allergies</dt><dd className={person.allergies ? "font-semibold text-flag" : ""}>{person.allergies || "None known"}</dd></div>
                <div><dt className="label">Diagnoses</dt><dd>{person.diagnoses || "—"}</dd></div>
                <div><dt className="label">Guardian</dt><dd>{person.guardianName || "—"} {person.guardianPhone && <a href={`tel:${person.guardianPhone}`} className="ml-1 inline-flex items-center gap-1 text-brand"><Phone className="h-3 w-3" />{person.guardianPhone}</a>}</dd></div>
                <div><dt className="label">Emergency contact</dt><dd>{person.emergencyContact || "—"} {person.emergencyPhone && <a href={`tel:${person.emergencyPhone}`} className="ml-1 inline-flex items-center gap-1 text-brand"><Phone className="h-3 w-3" />{person.emergencyPhone}</a>}</dd></div>
              </dl>
            </div>
          </Panel>

          <Panel title="Recent daily logs">
            {logs.length === 0 ? (
              <Empty>No logs yet.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {logs.map(log => (
                  <li key={log.id} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{fmt.dayLong(log.logDate)}</p>
                      <Badge tone={moodTone[log.mood]}>{label("mood", log.mood)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-mute">{log.activities || log.notes || "No narrative written."}</p>
                    {log.goalProgress && <p className="mt-1 text-xs text-sage">Goals: {log.goalProgress}</p>}
                    {log.health && <p className="mt-1 text-xs text-plum">Health: {log.health}</p>}
                    <p className="mt-1 text-xs text-dim">{log.staff ?? "Staff"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Incidents">
            {incidents.length === 0 ? (
              <Empty>No incidents recorded.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {incidents.map(incident => (
                  <li key={incident.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <Link href={`/app/incidents/${incident.id}`} className="font-semibold hover:text-brand">{label("incidentCategory", incident.category)} · {fmt.dateTime(incident.occurredAt)}</Link>
                    <Badge tone={incident.status === "closed" ? "good" : "warn"}>{label("incidentStatus", incident.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Plan goals"
            action={
              active ? (
                <ModalForm action={addGoal} title="Add a plan goal" description="Write it in the person's own words where you can." triggerLabel="Add goal" triggerTone="ghost" submitLabel="Add goal">
                  <input type="hidden" name="individualId" value={id} />
                  <Field label="Goal" htmlFor="add-goal-title"><input id="add-goal-title" name="title" required minLength={3} maxLength={160} className="field" placeholder="Ride the bus to day program independently" /></Field>
                  <Field label="Details" htmlFor="add-goal-description"><textarea id="add-goal-description" name="description" rows={3} maxLength={1000} className="field" /></Field>
                  <Field label="Target date" htmlFor="add-goal-target"><input id="add-goal-target" name="targetDate" type="date" className="field" /></Field>
                </ModalForm>
              ) : undefined
            }
          >
            {goals.length === 0 ? <Empty>No goals yet.</Empty> : (
              <ul className="divide-y divide-line/60">
                {goals.map(goal => (
                  <li key={goal.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{goal.title}</p>
                        {goal.description && <p className="text-xs text-mute">{goal.description}</p>}
                        {goal.targetDate && <p className="text-xs text-dim">Target {fmt.day(goal.targetDate)}</p>}
                      </div>
                      <Badge tone={goal.status === "met" ? "good" : goal.status === "paused" ? "neutral" : "brand"}>{goal.status}</Badge>
                    </div>
                    {goal.status === "active" && (
                      <div className="mt-2 flex gap-3 text-xs">
                        <form action={setGoalStatus.bind(null, goal.id, id, "met")}><button className="font-semibold text-sage">Mark met</button></form>
                        <form action={setGoalStatus.bind(null, goal.id, id, "paused")}><button className="font-semibold text-mute">Pause</button></form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

          </Panel>

          <Panel
            title="Medications"
            action={
              manager && active ? (
                <ModalForm action={addMedication} title="Add a medication" description="Doses start from now. Earlier times today are not added as late." triggerLabel="Add medication" triggerTone="ghost" submitLabel="Add medication">
                  <input type="hidden" name="individualId" value={id} />
                  <Field label="Name" htmlFor="add-med-name"><input id="add-med-name" name="name" required minLength={2} maxLength={120} className="field" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Dose" htmlFor="add-med-dose"><input id="add-med-dose" name="dose" required maxLength={80} className="field" placeholder="10 mg" /></Field>
                    <Field label="Route" htmlFor="add-med-route"><input id="add-med-route" name="route" maxLength={40} className="field" defaultValue="oral" /></Field>
                  </div>
                  <Field label="Times" htmlFor="add-med-times" hint="24-hour, separated by commas"><input id="add-med-times" name="times" required className="field" placeholder="08:00, 20:00" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Prescriber" htmlFor="add-med-prescriber"><input id="add-med-prescriber" name="prescriber" maxLength={120} className="field" /></Field>
                    <Field label="Instructions" htmlFor="add-med-instructions"><input id="add-med-instructions" name="instructions" maxLength={1000} className="field" placeholder="With food" /></Field>
                  </div>
                </ModalForm>
              ) : undefined
            }
          >
            {meds.length === 0 ? <Empty>No active medications.</Empty> : (
              <ul className="divide-y divide-line/60">
                {meds.map(med => (
                  <li key={med.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-semibold">{med.name} <span className="font-normal text-mute">{med.dose}, {med.route}</span></p>
                      <p className="text-xs text-mute">{med.times.join(", ")}{med.instructions && ` · ${med.instructions}`}</p>
                      {med.prescriber && <p className="text-xs text-dim">{med.prescriber}{med.startedAt ? ` · since ${fmt.day(med.startedAt)}` : ""}</p>}
                    </div>
                    {manager && <Link href={`/app/individuals/${id}/medications/${med.id}`} className="shrink-0 text-xs font-semibold text-brand">Change or stop</Link>}
                  </li>
                ))}
              </ul>
            )}
            {stoppedMeds.length > 0 && (
              <details className="border-t border-line">
                <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-mute">Stopped and earlier orders ({stoppedMeds.length})</summary>
                <ul className="divide-y divide-line/60 pb-2">
                  {stoppedMeds.map(med => (
                    <li key={med.id} className="px-5 py-2.5 text-xs text-mute">
                      <p><span className="font-semibold text-ink">{med.name}</span> {med.dose}, {med.times.join(", ")}</p>
                      <p>{med.stoppedAt ? `Stopped ${fmt.dateTime(med.stoppedAt)}` : "Stopped"}{med.stopReason && ` · ${med.stopReason}`}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}

          </Panel>

          {manager && (
            <Panel title="Care status">
              <div className="space-y-3 p-5 text-sm">
                {active ? (
                  <>
                    <p className="text-mute">
                      When support ends, {person.firstName} leaves the daily lists, their place in a home is freed and upcoming
                      medication doses stop. Logs, goals and incidents stay on record.
                    </p>
                    <ModalForm
                      action={dischargeIndividual.bind(null, id)}
                      title={`End support for ${person.firstName}`}
                      description="This can be undone later with Readmit."
                      triggerLabel="End support"
                      triggerIcon="none"
                      triggerTone="ghost"
                      submitLabel="End support"
                    >
                      <Field label="Last day of support" htmlFor="discharge-date"><input id="discharge-date" name="date" type="date" required className="field" defaultValue={today} /></Field>
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
      </div>
    </>
  );
}
