import Link from "next/link";
import { AlertOctagon, AlertTriangle, ClipboardList, Download, FileWarning, Plus, Search, TrendingDown, TrendingUp } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { listHref, Pagination, SortHeader } from "@/components/app/ListControls";
import { Avatar, Badge, Empty, PageHeader, Panel, Stat } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, initials, label, labels } from "@/lib/format";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import {
  incidentAttention,
  incidentDefaults,
  incidentFilterOptions,
  incidentPageSizes,
  incidentPeriods,
  incidentSorts,
  incidentStatusFilters,
  naturalDir,
  parseIncidentQuery,
  searchIncidents,
  type IncidentQuery,
} from "@/server/queries/incidents";

export const metadata = { title: "Incidents" };

const severityTone = { low: "neutral", moderate: "warn", high: "bad", critical: "bad" } as const;
const statusTone = { open: "warn", under_review: "brand", closed: "good" } as const;

/* Links leave out the direction when it is the sort's natural one, which the page then assumes. */
const hrefWith = (query: IncidentQuery, changes: Partial<IncidentQuery>) => {
  const sort = changes.sort ?? query.sort;
  return listHref("/app/incidents", { ...incidentDefaults, dir: naturalDir(sort) }, query, changes);
};

function IncidentSort({ query, sort, children }: { query: IncidentQuery; sort: IncidentQuery["sort"]; children: React.ReactNode }) {
  const active = query.sort === sort;
  const dir = active ? (query.dir === "asc" ? "desc" : "asc") : naturalDir(sort);
  return (
    <SortHeader active={active} dir={query.dir} href={hrefWith(query, { sort, dir, page: 1 })}>
      {children}
    </SortHeader>
  );
}

