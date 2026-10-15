import Link from "next/link";
import { Building2, Search, UserRound } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/app/ui";
import { label } from "@/lib/format";
import { requireOwner } from "@/server/owner-auth";
import { searchEverywhere } from "@/server/owner";

export const metadata = { title: "Search" };

/* Agencies, logins and staff records across every agency, by name or email. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwner();
  const { q = "" } = await searchParams;
  const found = await searchEverywhere(q);
  const total = found ? found.agencies.length + found.logins.length + found.staff.length : 0;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Running Mohuddle" title="Search" description="Find an agency, or anyone with a login or staff record, by name or email. People the agencies support are not searched here: open a support visit to see them." />
      <form className="flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} autoFocus minLength={2} maxLength={80} placeholder="Name, email or agency" className="field" aria-label="Search" />
        <button className="btn-brand shrink-0"><Search className="h-4 w-4" /> Search</button>
      </form>

      {found && total === 0 && <p className="text-sm text-mute">Nothing matches “{q}”.</p>}

      {found && found.agencies.length > 0 && (
        <Panel title="Agencies">
          <ul className="divide-y divide-line/60">
            {found.agencies.map(agency => (
              <li key={agency.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/owner/agencies/${agency.id}`} className="flex items-center gap-2 font-semibold hover:text-brand"><Building2 className="h-4 w-4 text-mute" /> {agency.name} <span className="font-normal text-mute">{agency.slug}</span></Link>
                {agency.active ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Turned off</Badge>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {found && found.logins.length > 0 && (
        <Panel title="Logins">
          <ul className="divide-y divide-line/60">
            {found.logins.map(login => (
              <li key={login.email} className="px-5 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <UserRound className="h-4 w-4 text-mute" /> {login.name} <span className="font-normal text-mute">{login.email}</span>
                  {!login.hasPassword && <Badge tone="warn">Setup not finished</Badge>}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-6 text-xs text-mute">
                  {login.places.map(place => (
                    <Link key={place.agencyId} href={`/owner/agencies/${place.agencyId}`} className="hover:text-brand">
                      {place.agency}, <span className="capitalize">{place.role}</span>{place.active ? "" : " (off)"}
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {found && found.staff.length > 0 && (
        <Panel title="Staff records">
          <ul className="divide-y divide-line/60">
            {found.staff.map(member => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  <span className="font-semibold">{member.first} {member.last}</span> <span className="text-mute">{member.email} · {label("staffRole", member.role)}</span>
                </span>
                <Link href={`/owner/agencies/${member.agencyId}`} className="text-xs text-mute hover:text-brand">{member.agency}{member.active ? "" : " · left"}</Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
