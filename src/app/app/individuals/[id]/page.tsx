import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ClipboardList, Pencil, Phone, Pill, Target } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { age, fmt, initials, label } from "@/lib/format";
import { addGoal, addMedication, setGoalStatus } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { individualDetail } from "@/server/queries/hub";

const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;

export default async function IndividualPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  const detail = await individualDetail(id);
  if (!detail) notFound();
  const { person, home, goals, meds, logs, incidents } = detail;
  const years = age(person.dob);
  const manager = canManage(user);

  return (
    <>
      <PageHeader
        eyebrow={label("serviceType", person.serviceType)}
        title={`${person.firstName} ${person.lastName}`}
        description={[years !== null ? `${years} years old` : null, home ? `Lives at ${home.name}` : "Not in a Milestone home", person.admittedAt ? `Supported since ${fmt.day(person.admittedAt)}` : null].filter(Boolean).join(" · ")}
        action={
          <div className="flex gap-2">
            {manager && <Link href={`/app/individuals/${id}/edit`} className="btn-ghost btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit</Link>}
            <Link href={`/app/daily-logs/new?individual=${id}`} className="btn-brand btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Daily log</Link>
            <Link href={`/app/incidents/new?individual=${id}`} className="btn-ghost btn-sm"><AlertTriangle className="h-3.5 w-3.5" /> Incident</Link>
          </div>
        }
      />
      {saved === "log" && <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Daily log saved. Thank you.</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="How to support this person well">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <Avatar initials={initials(person.firstName, person.lastName)} size="lg" />
                <p className="whitespace-pre-line text-sm leading-relaxed">{person.supportNotes || "No support notes yet. Coordinators add these from the edit page."}</p>
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
          <Panel title="Plan goals">
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
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-brand"><Target className="mr-1 inline h-3.5 w-3.5" /> Add a goal</summary>
              <div className="px-5 pb-5">
                <ActionForm action={addGoal} submitLabel="Add goal">
                  <input type="hidden" name="individualId" value={id} />
                  <Field label="Goal" htmlFor="goal-title"><input id="goal-title" name="title" required className="field" placeholder="Ride the bus to day program independently" /></Field>
                  <Field label="Details" htmlFor="goal-description"><textarea id="goal-description" name="description" rows={2} className="field" /></Field>
                  <Field label="Target date" htmlFor="goal-target"><input id="goal-target" name="targetDate" type="date" className="field" /></Field>
                </ActionForm>
              </div>
            </details>
          </Panel>

          <Panel title="Medications">
            {meds.length === 0 ? <Empty>No active medications.</Empty> : (
              <ul className="divide-y divide-line/60">
                {meds.map(med => (
                  <li key={med.id} className="px-5 py-3 text-sm">
                    <p className="font-semibold">{med.name} <span className="font-normal text-mute">{med.dose}, {med.route}</span></p>
                    <p className="text-xs text-mute">{med.times.join(", ")}{med.instructions && ` · ${med.instructions}`}</p>
                  </li>
                ))}
              </ul>
            )}
            {manager && (
              <details className="border-t border-line">
                <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-brand"><Pill className="mr-1 inline h-3.5 w-3.5" /> Add a medication</summary>
                <div className="px-5 pb-5">
                  <ActionForm action={addMedication} submitLabel="Add medication">
                    <input type="hidden" name="individualId" value={id} />
                    <Field label="Name" htmlFor="med-name"><input id="med-name" name="name" required className="field" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Dose" htmlFor="med-dose"><input id="med-dose" name="dose" required className="field" placeholder="10 mg" /></Field>
                      <Field label="Route" htmlFor="med-route"><input id="med-route" name="route" className="field" defaultValue="oral" /></Field>
                    </div>
                    <Field label="Times" htmlFor="med-times" hint="24-hour, separated by commas"><input id="med-times" name="times" required className="field" placeholder="08:00, 20:00" /></Field>
                    <Field label="Prescriber" htmlFor="med-prescriber"><input id="med-prescriber" name="prescriber" className="field" /></Field>
                    <Field label="Instructions" htmlFor="med-instructions"><input id="med-instructions" name="instructions" className="field" placeholder="With food" /></Field>
                  </ActionForm>
                </div>
              </details>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
