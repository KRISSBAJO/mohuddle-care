import { BellRing, CheckSquare, FileWarning, HeartPulse, MapPin, UserRound } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt } from "@/lib/format";
import { EVENT_GROUPS, INJURED_PARTIES, INTERVENTION_GROUPS, INVOLVEMENT_QUESTIONS, REGIONS } from "@/lib/reportable-events";
import { addIncidentNotification } from "@/server/actions/incidents";
import type { schema } from "@/server/db";

type Incident = typeof schema.incidents.$inferSelect;

const tierText = { tier1: "Tier 1", tier2: "Tier 2", reportable: "Reportable", "": "Not state reportable" } as const;

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-2.5 sm:grid-cols-[13rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wider text-mute">{term}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const none = <span className="text-dim">Not recorded</span>;

/* The Reportable Event Form as filed: event details, types by tier, interventions and notifications. */
export function ReportableEventView({ incident, parties, now, tier1Hours }: { incident: Incident; parties: string[]; now: number; tier1Hours: number }) {
  const hasForm = Boolean(incident.eventTypes.length || incident.otherEventText || incident.interventions.length || incident.reportingProvider || incident.notifications.length);
  const ticked = (keys: string[]) => new Set(keys);
  const types = ticked(incident.eventTypes);
  const done = ticked(incident.interventions);

  return (
    <>
      {hasForm && (
        <Panel title="Reportable Event Form" action={<Badge tone={incident.tier === "tier1" ? "bad" : incident.tier ? "warn" : "neutral"}>{tierText[incident.tier]}</Badge>}>
          {incident.tier === "tier1" && (() => {
            const reported = incident.notifications.find(item => /investigat|didd/i.test(item.party));
            const deadline = new Date((incident.discoveredAt ?? incident.occurredAt).getTime() + tier1Hours * 3_600_000);
            return (
              <p className={cn("border-b px-5 py-3 text-sm font-semibold", reported ? "border-sage/30 bg-sage-soft text-sage" : deadline.getTime() < now ? "border-flag/30 bg-flag-soft text-flag" : "border-accent bg-accent-soft text-[#8a5a10]")}>
                {reported
                  ? `Reported to DIDD Investigations${reported.at ? ` ${fmt.day(new Date(reported.at))} at ${fmt.time(new Date(reported.at))}` : ""}.`
                  : `Tier 1: report to DIDD Investigations by ${fmt.day(deadline)} at ${fmt.time(deadline)}${deadline.getTime() < now ? " (overdue)" : ""}, then record it under Notifications.`}
              </p>
            );
          })()}
          <dl className="divide-y divide-line/60">
            <Row term="Responsible provider">{incident.responsibleProvider || none}</Row>
            <Row term="Reporting provider">{incident.reportingProvider || none}</Row>
            {incident.personAlias && <Row term="Also known as">{incident.personAlias}</Row>}
            <Row term="Waiver and MCO">{[incident.waiverType, incident.mco, incident.mcoNumber && `MCO no. ${incident.mcoNumber}`].filter(Boolean).join(" · ") || none}</Row>
            <Row term="Event location">
              <span className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mute" />
                <span>
                  {[incident.eventLocation, [incident.eventAddress, incident.eventCity, [incident.eventState, incident.eventZip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Not recorded"}
                  {incident.eventRegion && <span className="text-mute"> · {REGIONS[incident.eventRegion as keyof typeof REGIONS]}</span>}
                </span>
              </span>
            </Row>
            <Row term="Date and time">
              {incident.occurredUnknown ? <span className="text-[#8a5a10]">Unknown. </span> : `${fmt.dayLong(dateKey(incident.occurredAt))} at ${fmt.time(incident.occurredAt)}. `}
              {incident.discoveredAt && <span>Discovered {fmt.dayLong(dateKey(incident.discoveredAt))} at {fmt.time(incident.discoveredAt)}.</span>}
            </Row>
            <Row term="This event was">{incident.witnessType ? `${incident.witnessType === "witnessed" ? "Witnessed" : "Discovered"}${incident.witnessedBy ? ` by ${incident.witnessedBy}` : ""}` : none}</Row>
            <Row term="Injury to the person">{incident.injury === "yes" ? <span className="font-semibold text-flag">Yes. {incident.injuryDetails}</span> : incident.injury === "no" ? "No" : none}</Row>
            {INVOLVEMENT_QUESTIONS.filter(question => incident.involvement[question.key]).map(question => (
              <Row key={question.key} term={question.label.replace(/^(Does|Is) the person( supported)? /i, "").replace(/\?$/, "")}>{incident.involvement[question.key] === "yes" ? "Yes" : "No"}</Row>
            ))}
          </dl>

          <div className="border-t border-line p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><FileWarning className="h-4 w-4 text-flag" /> Type of event</p>
            {incident.eventTypes.length === 0 && !incident.otherEventText ? (
              <p className="text-sm text-mute">No state event type was ticked.</p>
            ) : (
              <div className="space-y-3">
                {EVENT_GROUPS.filter(group => group.events.some(event => types.has(event.key))).map(group => (
                  <div key={group.key}>
                    <p className={cn("text-xs font-bold uppercase tracking-wider", group.key === "tier1" ? "text-flag" : group.key === "tier2" ? "text-[#8a5a10]" : "text-mute")}>{group.title}</p>
                    <ul className="mt-1 space-y-1">
                      {group.events.filter(event => types.has(event.key)).map(event => (
                        <li key={event.key} className="flex items-start gap-2 text-sm">
                          <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                          <span>
                            {event.label}
                            {event.key === "b_injury_to_other" && incident.injuredParties.length > 0 && <span className="text-mute"> · {incident.injuredParties.map(key => INJURED_PARTIES[key as keyof typeof INJURED_PARTIES] ?? key).join(", ")}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {incident.otherEventText && <p className="text-sm"><span className="font-semibold">Other: </span>{incident.otherEventText}</p>}
              </div>
            )}
          </div>

          <div className="border-t border-line p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><HeartPulse className="h-4 w-4 text-brand" /> Interventions</p>
            {incident.interventions.length === 0 ? (
              <p className="text-sm text-mute">None recorded.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {INTERVENTION_GROUPS.filter(group => group.items.some(item => done.has(item.key))).map(group => (
                  <div key={group.title}>
                    <p className="text-xs font-bold uppercase tracking-wider text-mute">{group.title}</p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {group.items.filter(item => done.has(item.key)).map(item => (
                        <li key={item.key}>
                          {item.label}
                          {item.key === "i_prn_psychotropic" && incident.prnGivenBy && <span className="text-mute"> · given by {incident.prnGivenBy}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel title={`Notifications (${incident.notifications.length})`} action={<BellRing className="h-4 w-4 text-mute" />}>
        {incident.notifications.length === 0 ? (
          <Empty>Nobody has been recorded as notified yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Who</th><th>When</th><th>Comments</th></tr></thead>
              <tbody>
                {incident.notifications.map((item, index) => (
                  <tr key={`${item.party}-${index}`}>
                    <td className="font-semibold">{item.party}{item.name && <span className="block text-xs font-normal text-mute">{item.name}</span>}</td>
                    <td className="whitespace-nowrap">{item.at ? `${fmt.day(new Date(item.at))} ${fmt.time(new Date(item.at))}` : "—"}</td>
                    <td className="text-sm text-mute">{item.comments || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="border-t border-line">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-brand">Record a notification</summary>
          <div className="px-5 pb-5">
            <ActionForm action={addIncidentNotification.bind(null, incident.id)} submitLabel="Save notification">
              <Field label="Who was notified" htmlFor="notify-party"><Select id="notify-party" name="party" required options={parties.map(party => ({ value: party, label: party }))} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date" htmlFor="notify-date"><input id="notify-date" name="date" type="date" required max={dateKey(new Date(now))} className="field" defaultValue={dateKey(new Date(now))} /></Field>
                <Field label="Time" htmlFor="notify-time"><input id="notify-time" name="time" type="time" required className="field" /></Field>
              </div>
              <Field label="Name (investigator or police department)" htmlFor="notify-name"><input id="notify-name" name="name" maxLength={160} className="field" /></Field>
              <Field label="Comments" htmlFor="notify-comments"><input id="notify-comments" name="comments" maxLength={1000} className="field" /></Field>
            </ActionForm>
          </div>
        </details>
      </Panel>
      {!hasForm && <p className="flex items-center gap-1.5 text-xs text-dim"><UserRound className="h-3.5 w-3.5" /> Reported before the Reportable Event Form was added, so only the summary is shown.</p>}
    </>
  );
}
