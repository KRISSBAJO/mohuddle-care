import Link from "next/link";
import { AlertTriangle, BadgeCheck, KeyRound, Search, UserPlus, Users } from "lucide-react";
import { listHref, Pagination, SortHeader } from "@/components/app/ListControls";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { Select } from "@/components/app/Select";
import { Avatar, Badge, Empty, PageHeader, Panel, Stat } from "@/components/app/ui";
import { daysBetween, fmt, initials, label, labels } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import {
  parseStaffQuery,
  searchStaff,
  staffCredFilters,
  staffLoginFilters,
  staffPageSizes,
  staffSorts,
  staffStatusFilters,
  type StaffQuery,
} from "@/server/queries/staff";

export const metadata = { title: "Staff" };

const defaults: StaffQuery = { q: "", role: "", home: "", status: "current", login: "any", cred: "any", sort: "name", dir: "asc", page: 1, per: 25 };
const hrefWith = (query: StaffQuery, changes: Partial<StaffQuery>) => listHref("/app/staff", defaults, query, changes);

function StaffSort({ query, sort, children }: { query: StaffQuery; sort: StaffQuery["sort"]; children: React.ReactNode }) {
  const active = query.sort === sort;
  return (
    <SortHeader active={active} dir={query.dir} href={hrefWith(query, { sort, dir: active && query.dir === "asc" ? "desc" : "asc", page: 1 })}>
      {children}
    </SortHeader>
  );
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const manager = canManage(user);
  const query = parseStaffQuery(await searchParams);
  const [result, homes] = await Promise.all([searchStaff(query), listHomes()]);
  const { rows, total, page, pages, summary } = result;
  const filtered = query.q || query.role || query.home || query.login !== "any" || query.cred !== "any" || query.status !== "current";
  const current = { ...query, page };

  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Your team"
        description="Search, sort and open anyone to manage their details, Mohuddle login and credentials."
        action={
          manager ? (
<Link href="/app/staff/new" className="btn-brand"><UserPlus className="h-4 w-4" /> Add staff member</Link>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Current staff" value={summary.current} hint={summary.left ? `${summary.left} former staff on record` : "Everyone on the team now"} icon={Users} href={hrefWith(defaults, {})} />
        <Stat label="No Mohuddle login yet" value={summary.noLogin} hint="Open a person to create one" icon={KeyRound} tone={summary.noLogin ? "warn" : "good"} href={hrefWith(defaults, { login: "none" })} />
        <Stat label="Expired credentials" value={summary.expired} hint="People with at least one" icon={AlertTriangle} tone={summary.expired ? "bad" : "good"} href={hrefWith(defaults, { cred: "expired", sort: "expiry" })} />
        <Stat label="Expiring soon" value={summary.expiring} hint={`Within ${result.warningDays} days`} icon={BadgeCheck} tone={summary.expiring ? "warn" : "good"} href={hrefWith(defaults, { cred: "expiring", sort: "expiry" })} />
      </div>

      <Panel>
        <AutoSubmitForm className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <input type="hidden" name="sort" value={query.sort} data-default="name" />
          <input type="hidden" name="dir" value={query.dir} data-default="asc" />
          <input type="hidden" name="per" value={query.per} data-default="25" />
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" aria-hidden="true" />
            <input name="q" defaultValue={query.q} maxLength={120} placeholder="Search name, email or phone" aria-label="Search staff" className="field pl-10" />
          </div>
          <Select name="role" defaultValue={query.role} aria-label="Filter by job" className="lg:w-auto" emptyLabel="All jobs" options={Object.entries(labels.staffRole).map(([value, text]) => ({ value, label: text }))} />
          <Select name="home" defaultValue={query.home} aria-label="Filter by home" className="lg:w-auto" emptyLabel="All homes" searchable options={[{ value: "none", label: "Floating or office" }, ...homes.map(home => ({ value: home.id, label: home.name }))]} />
          <Select name="login" dataDefault="any" defaultValue={query.login} aria-label="Filter by Mohuddle login" className="lg:w-auto" options={Object.entries(staffLoginFilters).map(([value, text]) => ({ value, label: text }))} />
          <Select name="cred" dataDefault="any" defaultValue={query.cred} aria-label="Filter by credentials" className="lg:w-auto" options={Object.entries(staffCredFilters).map(([value, text]) => ({ value, label: text }))} />
          <Select name="status" dataDefault="current" defaultValue={query.status} aria-label="Filter by status" className="lg:w-auto" options={Object.entries(staffStatusFilters).map(([value, text]) => ({ value, label: text }))} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm">Search</button>
            {filtered && <Link href={hrefWith(defaults, { sort: query.sort, dir: query.dir, per: query.per })} className="btn-ghost btn-sm">Clear</Link>}
          </div>
        </AutoSubmitForm>

        {rows.length === 0 ? (
          <Empty>{filtered ? "No staff match these filters." : "No staff yet. Add your first team member above."}</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <StaffSort query={current} sort="name">Name</StaffSort>
                <StaffSort query={current} sort="role">Job</StaffSort>
                <StaffSort query={current} sort="home">Home</StaffSort>
                <th>Mohuddle login</th>
                <StaffSort query={current} sort="expiry">Credentials</StaffSort>
                <StaffSort query={current} sort="hired">Hired</StaffSort>
              </tr>
            </thead>
            <tbody>
              {rows.map(person => (
                <tr key={person.id} className="group hover:bg-panel/50">
                  <td>
                    <Link href={`/app/staff/${person.id}`} className="flex items-center gap-3">
                      <Avatar initials={initials(person.firstName, person.lastName)} size="sm" tone={person.active ? "brand" : "neutral"} />
                      <span>
                        <span className="block font-semibold group-hover:text-brand">{person.firstName} {person.lastName}</span>
                        <span className="block text-xs text-mute">{person.email}{person.phone && ` · ${person.phone}`}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {label("staffRole", person.role)}
                    {!person.active && <Badge tone="neutral" className="ml-2">Left</Badge>}
                  </td>
                  <td className="text-mute">{person.home ?? "Floating"}</td>
                  <td>
                    {!person.hasLogin ? (
                      <span className="text-xs text-dim">None</span>
                    ) : !person.loginActive ? (
                      <Badge tone="neutral">Off</Badge>
                    ) : !person.loginReady ? (
                      <Badge tone="warn">Invited</Badge>
                    ) : (
                      <Badge tone="good" className="capitalize">{person.loginRole}</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {person.credentials.length === 0 && <span className="text-xs text-dim">None recorded</span>}
                      {person.credentials.slice(0, 3).map(cred => {
                        const days = cred.expiresAt ? daysBetween(result.today, cred.expiresAt) : null;
                        const tone = days === null ? "neutral" : days < 0 ? "bad" : days <= result.warningDays ? "warn" : "good";
                        return (
                          <Badge key={cred.id} tone={tone} className="font-medium">
                            {cred.type}
                            {cred.expiresAt ? ` · ${fmt.day(cred.expiresAt)}` : ""}
                          </Badge>
                        );
                      })}
                      {person.credentials.length > 3 && <span className="text-xs text-mute">+{person.credentials.length - 3} more</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-mute">{person.hiredAt ? fmt.day(person.hiredAt) : "—"}</td>
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
          sizes={staffPageSizes}
          note={`sorted by ${staffSorts[query.sort].toLowerCase()}, ${query.dir === "asc" ? "A to Z" : "Z to A"}`}
          hrefFor={changes => hrefWith(current, changes as Partial<StaffQuery>)}
        />
      </Panel>
    </>
  );
}
