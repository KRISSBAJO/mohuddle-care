import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { HomeStaffingFields } from "@/components/app/HomeStaffingFields";
import { Badge, Field, PageHeader, Panel } from "@/components/app/ui";
import { label, labels } from "@/lib/format";
import { setHomeActive, updateHome } from "@/server/actions/editing";
import { requireManager } from "@/server/guard";
import { homeDetail } from "@/server/queries/hub";

export const metadata = { title: "Edit home" };

export default async function EditHomePage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await homeDetail(id);
  if (!detail) notFound();
  const { home, residents } = detail;

  return (
    <div className="max-w-3xl">
      <Link href="/app/homes" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All homes
      </Link>
      <PageHeader
        eyebrow={label("homeType", home.type)}
        title={home.name}
        description={`${residents.length} of ${home.capacity} places used.`}
        action={!home.active ? <Badge tone="neutral">Closed</Badge> : undefined}
      />

      <Panel title="Details">
        <div className="p-5">
          <ActionForm action={updateHome.bind(null, home.id)} submitLabel="Save home">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="home-name"><input id="home-name" name="name" required className="field" defaultValue={home.name} /></Field>
              <Field label="Type" htmlFor="home-type">
                <select id="home-type" name="type" className="field" defaultValue={home.type}>{Object.entries(labels.homeType).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
              </Field>
              <Field label="Address" htmlFor="home-address"><input id="home-address" name="address" className="field" defaultValue={home.address} /></Field>
              <Field label="City" htmlFor="home-city"><input id="home-city" name="city" className="field" defaultValue={home.city} /></Field>
              <Field label="Capacity" htmlFor="home-capacity" hint={residents.length ? `Cannot be lower than the ${residents.length} people living here.` : undefined}>
                <input id="home-capacity" name="capacity" type="number" min={Math.max(1, residents.length)} max={20} className="field" defaultValue={home.capacity} />
              </Field>
              <Field label="House phone" htmlFor="home-phone"><input id="home-phone" name="phone" type="tel" className="field" defaultValue={home.phone} /></Field>
            </div>
            <HomeStaffingFields staffedKinds={home.staffedKinds} openDays={home.openDays} prefix="edit-home" />
          </ActionForm>
        </div>
      </Panel>

      <Panel title={home.active ? "Close this home" : "Reopen this home"} className="mt-6">
        <div className="space-y-3 p-5 text-sm">
          {home.active ? (
            residents.length > 0 ? (
              <p className="text-mute">
                {residents.length === 1 ? "One person lives" : `${residents.length} people live`} here:{" "}
                {residents.map((person, index) => (
                  <span key={person.id}>
                    {index > 0 && ", "}
                    <Link href={`/app/individuals/${person.id}/edit`} className="font-semibold text-brand">{person.first} {person.last}</Link>
                  </span>
                ))}
                . Move them to another home from their own page before closing it.
              </p>
            ) : (
              <>
                <p className="text-mute">
                  Closing removes its {detail.upcomingShifts} upcoming {detail.upcomingShifts === 1 ? "shift" : "shifts"} and
                  makes the {detail.staffBased} staff based here floating. Past logs, shifts and incidents stay on record.
                </p>
                <ConfirmAction action={setHomeActive.bind(null, home.id, false)} label="Close home" tone="danger" confirm={`Close ${home.name}? Its upcoming shifts will be removed.`} />
              </>
            )
          ) : (
            <>
              <p className="text-mute">Reopening lists it again for people, staff and shifts.</p>
              <ConfirmAction action={setHomeActive.bind(null, home.id, true)} label="Reopen home" />
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
