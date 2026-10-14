import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ClipboardCheck, FileCheck2, FileWarning, Flag, MapPin, MessageSquareText, PencilLine, RotateCcw, Search, UserRound } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { PrintButton } from "@/components/app/PrintButton";
import { Avatar, Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { age, fmt, initials, label, labels } from "@/lib/format";
import {
  addIncidentNote,
  closeIncident,
  recordStateFiling,
  removeStateFiling,
  reopenIncident,
  startIncidentReview,
  updateIncidentDetails,
} from "@/server/actions/incidents";
import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { incidentRecord } from "@/server/queries/incidents";

export const metadata = { title: "Incident" };

const severityTone = { low: "neutral", moderate: "warn", high: "bad", critical: "bad" } as const;
const statusTone = { open: "warn", under_review: "brand", closed: "good" } as const;
const timelineStyle: Record<string, { icon: typeof Flag; tone: string; title: string }> = {
  reported: { icon: Flag, tone: "bg-accent-soft text-[#8a5a10]", title: "Reported" },
  note: { icon: MessageSquareText, tone: "bg-sky text-brand-deep", title: "Follow-up note" },
  change: { icon: PencilLine, tone: "bg-panel text-mute", title: "Details changed" },
  review: { icon: Search, tone: "bg-sky text-brand-deep", title: "Review started" },
  under_review: { icon: Search, tone: "bg-sky text-brand-deep", title: "Review started" },
  filing: { icon: FileCheck2, tone: "bg-sage-soft text-sage", title: "Filed with the state" },
  closed: { icon: CheckCircle2, tone: "bg-sage-soft text-sage", title: "Closed" },
  reopened: { icon: RotateCcw, tone: "bg-accent-soft text-[#8a5a10]", title: "Reopened" },
  open: { icon: RotateCcw, tone: "bg-accent-soft text-[#8a5a10]", title: "Reopened" },
};

function nowLocal(at: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function span(ms: number) {
  const hours = Math.abs(ms) / 3_600_000;
  return hours < 1 ? `${Math.max(1, Math.round(hours * 60))} minutes` : hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;
}

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [record, now] = await Promise.all([incidentRecord(id), requestTime()]);
  if (!record) notFound();
  const { incident, person, home, reporter, filedBy, deadline, hours, timeline, others } = record;
  const manager = canManage(user);
  const waitingToFile = incident.reportable && !incident.stateFiledAt;
  const left = deadline.getTime() - now;
  const years = person ? age(person.dob) : null;

  return (
    <div className="max-w-6xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/incidents" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-mute hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All incidents
        </Link>
        <PrintButton label="Print report" />
      </div>

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Incident report · {label("incidentCategory", incident.category)}</p>
          <h1 className="mt-1 text-3xl font-bold">
            {label("incidentCategory", incident.category)}
            {person ? ` · ${person.firstName} ${person.lastName}` : home ? ` · ${home}` : ""}
          </h1>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute">
            <span>Happened {fmt.dateTime(incident.occurredAt)}</span>
            {home && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{home}</span>}
            <span>Reported by {reporter ?? "staff"}, {fmt.dateTime(incident.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={severityTone[incident.severity]}>{label("incidentSeverity", incident.severity)} severity</Badge>
          <Badge tone={statusTone[incident.status]}>{label("incidentStatus", incident.status)}</Badge>
          {incident.reportable && <Badge tone="bad">Reportable</Badge>}
        </div>
      </header>

      {incident.reportable && (
        <section
          className={cn(
            "mb-6 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between",
            !waitingToFile ? "border-sage/30 bg-sage-soft" : left < 0 ? "border-flag/40 bg-flag-soft" : "border-accent/40 bg-accent-soft",
          )}
        >
          <div className="flex items-start gap-3">
            {waitingToFile ? <FileWarning className={cn("mt-0.5 h-6 w-6 shrink-0", left < 0 ? "text-flag" : "text-[#8a5a10]")} /> : <FileCheck2 className="mt-0.5 h-6 w-6 shrink-0 text-sage" />}
            <div>
              {waitingToFile ? (
                <>
                  <p className={cn("font-semibold", left < 0 ? "text-flag" : "text-[#8a5a10]")}>
                    {left < 0 ? `State filing is ${span(left)} overdue` : `${span(left)} left to file with the state`}
                  </p>
                  <p className="text-sm text-mute">Due by {fmt.dateTime(deadline)}, {hours} hours after it happened. It cannot be closed until the filing is recorded.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-sage">Filed with the state {fmt.dateTime(incident.stateFiledAt!)}</p>
                  <p className="text-sm text-mute">
                    {incident.stateReference ? `Reference ${incident.stateReference}` : "No reference recorded"}
                    {filedBy && ` · recorded by ${filedBy}`}
                    {incident.stateFiledAt!.getTime() > deadline.getTime() ? ` · ${span(incident.stateFiledAt!.getTime() - deadline.getTime())} after the deadline` : " · on time"}
                  </p>
                </>
              )}
            </div>
          </div>
          {manager && (
            <div className="no-print flex shrink-0 gap-2">
              {waitingToFile ? (
                <ModalForm action={recordStateFiling.bind(null, id)} title="Record the state filing" description="Enter it once the report has gone to the Department of Disability and Aging." triggerLabel="Record filing" triggerIcon="none" submitLabel="Save filing">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Filed at" htmlFor="filed-at"><input id="filed-at" name="filedAt" type="datetime-local" required className="field" defaultValue={nowLocal(now)} /></Field>
                    <Field label="State reference number" htmlFor="filed-ref" hint="Optional, from the state's confirmation."><input id="filed-ref" name="reference" maxLength={80} className="field" /></Field>
                  </div>
                </ModalForm>
              ) : (
                incident.status !== "closed" && <ConfirmAction action={removeStateFiling.bind(null, id)} label="Remove filing record" confirm="Remove the filing record? Only do this if it was entered by mistake." />
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Panel title="What happened" action={<span className="text-[11px] text-dim">Original report, kept as written</span>}>
            <p className="whitespace-pre-line p-5 text-sm leading-relaxed">{incident.description}</p>
          </Panel>

          <Panel
            title="What was done"
            action={
              manager ? (
                <ModalForm action={updateIncidentDetails.bind(null, id)} title="Edit incident details" description="The original account cannot be changed. Add anything new as a follow-up note." triggerLabel="Edit details" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save details">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category" htmlFor="ed-category">
                      <select id="ed-category" name="category" className="field" defaultValue={incident.category}>{Object.entries(labels.incidentCategory).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                    </Field>
                    <Field label="Severity" htmlFor="ed-severity">
                      <select id="ed-severity" name="severity" className="field" defaultValue={incident.severity}>{Object.entries(labels.incidentSeverity).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                    </Field>
                  </div>
                  <label className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-flag has-[:checked]:bg-flag-soft">
                    <input type="checkbox" name="reportable" defaultChecked={incident.reportable} className="h-4 w-4 accent-[#d2543f]" /> Reportable to the state
                  </label>
                  <Field label="What was done" htmlFor="ed-actions"><textarea id="ed-actions" name="actionsTaken" rows={4} maxLength={3000} className="field" defaultValue={incident.actionsTaken} /></Field>
                </ModalForm>
              ) : undefined
            }
          >
            <p className={cn("whitespace-pre-line p-5 text-sm leading-relaxed", !incident.actionsTaken && "text-[#8a5a10]")}>{incident.actionsTaken || "No actions recorded yet."}</p>
          </Panel>

          <Panel title={`Timeline (${timeline.length})`}>
            <ol className="relative space-y-5 p-5 before:absolute before:bottom-5 before:left-[34px] before:top-5 before:w-px before:bg-line">
              {timeline.map(entry => {
                const style = timelineStyle[entry.kind] ?? timelineStyle.note;
                return (
                  <li key={entry.id} className="relative flex gap-3">
                    <span className={cn("relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-white", style.tone)}>
                      <style.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <span className="font-semibold">{style.title}</span>
                        <span className="text-xs text-mute"> · {fmt.dateTime(entry.at)}{entry.by ? ` · ${entry.by}` : ""}</span>
                      </p>
                      {entry.body && entry.kind !== "reported" && <p className="mt-0.5 whitespace-pre-line text-mute">{entry.body}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="no-print border-t border-line p-5">
              <ActionForm action={addIncidentNote.bind(null, id)} submitLabel="Add note">
                <Field label="Add a follow-up note" htmlFor="note-body" hint="What you learned or did since. Everyone involved can see it.">
                  <textarea id="note-body" name="body" rows={3} required minLength={3} maxLength={3000} className="field" placeholder="Skin check this morning: mark has faded, no swelling." />
                </Field>
              </ActionForm>
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          {manager && (
            <Panel title="Next step">
              <div className="no-print space-y-3 p-5 text-sm">
                {incident.status === "open" && (
                  <>
                    <p className="text-mute">Start a review to look into what happened and what should change.</p>
                    <ConfirmAction action={startIncidentReview.bind(null, id)} label="Start review" />
                  </>
                )}
                {incident.status !== "closed" && (
                  <>
                    {waitingToFile && <p className="text-[#8a5a10]">Record the state filing first, then it can be closed.</p>}
                    <ModalForm action={closeIncident.bind(null, id)} title="Close incident" description="Closing needs an outcome. It is kept on the timeline." triggerLabel="Close incident" triggerIcon="none" submitLabel="Close incident">
                      <Field label="Outcome" htmlFor="close-outcome" hint="What was found, and what changes because of it.">
                        <textarea id="close-outcome" name="outcome" rows={4} required minLength={5} maxLength={3000} className="field" placeholder="Transfer technique reviewed with evening staff. Chair arm padded." />
                      </Field>
                    </ModalForm>
                  </>
                )}
                {incident.status === "closed" && (
                  <>
                    <p className="text-mute">Closed {incident.closedAt ? fmt.dateTime(incident.closedAt) : ""}. Reopen it if something new comes to light.</p>
                    <ModalForm action={reopenIncident.bind(null, id)} title="Reopen incident" triggerLabel="Reopen" triggerIcon="none" triggerTone="ghost" submitLabel="Reopen">
                      <Field label="Why it is being reopened" htmlFor="reopen-reason"><textarea id="reopen-reason" name="reason" rows={3} required minLength={3} maxLength={3000} className="field" /></Field>
                    </ModalForm>
                  </>
                )}
              </div>
            </Panel>
          )}

          {person ? (
            <Panel title="Person involved">
              <div className="p-5 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar initials={initials(person.firstName, person.lastName)} />
                  <div>
                    <Link href={`/app/individuals/${person.id}`} className="font-semibold hover:text-brand">{person.firstName} {person.lastName}</Link>
                    <p className="text-xs text-mute">{[years !== null ? `${years} years old` : null, label("serviceType", person.serviceType)].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 text-xs">
                  <div><dt className="label mb-0.5">Allergies</dt><dd className={person.allergies ? "font-semibold text-flag" : ""}>{person.allergies || "None known"}</dd></div>
                  {person.guardianName && <div><dt className="label mb-0.5">Guardian</dt><dd>{person.guardianName}{person.guardianPhone && <> · <a href={`tel:${person.guardianPhone}`} className="text-brand">{person.guardianPhone}</a></>}</dd></div>}
                </dl>
                <Link href={`/app/individuals/${person.id}`} className="btn-ghost btn-sm no-print mt-4 w-full"><UserRound className="h-4 w-4" /> Open {person.firstName}&apos;s profile</Link>
              </div>
            </Panel>
          ) : (
            <Panel title="Person involved"><Empty>No specific person.</Empty></Panel>
          )}

          {person && (
            <Panel title={`${person.firstName}'s other incidents`}>
              {others.length === 0 ? (
                <Empty>None before this one.</Empty>
              ) : (
                <ul className="divide-y divide-line/60">
                  {others.map(other => (
                    <li key={other.id}>
                      <Link href={`/app/incidents/${other.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-panel/50">
                        <span>
                          <span className="block font-semibold">{label("incidentCategory", other.category)}</span>
                          <span className="text-xs text-mute">{fmt.dateTime(other.occurredAt)}</span>
                        </span>
                        <Badge tone={severityTone[other.severity]}>{label("incidentSeverity", other.severity)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/app/incidents?person=${person.id}&period=all`} className="no-print block border-t border-line px-5 py-3 text-xs font-semibold text-brand">
                <ClipboardCheck className="mr-1 inline h-3.5 w-3.5" /> All of {person.firstName}&apos;s incidents
              </Link>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
