import Link from "next/link";
import { AlertTriangle, ClipboardList, Pill, Search, UserPlus, Users } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { listHref, Pagination, SortHeader } from "@/components/app/ListControls";
import { Avatar, Badge, Empty, PageHeader, Panel, Stat } from "@/components/app/ui";
import { age, fmt, initials, label, labels } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import {
  parsePeopleQuery,
  peopleAttentionFilters,
  peopleDefaults,
  peoplePageSizes,
  peopleSorts,
  peopleStatusFilters,
  searchPeople,
  type PeopleQuery,
} from "@/server/queries/people";

export const metadata = { title: "People we support" };

const hrefWith = (query: PeopleQuery, changes: Partial<PeopleQuery>) => listHref("/app/individuals", peopleDefaults, query, changes);

function PeopleSort({ query, sort, children, className }: { query: PeopleQuery; sort: PeopleQuery["sort"]; children: React.ReactNode; className?: string }) {
  const active = query.sort === sort;
  return (
    <SortHeader active={active} dir={query.dir} className={className} href={hrefWith(query, { sort, dir: active && query.dir === "asc" ? "desc" : "asc", page: 1 })}>
      {children}
    </SortHeader>
  );
}

export default async function IndividualsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const manager = canManage(user);
  const query = parsePeopleQuery(await searchParams);
  const [result, homes] = await Promise.all([searchPeople(query), listHomes()]);
  const { rows, total, page, pages, summary } = result;
  const current = { ...query, page };
  const filtered = query.q || query.service || query.home || query.attention !== "any" || query.status !== "current";

  return (
    <>
      <PageHeader
        eyebrow="People, not paperwork"
        title="People we support"
        description="Find anyone quickly, see who needs something today, and open a profile for their plan, medications and notes."
        action={
          manager ? (
<Link href="/app/individuals/new" className="btn-brand"><UserPlus className="h-4 w-4" /> Add person</Link>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Currently supported" value={summary.current} hint={summary.discharged ? `${summary.discharged} discharged on record` : "Everyone in our care now"} icon={Users} href={hrefWith(peopleDefaults, {})} />
        <Stat label="No log today" value={summary.noLog} hint={`Logs are due by ${result.logDueHour}:00`} icon={ClipboardList} tone={summary.noLog ? "warn" : "good"} href={hrefWith(peopleDefaults, { attention: "no-log" })} />
        <Stat label="Late medication" value={summary.late} hint="People with a dose not yet signed" icon={Pill} tone={summary.late ? "bad" : "good"} href={hrefWith(peopleDefaults, { attention: "late-meds" })} />
        <Stat label="Open incidents" value={summary.incident} hint="People with one still open" icon={AlertTriangle} tone={summary.incident ? "warn" : "good"} href={hrefWith(peopleDefaults, { attention: "incident" })} />
      </div>

      <Panel>
        <AutoSubmitForm className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <input type="hidden" name="sort" value={query.sort} data-default="name" />
          <input type="hidden" name="dir" value={query.dir} data-default="asc" />
          <input type="hidden" name="per" value={query.per} data-default="25" />
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" aria-hidden="true" />
            <input name="q" defaultValue={query.q} maxLength={120} placeholder="Search name, home or guardian" aria-label="Search people" className="field pl-10" />
          </div>
          <select name="service" defaultValue={query.service} aria-label="Filter by service" className="field lg:w-auto">
            <option value="">All services</option>
            {Object.entries(labels.serviceType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="home" defaultValue={query.home} aria-label="Filter by home" className="field lg:w-auto">
            <option value="">All homes</option>
            <option value="none">Not in a Milestone home</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
          <select name="attention" data-default="any" defaultValue={query.attention} aria-label="Filter by what needs attention" className="field lg:w-auto">
            {Object.entries(peopleAttentionFilters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="status" data-default="current" defaultValue={query.status} aria-label="Filter by status" className="field lg:w-auto">
            {Object.entries(peopleStatusFilters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm">Search</button>
            {filtered && <Link href={hrefWith(peopleDefaults, { sort: query.sort, dir: query.dir, per: query.per })} className="btn-ghost btn-sm">Clear</Link>}
          </div>
        </AutoSubmitForm>

        {rows.length === 0 ? (
          <Empty>{filtered ? "No one matches these filters." : "No one added yet. Use Add person above."}</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <PeopleSort query={current} sort="name">Name</PeopleSort>
                <PeopleSort query={current} sort="age">Age</PeopleSort>
                <PeopleSort query={current} sort="service">Service</PeopleSort>
                <PeopleSort query={current} sort="home">Home</PeopleSort>
                <th>Today</th>
                <th>Plan</th>
                <PeopleSort query={current} sort="lastLog">Last log</PeopleSort>
              </tr>
            </thead>
            <tbody>
              {rows.map(person => {
                const years = age(person.dob);
                return (
                  <tr key={person.id} className="group hover:bg-panel/50">
                    <td>
                      <Link href={`/app/individuals/${person.id}`} className="flex items-center gap-3">
                        <Avatar initials={initials(person.firstName, person.lastName)} size="sm" tone={person.active ? "brand" : "neutral"} />
                        <span>
                          <span className="block font-semibold group-hover:text-brand">{person.firstName} {person.lastName}</span>
                          {person.allergies ? (
                            <span className="block text-xs font-semibold text-flag">Allergy: {person.allergies}</span>
                          ) : (
                            <span className="block text-xs text-mute">{person.admittedAt ? `Since ${fmt.day(person.admittedAt)}` : "No allergies recorded"}</span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{years ?? "—"}</td>
                    <td>
                      {label("serviceType", person.serviceType)}
                      {!person.active && <Badge tone="neutral" className="ml-2">Discharged</Badge>}
                    </td>
                    <td className="text-mute">{person.home ?? "—"}</td>
                    <td>
                      {person.active ? (
                        <div className="flex flex-wrap gap-1.5">
                          {person.loggedToday ? <Badge tone="good">Logged</Badge> : <Link href={`/app/daily-logs/new?individual=${person.id}`} className="chip bg-accent-soft text-[#8a5a10] hover:underline">Needs log</Link>}
                          {person.lateDoses > 0 && <Badge tone="bad">{person.lateDoses} late {person.lateDoses === 1 ? "dose" : "doses"}</Badge>}
                          {person.openIncidents > 0 && <Badge tone="warn">{person.openIncidents} open {person.openIncidents === 1 ? "incident" : "incidents"}</Badge>}
                        </div>
                      ) : (
                        <span className="text-xs text-dim">{person.dischargedAt ? `Ended ${fmt.day(person.dischargedAt)}` : "—"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs text-mute">
                      {person.activeGoals} {person.activeGoals === 1 ? "goal" : "goals"} · {person.activeMeds} {person.activeMeds === 1 ? "med" : "meds"}
                    </td>
                    <td className="whitespace-nowrap text-mute">{person.lastLog ? (person.lastLog === result.today ? "Today" : fmt.day(person.lastLog)) : "Never"}</td>
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
          sizes={peoplePageSizes}
          note={`sorted by ${peopleSorts[query.sort].toLowerCase()}, ${query.dir === "asc" ? (query.sort === "age" ? "youngest first" : "A to Z") : query.sort === "age" ? "oldest first" : "Z to A"}`}
          hrefFor={changes => hrefWith(current, changes as Partial<PeopleQuery>)}
        />
      </Panel>
    </>
  );
}
