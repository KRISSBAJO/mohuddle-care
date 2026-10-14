import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarX2, ClipboardCheck, LayoutGrid, List, Pill, Plus, Receipt, Search, Users, Wrench } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { Select } from "@/components/app/Select";
import { listHref, Pagination, SortHeader } from "@/components/app/ListControls";
import { Avatar, Badge, Empty, PageHeader, Panel, Stat } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { initials, label, labels, money } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import {
  homeAttention,
  homeDefaults,
  homePageSizes,
  homeSorts,
  homeStatusFilters,
  parseHomeQuery,
  searchHomes,
  type HomeQuery,
} from "@/server/queries/homes";

export const metadata = { title: "Homes" };

/* Links leave out the direction when it is the sort's natural one, which the page then assumes. */
const hrefWith = (query: HomeQuery, changes: Partial<HomeQuery>) => {
  const sort = changes.sort ?? query.sort;
  return listHref("/app/homes", { ...homeDefaults, dir: sort === "name" ? "asc" : "desc" }, query, changes);
};

function HomeSort({ query, sort, children, className }: { query: HomeQuery; sort: HomeQuery["sort"]; children: React.ReactNode; className?: string }) {
  const active = query.sort === sort;
  const firstDir = sort === "name" ? "asc" : "desc";
  const dir = active ? (query.dir === "asc" ? "desc" : "asc") : firstDir;
  return (
    <SortHeader active={active} dir={query.dir} className={className} href={hrefWith(query, { sort, dir, page: 1 })}>
      {children}
    </SortHeader>
  );
}

type Row = Awaited<ReturnType<typeof searchHomes>>["rows"][number];

function budgetTone(row: Row) {
  if (!row.budget) return "bg-brand";
  const share = row.spent / row.budget;
  return share > 1 ? "bg-flag" : share > 0.85 ? "bg-accent" : "bg-sage";
}

