import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { fmt, label } from "@/lib/format";
import { requireUser } from "@/server/guard";
import { listIncidents } from "@/server/queries/hub";

export const metadata = { title: "Incidents" };
const severityTone = { low: "neutral", moderate: "warn", high: "bad", critical: "bad" } as const;
const filters = [["", "All"], ["open", "Open"], ["under_review", "Under review"], ["closed", "Closed"]] as const;

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { status } = await searchParams;
  const filter = status === "open" || status === "under_review" || status === "closed" ? status : undefined;
  const incidents = await listIncidents(filter);
  return (
    <>
      <PageHeader
        eyebrow="Incidents"
        title="Incident reports"
        description="Anything that affected someone's safety, health or rights. Reportable incidents go to the state within the hours set in Settings."
        action={<Link href="/app/incidents/new" className="btn-brand"><Plus className="h-4 w-4" /> Report an incident</Link>}
      />
      <div className="mb-4 flex gap-2">
        {filters.map(([value, text]) => (
          <Link key={value} href={value ? `/app/incidents?status=${value}` : "/app/incidents"} className={`chip ${(filter ?? "") === value ? "bg-ink text-white" : "bg-panel text-mute"}`}>{text}</Link>
        ))}
      </div>
      <Panel>
        {incidents.length === 0 ? <Empty>No incidents match.</Empty> : (
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead>
            <tbody>
              {incidents.map(incident => (
                <tr key={incident.id}>
                  <td className="whitespace-nowrap"><Link href={`/app/incidents/${incident.id}`} className="font-semibold hover:text-brand">{fmt.dateTime(incident.occurredAt)}</Link></td>
                  <td>{incident.first ? `${incident.first} ${incident.last}` : incident.home ?? "—"}</td>
                  <td>{label("incidentCategory", incident.category)} {incident.reportable && <Badge tone="bad" className="ml-1">Reportable</Badge>}</td>
                  <td><Badge tone={severityTone[incident.severity]}>{label("incidentSeverity", incident.severity)}</Badge></td>
                  <td><Badge tone={incident.status === "closed" ? "good" : incident.status === "under_review" ? "brand" : "warn"}>{label("incidentStatus", incident.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
