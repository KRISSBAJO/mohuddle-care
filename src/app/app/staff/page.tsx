import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, ChevronLeft, ChevronRight, KeyRound, Search, Users } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { ModalForm } from "@/components/app/ModalForm";
import { StaffFields } from "@/components/app/StaffFields";
import { Avatar, Badge, Empty, PageHeader, Panel, Stat } from "@/components/app/ui";
import { daysBetween, fmt, initials, label, labels } from "@/lib/format";
import { createStaff } from "@/server/actions/hub";
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

/* A link to this list with some settings changed. Defaults are left out to keep addresses short. */
function hrefWith(query: StaffQuery, changes: Partial<StaffQuery>) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults) as (keyof StaffQuery)[]) {
    if (String(next[key]) !== String(defaults[key])) params.set(key, String(next[key]));
  }
  const text = params.toString();
  return text ? `/app/staff?${text}` : "/app/staff";
}

function SortHeader({ query, sort, children }: { query: StaffQuery; sort: StaffQuery["sort"]; children: React.ReactNode }) {
  const active = query.sort === sort;
  const dir = active && query.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefWith(query, { sort, dir, page: 1 })} className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}>
        {children} <Icon className="h-3 w-3" aria-hidden="true" />
      </Link>
    </th>
  );
}

function pageWindow(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((n, index) => (index > 0 && n - sorted[index - 1] > 1 ? ["gap" as const, n] : [n]));
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const manager = canManage(user);
  const query = parseStaffQuery(await searchParams);
  const [result, homes] = await Promise.all([searchStaff(query), listHomes()]);
  const { rows, total, page, pages, summary } = result;
  const first = total === 0 ? 0 : (page - 1) * query.per + 1;
  const last = Math.min(total, page * query.per);
  const filtered = query.q || query.role || query.home || query.login !== "any" || query.cred !== "any" || query.status !== "current";
  const current = { ...query, page };

  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Your team"
        description="Search, sort and open anyone to manage their details, Hub login and credentials."
        action={
          manager ? (
            <ModalForm
              action={createStaff}
              title="Add a staff member"
              description="You can create their Hub login and record credentials on the next page."
              triggerLabel="Add staff member"
              submitLabel="Add and open"
            >
              <StaffFields homes={homes} prefix="new-staff" />
            </ModalForm>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Current staff" value={summary.current} hint={summary.left ? `${summary.left} former staff on record` : "Everyone on the team now"} icon={Users} href={hrefWith(defaults, {})} />
        <Stat label="No Hub login yet" value={summary.noLogin} hint="Open a person to create one" icon={KeyRound} tone={summary.noLogin ? "warn" : "good"} href={hrefWith(defaults, { login: "none" })} />
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
          <select name="role" defaultValue={query.role} aria-label="Filter by job" className="field lg:w-auto">
            <option value="">All jobs</option>
            {Object.entries(labels.staffRole).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="home" defaultValue={query.home} aria-label="Filter by home" className="field lg:w-auto">
            <option value="">All homes</option>
            <option value="none">Floating or office</option>
            {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
          <select name="login" data-default="any" defaultValue={query.login} aria-label="Filter by Hub login" className="field lg:w-auto">
            {Object.entries(staffLoginFilters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="cred" data-default="any" defaultValue={query.cred} aria-label="Filter by credentials" className="field lg:w-auto">
            {Object.entries(staffCredFilters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <select name="status" data-default="current" defaultValue={query.status} aria-label="Filter by status" className="field lg:w-auto">
            {Object.entries(staffStatusFilters).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
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
                <SortHeader query={current} sort="name">Name</SortHeader>
                <SortHeader query={current} sort="role">Job</SortHeader>
                <SortHeader query={current} sort="home">Home</SortHeader>
                <th>Hub login</th>
                <SortHeader query={current} sort="expiry">Credentials</SortHeader>
                <SortHeader query={current} sort="hired">Hired</SortHeader>
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

        <nav className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Pages">
          <p className="text-xs text-mute">
            {total === 0 ? "No results" : `Showing ${first}–${last} of ${total}`} · sorted by {staffSorts[query.sort].toLowerCase()}, {query.dir === "asc" ? "A to Z" : "Z to A"}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-2 text-xs text-mute">Per page</span>
            {staffPageSizes.map(size => (
              <Link key={size} href={hrefWith(current, { per: size, page: 1 })} className={`chip ${query.per === size ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink"}`} aria-current={query.per === size ? "true" : undefined}>
                {size}
              </Link>
            ))}
            {pages > 1 && (
              <>
                <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
                {page > 1 ? (
                  <Link href={hrefWith(current, { page: page - 1 })} className="btn-ghost btn-sm px-2" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Link>
                ) : (
                  <span className="btn-ghost btn-sm px-2 opacity-40" aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>
                )}
                {pageWindow(page, pages).map((item, index) =>
                  item === "gap" ? (
                    <span key={`gap-${index}`} className="px-1 text-mute">…</span>
                  ) : (
                    <Link key={item} href={hrefWith(current, { page: item })} aria-current={item === page ? "page" : undefined} className={`chip min-w-8 justify-center ${item === page ? "bg-brand text-white" : "bg-panel text-mute hover:text-ink"}`}>
                      {item}
                    </Link>
                  ),
                )}
                {page < pages ? (
                  <Link href={hrefWith(current, { page: page + 1 })} className="btn-ghost btn-sm px-2" aria-label="Next page"><ChevronRight className="h-4 w-4" /></Link>
                ) : (
                  <span className="btn-ghost btn-sm px-2 opacity-40" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
                )}
              </>
            )}
          </div>
        </nav>
      </Panel>
    </>
  );
}