function HomeCard({ row }: { row: Row }) {
  const fullPct = Math.min(100, Math.round((row.residents / Math.max(1, row.capacity)) * 100));
  const budgetPct = row.budget ? Math.min(100, Math.round((row.spent / row.budget) * 100)) : 0;
  const medsDone = row.medsTotal ? Math.round((row.medsGiven / row.medsTotal) * 100) : 100;
  const base = `/app/homes/${row.id}`;
  return (
    <article className={cn("card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]", !row.active && "opacity-70")}>
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold"><Link href={base} className="hover:text-brand">{row.name}</Link></h2>
          <p className="truncate text-xs text-mute">{[row.address, row.city].filter(Boolean).join(", ") || "No address yet"}</p>
          <p className="mt-1 text-xs text-mute">
            Manager:{" "}
            {row.managerName ? <span className="font-semibold text-ink">{row.managerName}</span> : <span className="font-semibold text-[#8a5a10]">not set</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone="brand">{label("homeType", row.type)}</Badge>
          {!row.active && <Badge tone="neutral">Closed</Badge>}
        </div>
      </div>

      <div className="px-5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-mute">
          <span>{row.residents} of {row.capacity} places</span>
          <span>{row.capacity - row.residents > 0 ? `${row.capacity - row.residents} free` : "Full"}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-brand" style={{ width: `${fullPct}%` }} /></div>
        <div className="mt-3 flex -space-x-1">
          {row.people.slice(0, 6).map(person => (
            <Link key={person.id} href={`/app/individuals/${person.id}`} title={`${person.first} ${person.last}`} className="rounded-full ring-2 ring-white">
              <Avatar initials={initials(person.first, person.last)} size="sm" />
            </Link>
          ))}
          {row.people.length > 6 && <span className="grid h-7 w-7 place-items-center rounded-full bg-panel text-[10px] font-bold text-mute ring-2 ring-white">+{row.people.length - 6}</span>}
          {row.people.length === 0 && <span className="text-xs text-dim">No one living here yet</span>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 px-5 text-xs">
        <Link href={`${base}?tab=medications`} className={cn("rounded-xl px-3 py-2.5", row.medsLate ? "bg-flag-soft text-flag" : "bg-panel text-mute")}>
          <span className="flex items-center gap-1 font-semibold"><Pill className="h-3.5 w-3.5" /> Medications</span>
          <span className="mt-0.5 block font-display text-base font-bold text-ink">{row.medsTotal ? `${row.medsGiven}/${row.medsTotal}` : "None"}</span>
          {row.medsLate ? `${row.medsLate} late` : row.medsTotal ? `${medsDone}% done today` : "today"}
        </Link>
        <Link href={`${base}?tab=issues`} className={cn("rounded-xl px-3 py-2.5", row.urgentIssues ? "bg-flag-soft text-flag" : row.openIssues ? "bg-accent-soft text-[#8a5a10]" : "bg-panel text-mute")}>
          <span className="flex items-center gap-1 font-semibold"><Wrench className="h-3.5 w-3.5" /> Issues</span>
          <span className="mt-0.5 block font-display text-base font-bold text-ink">{row.openIssues}</span>
          {row.urgentIssues ? `${row.urgentIssues} urgent` : row.overdueIssues ? `${row.overdueIssues} overdue` : "open"}
        </Link>
        <Link href={`${base}?tab=expenses`} className="col-span-2 rounded-xl bg-panel px-3 py-2.5 text-mute">
          <span className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-1"><Receipt className="h-3.5 w-3.5" /> This month</span>
            {row.pending > 0 && <span className="chip bg-accent-soft px-1.5 py-0 text-[#8a5a10]">{row.pending} to approve</span>}
          </span>
          <span className="mt-0.5 block font-display text-base font-bold text-ink">
            {money(row.spent, true)}
            <span className="text-xs font-normal text-mute">{row.budget ? ` of ${money(row.budget, true)}` : " · no budget"}</span>
          </span>
          {row.budget ? (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white"><span className={cn("block h-full rounded-full", budgetTone(row))} style={{ width: `${budgetPct}%` }} /></span>
          ) : null}
        </Link>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs">
        {row.openShifts > 0 ? (
          <Link href={`/app/schedule?home=${row.id}`} className="inline-flex items-center gap-1 font-semibold text-flag"><CalendarX2 className="h-3.5 w-3.5" /> {row.openShifts} open {row.openShifts === 1 ? "shift" : "shifts"} this week</Link>
        ) : (
          <Link href={`/app/schedule?home=${row.id}`} className="text-mute hover:text-ink">Schedule</Link>
        )}
        <Link href={base} className="inline-flex items-center gap-1 font-semibold text-brand">Open home <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>
    </article>
  );
}

export default async function HomesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const manager = canManage(user);
  const query = parseHomeQuery(await searchParams);
  const { rows, total, page, pages, summary } = await searchHomes(query);
  const current = { ...query, page };
  const filtered = query.q || query.type || query.attention !== "any" || query.status !== "active";
  const occupancy = summary.places ? Math.round((summary.filled / summary.places) * 100) : 0;
  const tile = (attention: HomeQuery["attention"], sort: HomeQuery["sort"]) => hrefWith(homeDefaults, { attention, sort, dir: sort === "name" ? "asc" : "desc", view: query.view });

  return (
    <>
      <PageHeader
        eyebrow="Homes"
        title="Homes and settings"
        description="Every home at a glance: who lives there, today's medications, open issues and spending. Open a home to manage it."
        action={manager ? <Link href="/app/homes/new" className="btn-brand"><Plus className="h-4 w-4" /> Add a home</Link> : undefined}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Places filled" value={`${summary.filled}/${summary.places}`} hint={`${occupancy}% across ${summary.homes} open homes`} icon={Users} href={tile("vacancies", "vacancies")} />
        <Stat label="Late medication" value={summary.lateMeds} hint="Doses past their time today" icon={Pill} tone={summary.lateMeds ? "bad" : "good"} href={tile("late-meds", "meds")} />
        <Stat label="Homes with urgent issues" value={summary.urgent} hint="Open and marked urgent" icon={AlertTriangle} tone={summary.urgent ? "bad" : "good"} href={tile("urgent", "issues")} />
        <Stat label="Spent this month" value={money(summary.spent, true)} hint={summary.budget ? `${Math.round((summary.spent / summary.budget) * 100)}% of ${money(summary.budget, true)} · ${summary.overBudget} over budget` : "No budgets set"} icon={Receipt} tone={summary.overBudget ? "bad" : "brand"} href={tile("over-budget", "budget")} />
        <Stat label="Open shifts" value={summary.openShifts} hint="In the next 7 days" icon={CalendarX2} tone={summary.openShifts ? "warn" : "good"} href={tile("open-shifts", "name")} />
        <Stat label="Expenses to approve" value={summary.pending} hint={summary.pending ? "Waiting for a coordinator or manager" : "Nothing waiting"} icon={ClipboardCheck} tone={summary.pending ? "warn" : "good"} href={tile("any", "spend")} />
      </div>

      <Panel>
        <AutoSubmitForm className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          {query.view === "table" && <input type="hidden" name="sort" value={query.sort} data-default="name" />}
          {query.view === "table" && <input type="hidden" name="dir" value={query.dir} data-default={query.sort === "name" ? "asc" : "desc"} />}
          <input type="hidden" name="per" value={query.per} data-default="12" />
          <input type="hidden" name="view" value={query.view} data-default="cards" />
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" aria-hidden="true" />
            <input name="q" defaultValue={query.q} maxLength={120} placeholder="Search home, address or manager" aria-label="Search homes" className="field pl-10" />
          </div>
          <Select name="type" defaultValue={query.type} aria-label="Filter by type" className="lg:w-auto" emptyLabel="All types" options={Object.entries(labels.homeType).map(([value, text]) => ({ value, label: text }))} />
          <Select name="attention" dataDefault="any" defaultValue={query.attention} aria-label="Filter by what needs attention" className="lg:w-auto" options={Object.entries(homeAttention).map(([value, text]) => ({ value, label: value === "any" ? "Needs attention: anything" : text }))} />
          <Select name="status" dataDefault="active" defaultValue={query.status} aria-label="Open or closed" className="lg:w-auto" options={Object.entries(homeStatusFilters).map(([value, text]) => ({ value, label: `${text}${value === "closed" && summary.closed ? ` (${summary.closed})` : ""}` }))} />
          {query.view === "cards" && (
            <Select name="sort" defaultValue={query.sort} aria-label="Sort homes" className="lg:w-auto" dataDefault="name" options={Object.entries(homeSorts).map(([value, text]) => ({ value, label: `Sort: ${text}` }))} />
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm">Search</button>
            {filtered && <Link href={hrefWith(homeDefaults, { view: query.view, per: query.per })} className="btn-ghost btn-sm">Clear</Link>}
          </div>
          <div className="flex rounded-xl bg-panel p-1 lg:ml-auto" role="group" aria-label="Layout">
            <Link href={hrefWith(current, { view: "cards" })} aria-pressed={query.view === "cards"} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", query.view === "cards" ? "bg-white shadow-sm" : "text-mute")}><LayoutGrid className="h-4 w-4" /> Cards</Link>
            <Link href={hrefWith(current, { view: "table" })} aria-pressed={query.view === "table"} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", query.view === "table" ? "bg-white shadow-sm" : "text-mute")}><List className="h-4 w-4" /> Table</Link>
          </div>
        </AutoSubmitForm>

        {rows.length === 0 ? (
          <Empty>{filtered ? "No homes match these filters." : manager ? "No homes yet. Use Add a home to set up the first one." : "No homes yet."}</Empty>
        ) : query.view === "cards" ? (
          <div className="grid gap-5 bg-panel/40 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map(row => <HomeCard key={row.id} row={row} />)}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <HomeSort query={current} sort="name">Home</HomeSort>
                <th>Manager</th>
                <HomeSort query={current} sort="occupancy">Places</HomeSort>
                <HomeSort query={current} sort="meds">Meds today</HomeSort>
                <HomeSort query={current} sort="issues">Issues</HomeSort>
                <HomeSort query={current} sort="spend">Spent</HomeSort>
                <HomeSort query={current} sort="budget">Budget</HomeSort>
                <th>Open shifts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="group hover:bg-panel/50">
                  <td>
                    <Link href={`/app/homes/${row.id}`} className="font-semibold group-hover:text-brand">{row.name}</Link>
                    <p className="text-xs text-mute">{label("homeType", row.type)}{!row.active && " · closed"}</p>
                  </td>
                  <td className={row.managerName ? "" : "text-[#8a5a10]"}>{row.managerName ?? "Not set"}</td>
                  <td className="whitespace-nowrap">{row.residents}/{row.capacity}</td>
                  <td className="whitespace-nowrap">
                    {row.medsTotal ? `${row.medsGiven}/${row.medsTotal}` : "—"}
                    {row.medsLate > 0 && <Badge tone="bad" className="ml-2">{row.medsLate} late</Badge>}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.openIssues}
                    {row.urgentIssues > 0 && <Badge tone="bad" className="ml-2">{row.urgentIssues} urgent</Badge>}
                  </td>
                  <td className="whitespace-nowrap font-semibold">{money(row.spent, true)}</td>
                  <td className="whitespace-nowrap">
                    {row.budget ? (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-panel"><span className={cn("block h-full rounded-full", budgetTone(row))} style={{ width: `${Math.min(100, Math.round((row.spent / row.budget) * 100))}%` }} /></span>
                        <span className="text-xs text-mute">{Math.round((row.spent / row.budget) * 100)}%</span>
                      </span>
                    ) : (
                      <span className="text-xs text-dim">None</span>
                    )}
                  </td>
                  <td>{row.openShifts > 0 ? <Link href={`/app/schedule?home=${row.id}`} className="font-semibold text-flag">{row.openShifts}</Link> : <span className="text-dim">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          pages={pages}
          total={total}
          per={query.per}
          sizes={homePageSizes}
          note={`sorted by ${homeSorts[query.sort].toLowerCase()}`}
          hrefFor={changes => hrefWith(current, changes as Partial<HomeQuery>)}
        />
      </Panel>
    </>
  );
}
