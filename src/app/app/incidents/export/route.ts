import { toCsv } from "@/lib/csv";
import { dateKey, label } from "@/lib/format";
import { requireUser } from "@/server/guard";
import { exportIncidents, parseIncidentQuery } from "@/server/queries/incidents";

const TZ = "America/Chicago";
const stamp = (at: Date | null) =>
  at ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at).replace(",", "") : "";

/* The incidents list as a spreadsheet, with the same filters and order as the screen. */
export async function GET(request: Request) {
  await requireUser();
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const rows = await exportIncidents(parseIncidentQuery(params));
  const csv = toCsv([
    ["Occurred (Central)", "Reported", "Person", "Home", "Category", "Severity", "Status", "Reportable", "Filing deadline", "Closed", "Reported by", "What happened", "What was done"],
    ...rows.map(row => [
      stamp(row.occurredAt),
      stamp(row.createdAt),
      row.first ? `${row.first} ${row.last}` : "",
      row.home ?? "",
      label("incidentCategory", row.category),
      label("incidentSeverity", row.severity),
      label("incidentStatus", row.status),
      row.reportable ? "Yes" : "No",
      row.reportable ? stamp(row.deadline) : "",
      stamp(row.closedAt),
      row.reporter ?? "",
      row.description,
      row.actionsTaken,
    ]),
  ]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="milestone-incidents-${dateKey()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
