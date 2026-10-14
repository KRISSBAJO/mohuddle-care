import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { HomeStaffingFields } from "@/components/app/HomeStaffingFields";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { initials, label, labels, money } from "@/lib/format";
import { createHome } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { homesWithOccupancy, listClosedHomes } from "@/server/queries/hub";
import { homeSummaries } from "@/server/queries/homes";
import { db, schema } from "@/server/db";
import { inArray } from "drizzle-orm";

export const metadata = { title: "Homes" };

export default async function HomesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const [homes, closed] = await Promise.all([homesWithOccupancy(), listClosedHomes()]);
  const manager = canManage(user);
  const summaries = await homeSummaries(homes.map(home => home.id));
  const managerIds = homes.map(home => home.managerStaffId).filter((id): id is string => Boolean(id));
  const managers = managerIds.length
    ? new Map((await db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(inArray(schema.staff.id, managerIds))).map(m => [m.id, `${m.first} ${m.last}`]))
    : new Map<string, string>();
  return (
    <>
      <PageHeader eyebrow="Homes" title={`${homes.length} homes and settings`} description="Open a home for its manager, medication rounds, expenses and issues." />
      {saved && <p className="mb-6 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Home saved.</p>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {homes.length === 0 && <Panel><Empty>No homes yet.</Empty></Panel>}
        {homes.map(home => (
          <Panel key={home.id}>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold"><Link href={`/app/homes/${home.id}`} className="hover:text-brand">{home.name}</Link></h2>
                  <p className="text-sm text-mute">{home.address}{home.address && ", "}{home.city}</p>
                </div>
                <Badge tone="brand">{label("homeType", home.type)}</Badge>
              </div>
              <p className="mt-1 text-xs text-mute">Manager: <span className="font-semibold text-ink">{home.managerStaffId ? managers.get(home.managerStaffId) ?? "—" : "not set"}</span></p>
              {(() => {
                const s = summaries.get(home.id)!;
                const budget = home.monthlyBudgetCents;
                return (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <Link href={`/app/homes/${home.id}?tab=issues`} className={`rounded-xl px-3 py-2 ${s.urgentIssues ? "bg-flag-soft text-flag" : s.openIssues ? "bg-accent-soft text-[#8a5a10]" : "bg-panel text-mute"}`}>
                      <span className="block font-display text-lg font-bold">{s.openIssues}</span>
                      {s.urgentIssues ? `open, ${s.urgentIssues} urgent` : "open issues"}
                    </Link>
                    <Link href={`/app/homes/${home.id}?tab=expenses`} className={`rounded-xl px-3 py-2 ${budget && s.spentCents > budget ? "bg-flag-soft text-flag" : "bg-panel text-mute"}`}>
                      <span className="block font-display text-lg font-bold">{money(s.spentCents, true)}</span>
                      {budget ? `of ${money(budget, true)} this month` : "spent this month"}
                      {s.pendingCount > 0 && ` · ${s.pendingCount} waiting`}
                    </Link>
                  </div>
                );
              })()}
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-mute">{home.residents.length} of {home.capacity} places</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (home.residents.length / Math.max(1, home.capacity)) * 100)}%` }} /></div>
              <ul className="mt-4 space-y-2">
                {home.residents.map(person => (
                  <li key={person.id}><Link href={`/app/individuals/${person.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-brand"><Avatar initials={initials(person.first, person.last)} size="sm" /> {person.first} {person.last}</Link></li>
                ))}
                {home.residents.length === 0 && <li className="text-sm text-mute">No one placed here yet.</li>}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-mute">{home.phone ? `House phone ${home.phone}` : ""}</p>
                <Link href={`/app/homes/${home.id}`} className="text-xs font-semibold text-brand">Open home</Link>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold text-mute">Closed homes ({closed.length})</summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {closed.map(home => (
              <li key={home.id}>
                {manager ? <Link href={`/app/homes/${home.id}`} className="chip bg-panel text-mute hover:text-ink">{home.name}</Link> : <span className="chip bg-panel text-mute">{home.name}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {manager && (
        <Panel title="Add a home" className="mt-6 max-w-2xl">
          <div className="p-5">
            <ActionForm action={createHome} submitLabel="Add home">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="home-name"><input id="home-name" name="name" required className="field" placeholder="Hillcrest House" /></Field>
                <Field label="Type" htmlFor="home-type"><select id="home-type" name="type" className="field">{Object.entries(labels.homeType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
                <Field label="Address" htmlFor="home-address"><input id="home-address" name="address" className="field" /></Field>
                <Field label="City" htmlFor="home-city"><input id="home-city" name="city" className="field" defaultValue="Nashville" /></Field>
                <Field label="Capacity" htmlFor="home-capacity"><input id="home-capacity" name="capacity" type="number" min={1} max={20} className="field" defaultValue={4} /></Field>
                <Field label="House phone" htmlFor="home-phone"><input id="home-phone" name="phone" type="tel" className="field" /></Field>
              </div>
              <HomeStaffingFields prefix="new-home" />
            </ActionForm>
          </div>
        </Panel>
      )}
    </>
  );
}
