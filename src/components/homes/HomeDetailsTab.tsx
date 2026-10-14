import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { HomeStaffingFields } from "@/components/app/HomeStaffingFields";
import { Field, Panel } from "@/components/app/ui";
import { labels } from "@/lib/format";
import { setHomeActive, updateHome } from "@/server/actions/editing";
import { setHomeManagement } from "@/server/actions/homes";
import type { schema } from "@/server/db";
import { homeDetail } from "@/server/queries/hub";

type Staff = typeof schema.staff.$inferSelect;

/* Coordinators only: the home's details, its manager and budget, and closing it. */
export async function HomeDetailsTab({ homeId, staff }: { homeId: string; staff: Staff[] }) {
  const detail = await homeDetail(homeId);
  if (!detail) return null;
  const { home, residents } = detail;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
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

      <div className="space-y-6">
        <Panel title="Manager and budget">
          <div className="p-5">
            <ActionForm action={setHomeManagement.bind(null, home.id)} submitLabel="Save">
              <Field label="Home manager" htmlFor="home-manager" hint="They can approve this home's expenses and manage its issues.">
                <select id="home-manager" name="managerStaffId" className="field" defaultValue={home.managerStaffId ?? ""}>
                  <option value="">Not set</option>
                  {staff.map(person => (
                    <option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {labels.staffRole[person.role]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Monthly budget (USD)" htmlFor="home-budget" hint="Leave empty for no budget.">
                <input id="home-budget" name="monthlyBudget" inputMode="decimal" className="field" defaultValue={home.monthlyBudgetCents !== null ? (home.monthlyBudgetCents / 100).toFixed(2) : ""} placeholder="2400.00" />
              </Field>
            </ActionForm>
          </div>
        </Panel>

        <Panel title={home.active ? "Close this home" : "Reopen this home"}>
          <div className="space-y-3 p-5 text-sm">
            {home.active ? (
              residents.length > 0 ? (
                <p className="text-mute">
                  {residents.length === 1 ? "One person lives" : `${residents.length} people live`} here:{" "}
                  {residents.map((person, index) => (
                    <span key={person.id}>
                      {index > 0 && ", "}
                      <Link href={`/app/individuals/${person.id}`} className="font-semibold text-brand">{person.first} {person.last}</Link>
                    </span>
                  ))}
                  . Move them to another home from their own page before closing it.
                </p>
              ) : (
                <>
                  <p className="text-mute">
                    Closing removes its {detail.upcomingShifts} upcoming {detail.upcomingShifts === 1 ? "shift" : "shifts"} and makes the{" "}
                    {detail.staffBased} staff based here floating. Past logs, shifts, expenses and incidents stay on record.
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
    </div>
  );
}
