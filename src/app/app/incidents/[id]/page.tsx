import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, Panel } from "@/components/app/ui";
import { fmt, label } from "@/lib/format";
import { setIncidentStatus } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { incidentDetail } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";
import { requestTime } from "@/server/clock";

export const metadata = { title: "Incident" };

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [row, settings] = await Promise.all([incidentDetail(id), getSettings()]);
  if (!row) notFound();
  const { incident } = row;
  const deadline = new Date(incident.occurredAt.getTime() + settings.incident_report_hours * 3_600_000);
  const overdue = incident.reportable && incident.status !== "closed" && deadline.getTime() < await requestTime();

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={label("incidentCategory", incident.category)}
        title={`${fmt.dateTime(incident.occurredAt)}${row.first ? ` · ${row.first} ${row.last}` : ""}`}
        description={`Reported by ${row.reporter ?? "staff"} on ${fmt.dateTime(incident.createdAt)}${row.home ? ` · ${row.home}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={incident.severity === "low" ? "neutral" : incident.severity === "moderate" ? "warn" : "bad"}>{label("incidentSeverity", incident.severity)}</Badge>
            <Badge tone={incident.status === "closed" ? "good" : incident.status === "under_review" ? "brand" : "warn"}>{label("incidentStatus", incident.status)}</Badge>
          </div>
        }
      />
      {incident.reportable && (
        <p className={`mb-6 rounded-xl px-4 py-3 text-sm font-medium ${overdue ? "bg-flag-soft text-flag" : "bg-accent-soft text-[#8a5a10]"}`}>
          Reportable to the state. Filing deadline {fmt.dateTime(deadline)}{overdue ? " has passed." : "."}
        </p>
      )}
      <Panel title="What happened"><p className="whitespace-pre-line p-5 text-sm leading-relaxed">{incident.description}</p></Panel>
      <Panel title="What was done" className="mt-6"><p className="whitespace-pre-line p-5 text-sm leading-relaxed">{incident.actionsTaken || "Nothing recorded yet."}</p></Panel>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {row.individualId && <Link href={`/app/individuals/${row.individualId}`} className="btn-ghost btn-sm">Open {row.first}&apos;s page</Link>}
        {canManage(user) && incident.status !== "under_review" && incident.status !== "closed" && (
          <form action={setIncidentStatus.bind(null, id, "under_review")}><button className="btn-ghost btn-sm">Start review</button></form>
        )}
        {canManage(user) && incident.status !== "closed" && (
          <form action={setIncidentStatus.bind(null, id, "closed")}><button className="btn-brand btn-sm">Close incident</button></form>
        )}
        {canManage(user) && incident.status === "closed" && (
          <form action={setIncidentStatus.bind(null, id, "open")}><button className="btn-ghost btn-sm">Reopen</button></form>
        )}
      </div>
    </div>
  );
}