function timeLeft(ms: number) {
  const hours = Math.abs(ms) / 3_600_000;
  const text = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} days`;
  return ms >= 0 ? `${text} left` : `${text} overdue`;
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const query = parseIncidentQuery(await searchParams);
  const [result, options, now] = await Promise.all([searchIncidents(query), incidentFilterOptions(), requestTime()]);
  const { rows, total, page, pages, summary, byCategory, hours } = result;
  const current = { ...query, page };
  const filtered =
    query.q || query.category || query.severity || query.home || query.person || query.reportable !== "any" || query.attention !== "any" || query.status !== "all" || query.period !== "90";
  const trend = summary.last30 - summary.prior30;
  const maxCategory = Math.max(1, ...byCategory.map(row => row.n));
  const exportHref = hrefWith(current, { page: 1 }).replace("/app/incidents", "/app/incidents/export");
  const tile = (changes: Partial<IncidentQuery>) => hrefWith({ ...incidentDefaults, period: "all" }, changes);

  return (
    <>
      <PageHeader
        eyebrow="Incidents"
        title="Incident reports"
        description={`Anything that affected someone's safety, health or rights. Reportable incidents must be filed with the state within ${hours} hours.`}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={exportHref} className="btn-ghost btn-sm"><Download className="h-4 w-4" /> Export CSV</a>
            <Link href="/app/incidents/new" className="btn-brand btn-sm"><Plus className="h-4 w-4" /> Report an incident</Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Filing overdue" value={summary.overdue} hint={`Reportable, past ${hours} hours, not closed`} icon={FileWarning} tone={summary.overdue ? "bad" : "good"} href={tile({ attention: "filing-overdue" })} />
          <Stat label="Filing due" value={summary.dueSoon} hint="Reportable and still inside the deadline" icon={AlertOctagon} tone={summary.dueSoon ? "warn" : "good"} href={tile({ attention: "filing-due", sort: "deadline" })} />
          <Stat label="Serious and open" value={summary.serious} hint="High or critical, not closed" icon={AlertTriangle} tone={summary.serious ? "bad" : "good"} href={tile({ attention: "serious", sort: "severity" })} />
          <Stat label="Open" value={summary.open} hint="Waiting for a coordinator" icon={ClipboardList} tone={summary.open ? "warn" : "good"} href={tile({ status: "open" })} />
          <Stat label="Under review" value={summary.review} hint="Being looked into" icon={ClipboardList} tone="brand" href={tile({ status: "under_review" })} />
          <Stat
            label="Last 30 days"
            value={summary.last30}
            hint={trend === 0 ? "Same as the 30 days before" : `${Math.abs(trend)} ${trend > 0 ? "more" : "fewer"} than the 30 days before`}
            icon={trend > 0 ? TrendingUp : TrendingDown}
            tone={trend > 0 ? "warn" : "good"}
            href={tile({ period: "30" })}
          />
        </div>
        <Panel title="By category, last 90 days">
          {byCategory.length === 0 ? (
            <Empty>No incidents in the last 90 days.</Empty>
          ) : (
            <ul className="space-y-2.5 p-5">
              {byCategory.map(row => (
                <li key={row.category}>
                  <Link href={hrefWith(incidentDefaults, { category: row.category })} className="grid grid-cols-[120px_1fr_28px] items-center gap-3 text-sm hover:text-brand">
                    <span className="truncate text-mute">{label("incidentCategory", row.category)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-panel"><span className="block h-full rounded-full bg-brand" style={{ width: `${(row.n / maxCategory) * 100}%` }} /></span>
                    <span className="text-right font-semibold">{row.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <AutoSubmitForm className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <input type="hidden" name="sort" value={query.sort} data-default="occurred" />
          <input type="hidden" name="dir" value={query.dir} data-default={naturalDir(query.sort)} />
          <input type="hidden" name="per" value={query.per} data-default="25" />
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" aria-hidden="true" />
            <input name="q" defaultValue={query.q} maxLength={120} placeholder="Search what happened, actions, person or home" aria-label="Search incidents" className="field pl-10" />
          </div>
          <select name="period" data-default="90" defaultValue={query.period} aria-label="When" className="field">
            {Object.entries(incidentPeriods).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="status" data-default="all" defaultValue={query.status} aria-label="Status" className="field">
            {Object.entries(incidentStatusFilters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="attention" data-default="any" defaultValue={query.attention} aria-label="Needs attention" className="field">
            {Object.entries(incidentAttention).map(([value, text]) => <option key={value} value={value}>{value === "any" ? "Needs attention: anything" : text}</option>)}
          </select>
          <select name="reportable" data-default="any" defaultValue={query.reportable} aria-label="Reportable" className="field">
            <option value="any">Reportable or not</option>
            <option value="yes">Reportable only</option>
            <option value="no">Not reportable</option>
          </select>
          <select name="category" defaultValue={query.category} aria-label="Category" className="field">
            <option value="">All categories</option>
            {Object.entries(labels.incidentCategory).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="severity" defaultValue={query.severity} aria-label="Severity" className="field">
            <option value="">All severities</option>
            {Object.entries(labels.incidentSeverity).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="home" defaultValue={query.home} aria-label="Home" className="field">
            <option value="">All homes</option>
            <option value="none">No home</option>
            {options.homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
          <select name="person" defaultValue={query.person} aria-label="Person" className="field">
            <option value="">Everyone</option>
            {options.people.map(person => <option key={person.id} value={person.id}>{person.first} {person.last}</option>)}
          </select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <button type="submit" className="btn-primary btn-sm">Search</button>
            {filtered && <Link href={hrefWith(incidentDefaults, { per: query.per })} className="btn-ghost btn-sm">Clear filters</Link>}
          </div>
        </AutoSubmitForm>

        {rows.length === 0 ? (
          <Empty>{filtered ? "No incidents match these filters." : "No incidents in the last 90 days."}</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <IncidentSort query={current} sort="occurred">When</IncidentSort>
                <IncidentSort query={current} sort="person">Who</IncidentSort>
                <IncidentSort query={current} sort="category">What happened</IncidentSort>
                <IncidentSort query={current} sort="severity">Severity</IncidentSort>
                <IncidentSort query={current} sort="deadline">State filing</IncidentSort>
                <IncidentSort query={current} sort="status">Status</IncidentSort>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const live = row.reportable && row.status !== "closed";
                const left = row.deadline.getTime() - now;
                return (
                  <tr key={row.id} className={cn("group hover:bg-panel/50", live && left < 0 && "bg-flag-soft/30")}>
                    <td className="whitespace-nowrap">
                      <Link href={`/app/incidents/${row.id}`} className="font-semibold group-hover:text-brand">{fmt.dateTime(row.occurredAt)}</Link>
                      <p className="text-xs text-mute">{row.reporter ? `by ${row.reporter}` : ""}</p>
                    </td>
                    <td>
                      {row.first ? (
                        <Link href={`/app/individuals/${row.individualId}`} className="flex items-center gap-2 hover:text-brand">
                          <Avatar initials={initials(row.first, row.last ?? "")} size="sm" />
                          <span>
                            <span className="block font-semibold">{row.first} {row.last}</span>
                            <span className="block text-xs text-mute">{row.home ?? ""}</span>
                          </span>
                        </Link>
                      ) : (
                        <span className="text-mute">{row.home ?? "—"}</span>
                      )}
                    </td>
                    <td className="max-w-[340px]">
                      <p className="font-semibold">{label("incidentCategory", row.category)}</p>
                      <p className="line-clamp-2 text-xs text-mute">{row.description}</p>
                      {!row.actionsTaken.trim() && <p className="text-[11px] font-semibold text-[#8a5a10]">No actions recorded</p>}
                    </td>
                    <td><Badge tone={severityTone[row.severity]}>{label("incidentSeverity", row.severity)}</Badge></td>
                    <td className="whitespace-nowrap">
                      {!row.reportable ? (
                        <span className="text-xs text-dim">Not reportable</span>
                      ) : !live ? (
                        <Badge tone="neutral">Reportable · closed</Badge>
                      ) : (
                        <span>
                          <Badge tone={left < 0 ? "bad" : left < 6 * 3_600_000 ? "warn" : "brand"}>{timeLeft(left)}</Badge>
                          <span className="mt-0.5 block text-[11px] text-mute">by {fmt.dateTime(row.deadline)}</span>
                        </span>
                      )}
                    </td>
                    <td><Badge tone={statusTone[row.status]}>{label("incidentStatus", row.status)}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          pages={pages}
          total={total}
          per={query.per}
          sizes={incidentPageSizes}
          note={`${incidentPeriods[query.period].toLowerCase()}, sorted by ${incidentSorts[query.sort].toLowerCase()}`}
          hrefFor={changes => hrefWith(current, changes as Partial<IncidentQuery>)}
        />
      </Panel>
    </>
  );
}
