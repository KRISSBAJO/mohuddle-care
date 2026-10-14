import { Building2, CalendarClock, MapPin, NotebookPen, UserRound } from "lucide-react";
import { HomeStaffingFields } from "@/components/app/HomeStaffingFields";
import { Field } from "@/components/app/ui";
import { labels } from "@/lib/format";
import type { ShiftPattern } from "@/lib/schedule";
import type { schema } from "@/server/db";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Select } from "@/components/app/Select";

type Home = typeof schema.homes.$inferSelect;
type Staff = { id: string; firstName: string; lastName: string; role: string };

// Counties around Nashville that Milestone serves or may serve. Any other name can be typed.
const COUNTIES = ["Davidson", "Rutherford", "Williamson", "Wilson", "Sumner", "Maury", "Robertson", "Cheatham", "Dickson"];

function Section({ icon: Icon, title, hint, children }: { icon: typeof MapPin; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line pb-6 last:border-b-0 last:pb-0 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Icon className="h-4 w-4 text-brand" aria-hidden="true" /> {title}
        </h2>
        {hint && <p className="mt-1 text-xs leading-relaxed text-mute">{hint}</p>}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

/*
 * Every field of a home, in sections. Used by "Add a home" and by the Details tab, so both always
 * send the full set and nothing is saved empty by accident.
 */
export function HomeFormFields({ home, staff, patterns, includeManagement = false, minCapacity = 1 }: { home?: Home; staff?: Staff[]; patterns: ShiftPattern[]; includeManagement?: boolean; minCapacity?: number }) {
  return (
    <div className="grid gap-6">
      <Section icon={Building2} title="The home" hint="What it is called and the kind of support it gives.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="home-name"><input id="home-name" name="name" required minLength={2} maxLength={80} className="field" defaultValue={home?.name} placeholder="Hillcrest House" /></Field>
          <Field label="Type" htmlFor="home-type">
            <Select id="home-type" name="type" defaultValue={home?.type ?? "group_home"} options={Object.entries(labels.homeType).map(([value, text]) => ({ value, label: text }))} />
          </Field>
          <Field label="Places (capacity)" htmlFor="home-capacity" hint={minCapacity > 1 ? `At least ${minCapacity}, the people living here now.` : "How many people can live or attend here."}>
            <input id="home-capacity" name="capacity" type="number" required min={minCapacity} max={20} className="field" defaultValue={home?.capacity ?? 4} />
          </Field>
          <Field label="Opened" htmlFor="home-opened"><input id="home-opened" name="openedOn" type="date" className="field" defaultValue={home?.openedOn ?? ""} /></Field>
          <Field label="State licence number" htmlFor="home-licence" hint="Department of Disability and Aging licence, if it has its own.">
            <input id="home-licence" name="licenseNumber" maxLength={60} className="field" defaultValue={home?.licenseNumber} />
          </Field>
        </div>
      </Section>

      <Section icon={MapPin} title="Where it is" hint="Used for directions, mileage and the state's records.">
        <Field label="Street address" htmlFor="home-address"><input id="home-address" name="address" maxLength={200} autoComplete="off" className="field" defaultValue={home?.address} placeholder="4120 Hillcrest Drive" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="home-city"><input id="home-city" name="city" required maxLength={80} className="field" defaultValue={home?.city ?? "Nashville"} /></Field>
          <Field label="County" htmlFor="home-county">
            <input id="home-county" name="county" list="home-counties" maxLength={60} className="field" defaultValue={home?.county} placeholder="Davidson" />
            <datalist id="home-counties">{COUNTIES.map(name => <option key={name} value={name} />)}</datalist>
          </Field>
          <Field label="ZIP code" htmlFor="home-zip"><input id="home-zip" name="zip" inputMode="numeric" maxLength={10} className="field" defaultValue={home?.zip} placeholder="37217" /></Field>
        </div>
        <Field label="House phone" htmlFor="home-phone"><input id="home-phone" name="phone" type="tel" maxLength={40} className="field sm:max-w-xs" defaultValue={home?.phone} /></Field>
      </Section>

      <Section icon={CalendarClock} title="Staffing needs" hint="The schedule warns you about a gap only for these shifts on these days.">
        <HomeStaffingFields patterns={patterns} staffedPatterns={home ? home.staffedPatterns : null} openDays={home?.openDays} prefix={home ? "edit-home" : "new-home"} />
      </Section>

      {includeManagement && staff && (
        <Section icon={UserRound} title="Manager and budget" hint="The manager can approve this home's expenses and runs its issues. Both can be changed later.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Home manager" htmlFor="home-manager">
              <SearchSelect id="home-manager" name="managerStaffId" defaultValue="" emptyLabel="Choose later" placeholder="Search staff" options={staff.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}`, hint: labels.staffRole[person.role as keyof typeof labels.staffRole] }))} />
            </Field>
            <Field label="Monthly budget (USD)" htmlFor="home-budget" hint="Leave empty for no budget.">
              <input id="home-budget" name="monthlyBudget" inputMode="decimal" className="field" placeholder="2400" />
            </Field>
          </div>
        </Section>
      )}

      <Section icon={NotebookPen} title="House notes" hint="What a new staff member needs on their first shift. Never write door codes or passwords here.">
        <textarea
          id="home-notes"
          name="notes"
          rows={4}
          maxLength={2000}
          className="field"
          defaultValue={home?.notes}
          placeholder="Park on the street, not the driveway. Side door is the main entrance. Quiet hours after 9pm."
          aria-label="House notes"
        />
      </Section>
    </div>
  );
}
