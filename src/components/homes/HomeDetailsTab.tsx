import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { HomeFormFields } from "@/components/app/HomeFormFields";
import { Field, Panel } from "@/components/app/ui";
import { labels } from "@/lib/format";
import { setHomeActive, updateHome } from "@/server/actions/editing";
import { setHomeManagement } from "@/server/actions/homes";
import type { schema } from "@/server/db";
import { homeDetail } from "@/server/queries/hub";
import { activePatterns } from "@/server/queries/patterns";
import { configAbove, requirementsAt } from "@/server/queries/note-requirements";
import { NoteRequirementsEditor } from "@/components/logs/NoteRequirementsEditor";
import { SearchSelect } from "@/components/app/SearchSelect";
import { HomeLocationFields } from "@/components/clock/HomeLocationFields";
import { saveHomeClock } from "@/server/actions/timeclock";
import { getSettings } from "@/server/settings";

type Staff = typeof schema.staff.$inferSelect;

/* Coordinators only: the home's details, its manager and budget, and closing it. */
export async function HomeDetailsTab({ homeId, staff }: { homeId: string; staff: Staff[] }) {
  const [detail, patterns, noteRows, agencyNote, settings] = await Promise.all([homeDetail(homeId), activePatterns(), requirementsAt("home", homeId), configAbove(null), getSettings()]);
  if (!detail) return null;
  const { home, residents } = detail;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel title="Details">
        <div className="p-5">
          <ActionForm action={updateHome.bind(null, home.id)} submitLabel="Save home">
            <HomeFormFields home={home} patterns={patterns} minCapacity={Math.max(1, residents.length)} />
          </ActionForm>
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel title="Manager and budget">
          <div className="p-5">
            <ActionForm action={setHomeManagement.bind(null, home.id)} submitLabel="Save">
              <Field label="Home manager" htmlFor="home-manager" hint="They can approve this home's expenses and manage its issues.">
                <SearchSelect id="home-manager" name="managerStaffId" defaultValue={home.managerStaffId ?? ""} emptyLabel="Not set" placeholder="Search staff" options={staff.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}`, hint: labels.staffRole[person.role as keyof typeof labels.staffRole] }))} />
              </Field>
              <Field label="Monthly budget (USD)" htmlFor="home-budget" hint="Leave empty for no budget.">
                <input id="home-budget" name="monthlyBudget" inputMode="decimal" className="field" defaultValue={home.monthlyBudgetCents !== null ? (home.monthlyBudgetCents / 100).toFixed(2) : ""} placeholder="2400.00" />
              </Field>
            </ActionForm>
          </div>
        </Panel>

        <Panel title="Time clock">
          <div className="p-5">
            <p className="mb-4 text-xs text-mute">Staff must be within {settings.clock_geofence_meters} m of this point to clock in or out without giving a reason. Leave both empty to skip the distance check here.</p>
            <ActionForm action={saveHomeClock.bind(null, home.id)} submitLabel="Save time clock">
              <HomeLocationFields latitude={home.latitude} longitude={home.longitude} address={[home.address, home.city, home.zip].filter(Boolean).join(", ")} />
              <Field label="Extra handover ticks for this home" htmlFor="home-handover" hint={`One per line. Added to the ${settings.handover_checks.length} ticks every home has.`}>
                <textarea id="home-handover" name="handoverChecks" rows={3} className="field" defaultValue={home.handoverChecks.join("\n")} placeholder={"Hoyer lift charged\nSharps box checked"} />
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

      <section className="xl:col-span-2">
        <h2 className="text-xl font-bold">Daily notes at {home.name}</h2>
        <p className="mb-4 text-sm text-mute">Sections and questions here appear on notes for everyone living at {home.name}, on top of the agency default.</p>
        <NoteRequirementsEditor scope="home" targetId={home.id} name={home.name} above={agencyNote} rows={noteRows} manager />
      </section>
    </div>
  );
}
