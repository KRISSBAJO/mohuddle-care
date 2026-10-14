import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { Avatar, Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { initials, label, labels } from "@/lib/format";
import { createHome } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { homesWithOccupancy } from "@/server/queries/hub";

export const metadata = { title: "Homes" };

export default async function HomesPage() {
  const user = await requireUser();
  const homes = await homesWithOccupancy();
  return (
    <>
      <PageHeader eyebrow="Homes" title={`${homes.length} homes and settings`} description="Group homes, family model homes, supported living and the day program." />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {homes.length === 0 && <Panel><Empty>No homes yet.</Empty></Panel>}
        {homes.map(home => (
          <Panel key={home.id}>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{home.name}</h2>
                  <p className="text-sm text-mute">{home.address}{home.address && ", "}{home.city}</p>
                </div>
                <Badge tone="brand">{label("homeType", home.type)}</Badge>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-mute">{home.residents.length} of {home.capacity} places</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (home.residents.length / Math.max(1, home.capacity)) * 100)}%` }} /></div>
              <ul className="mt-4 space-y-2">
                {home.residents.map(person => (
                  <li key={person.id}><Link href={`/app/individuals/${person.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-brand"><Avatar initials={initials(person.first, person.last)} size="sm" /> {person.first} {person.last}</Link></li>
                ))}
                {home.residents.length === 0 && <li className="text-sm text-mute">No one placed here yet.</li>}
              </ul>
              {home.phone && <p className="mt-4 text-xs text-mute">House phone {home.phone}</p>}
            </div>
          </Panel>
        ))}
      </div>
      {canManage(user) && (
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
            </ActionForm>
          </div>
        </Panel>
      )}
    </>
  );
}
