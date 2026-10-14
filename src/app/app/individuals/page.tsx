import Link from "next/link";
import { ArrowUpRight, ClipboardList, Home, Plus, Search, Users } from "lucide-react";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { age, initials, label, labels } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listIndividuals } from "@/server/queries/hub";

export const metadata = { title: "People we support" };

export default async function IndividualsPage({ searchParams }: { searchParams: Promise<{ q?: string; service?: string }> }) {
  const user = await requireUser();
  const all = await listIndividuals();
  const { q = "", service = "" } = await searchParams;
  const query = q.trim().slice(0, 120).toLowerCase();
  const people = all.filter(person => (!query || `${person.firstName} ${person.lastName} ${person.home ?? ""}`.toLowerCase().includes(query)) && (!service || person.serviceType === service));
  const homes = new Set(all.map(person => person.homeId).filter(Boolean)).size;
  return (
    <>
      <PageHeader eyebrow="People, not paperwork" title="People we support" description={`${all.length} individuals. ${homes} homes. A personal story behind every name.`} action={canManage(user) ? <Link href="/app/individuals/new" className="btn-brand"><Plus className="h-4 w-4" /> Add a person</Link> : undefined} />
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-sky/50 px-5 py-4"><Users className="h-5 w-5 shrink-0 text-brand" /><p className="text-xs leading-relaxed text-mute">Keep the person at the center. Open a profile to review support goals, medications, care notes and important contacts.</p></div>
      <form className="mb-6 flex flex-col gap-3 sm:flex-row" method="get">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-mute" /><input name="q" aria-label="Search people or homes" defaultValue={q} placeholder="Search a person or home…" className="field pl-11" maxLength={120} /></div>
        <select name="service" aria-label="Filter by service" defaultValue={service} className="field sm:w-60"><option value="">All services</option>{Object.entries(labels.serviceType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
        <button className="btn-primary btn-sm" type="submit">Search</button>{(query || service) && <Link href="/app/individuals" className="btn-ghost btn-sm">Reset</Link>}
      </form>
      <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-mute">{people.length} {people.length === 1 ? "person" : "people"}{query || service ? " found" : " in your care"}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {people.length === 0 && <Panel className="sm:col-span-2"><Empty>No people match these filters. Try another name or service.</Empty></Panel>}
        {people.map(person => <article key={person.id} className="person-card">
          <div className="flex items-center justify-between"><Avatar initials={initials(person.firstName, person.lastName)} size="lg" /><Link href={`/app/individuals/${person.id}`} className="person-open" aria-label={`Open ${person.firstName} ${person.lastName}'s profile`}><ArrowUpRight className="h-4 w-4" /></Link></div>
          <h2 className="mt-5 text-xl font-semibold"><Link href={`/app/individuals/${person.id}`}>{person.firstName} {person.lastName}</Link></h2><p className="mt-2 text-xs text-mute">{age(person.dob) !== null ? `${age(person.dob)} years old` : "Age not recorded"}</p>
          <div className="mt-5"><Badge tone="brand">{label("serviceType", person.serviceType)}</Badge></div><p className="mt-4 flex items-center gap-2 text-xs text-mute"><Home className="h-3.5 w-3.5" />{person.home ?? "Home not assigned"}</p>
          <div className="person-actions"><Link href={`/app/individuals/${person.id}`}>View support plan <ArrowUpRight className="h-3 w-3" /></Link><Link href={`/app/daily-logs/new?individual=${person.id}`}><ClipboardList className="h-3.5 w-3.5" /> Care note</Link></div>
        </article>)}
      </div>
    </>
  );
}
