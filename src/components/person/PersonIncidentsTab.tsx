import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { fmt, label } from "@/lib/format";
import type { schema } from "@/server/db";
import { requestTime } from "@/server/clock";
import { personIncidents } from "@/server/queries/person";
import { MoreLink } from "./parts";

type Person = typeof schema.individuals.$inferSelect;
const severityTone = { low: "neutral", moderate: "warn", high: "bad", critical: "bad" } as const;
const statusTone = { open: "warn", under_review: "brand", closed: "good" } as const;

/* Every incident about this person, with a count by kind so patterns are easy to see. */
export async function PersonIncidentsTab({ id, person }: { id: string; person: Person }) {
  const [incidents, now] = await Promise.all([personIncidents(id), requestTime()]);
  const open = incidents.filter(incident => incident.status !== "closed").length;
  const reportable = incidents.filter(incident => incident.reportable).length;
  const unfiled = incidents.filter(incident => incident.reportable && !incident.stateFiledAt).length;
  const yearAgo = now - 365 * 86_400_000;
  const lastYear = incidents.filter(incident => incident.occurredAt.getTime() >= yearAgo).length;
  const byCategory = new Map<string, number>();
  for (const incident of incidents) byCategory.set(incident.category, (byCategory.get(incident.category) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge tone={open ? "warn" : "good"}>{open} open</Badge>
          <Badge tone="neutral">{lastYear} in the last 12 months</Badge>
          <Badge tone="plum">{reportable} reportable</Badge>
          {unfiled > 0 && <Badge tone="bad">{unfiled} not filed with the state</Badge>}
          {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, n]) => (
            <Badge key={category} tone="neutral">{label("incidentCategory", category)}: {n}</Badge>
          ))}
        </div>
        <div className="no-print flex shrink-0 gap-2">
          {incidents.length > 0 && <MoreLink href={`/app/incidents?person=${id}&period=all`}>Open in the incidents list</MoreLink>}
          {person.active && <Link href={`/app/incidents/new?individual=${id}`} className="btn-brand btn-sm"><AlertTriangle className="h-3.5 w-3.5" /> Report incident</Link>}
        </div>
      </div>

      <Panel>
        {incidents.length === 0 ? (
          <Empty>No incidents recorded for {person.firstName}.</Empty>
        ) : (
          <ol className="divide-y divide-line/60">
            {incidents.map(incident => (
              <li key={incident.id}>
                <Link href={`/app/incidents/${incident.id}`} className="block px-5 py-4 hover:bg-panel/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{label("incidentCategory", incident.category)}</span>
                    <Badge tone={severityTone[incident.severity]}>{label("incidentSeverity", incident.severity)}</Badge>
                    <Badge tone={statusTone[incident.status]}>{label("incidentStatus", incident.status)}</Badge>
                    {incident.reportable && (incident.stateFiledAt ? <Badge tone="good">Filed {fmt.day(incident.stateFiledAt)}</Badge> : <Badge tone="bad">Reportable, not filed</Badge>)}
                    <span className="ml-auto text-xs text-dim">{fmt.dateTime(incident.occurredAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{incident.description}</p>
                  {incident.actionsTaken && <p className="mt-1 line-clamp-1 text-xs text-sage">Done: {incident.actionsTaken}</p>}
                  <p className="mt-1 text-xs text-mute">{[incident.home, incident.reporter ? `reported by ${incident.reporter}` : null].filter(Boolean).join(" · ")}</p>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
