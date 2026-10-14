import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { Field, PageHeader, Panel } from "@/components/app/ui";
import { CommunityTimes } from "@/components/community/CommunityTimes";
import { dateKey } from "@/lib/format";
import { createCommunityNote } from "@/server/actions/community-notes";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Community Participation note" };

/* A note for one outing or activity in the community, signed when saved. */
export default async function NewCommunityNotePage({ searchParams }: { searchParams: Promise<{ individual?: string }> }) {
  const user = await requireUser();
  const { individual } = await searchParams;
  const [settings, people, staff] = await Promise.all([
    getSettings(),
    db
      .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, home: schema.homes.name })
      .from(schema.individuals)
      .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
      .where(eq(schema.individuals.active, true))
      .orderBy(asc(schema.individuals.firstName), asc(schema.individuals.lastName)),
    db.select({ id: schema.staff.id, first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.firstName), asc(schema.staff.lastName)),
  ]);
  const person = people.find(row => row.id === individual) ?? null;
  const back = person ? `/app/individuals/${person.id}?tab=logs` : "/app/daily-logs";

  return (
    <div className="max-w-4xl">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> {person ? `${person.first}'s notes` : "Daily notes"}
      </Link>
      <PageHeader eyebrow="Note type: CP" title="Community Participation note" description="One note for each outing or activity in the community. The billable time comes from the start and end times. You sign it when you save." />

      <Panel>
        <div className="p-5 sm:p-6">
          <ActionForm action={createCommunityNote} submitLabel="Sign and save">
            {person ? (
              <div className="rounded-xl bg-panel px-4 py-3 text-sm">
                <input type="hidden" name="individualId" value={person.id} />
                <span className="text-mute">Person: </span>
                <span className="font-semibold">{person.first} {person.last}</span>
                {person.home ? <span className="text-mute"> · {person.home}</span> : null}
              </div>
            ) : (
              <Field label="Person" htmlFor="cp-person">
                <Select id="cp-person" name="individualId" required options={people.map(row => ({ value: row.id, label: `${row.first} ${row.last}`, hint: row.home ?? undefined }))} placeholder="Choose a person" />
              </Field>
            )}
            <CommunityTimes today={dateKey()} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Number of trips (optional)" htmlFor="cp-trips">
                <input id="cp-trips" name="trips" type="number" min={0} max={50} inputMode="numeric" className="field" />
              </Field>
              {settings.cp_cost_centers.length > 0 && (
                <Field label="Cost center (optional)" htmlFor="cp-cost">
                  <Select id="cp-cost" name="costCenter" options={settings.cp_cost_centers.map(value => ({ value, label: value }))} emptyLabel="None" />
                </Field>
              )}
              <Field label="Other staff with you (optional)" htmlFor="cp-with">
                <Select id="cp-with" name="withStaffId" options={staff.filter(row => row.id !== user.staffId).map(row => ({ value: row.id, label: `${row.first} ${row.last}` }))} emptyLabel="No one" />
              </Field>
            </div>
            <Field label="Other responsible party (optional)" htmlFor="cp-other" hint="Someone not on staff who was responsible, such as a family member or volunteer.">
              <input id="cp-other" name="otherParty" maxLength={200} className="field" />
            </Field>
            <Field label="How was the activity selected?" htmlFor="cp-selection">
              <textarea id="cp-selection" name="selection" rows={2} maxLength={2000} className="field" placeholder="Chose it from three options at breakfast." />
            </Field>
            <Field label="Location" htmlFor="cp-location">
              <textarea id="cp-location" name="location" rows={2} required maxLength={1000} className="field" placeholder="Public library on Main Street" />
            </Field>
            <Field label="Activity or action" htmlFor="cp-activity">
              <textarea id="cp-activity" name="activity" rows={2} required maxLength={2000} className="field" placeholder="Story time, then chose and checked out books." />
            </Field>
            <Field
              label="Note"
              htmlFor="cp-note"
              hint={`${settings.cp_note_min_chars > 0 ? `At least ${settings.cp_note_min_chars} characters. ` : ""}What happened, how they took part, and anything to follow up.`}
            >
              <textarea id="cp-note" name="note" rows={6} required minLength={settings.cp_note_min_chars || undefined} maxLength={5000} className="field" />
            </Field>
            <Field label="Learning opportunities (optional)" htmlFor="cp-learning" hint="Skills practised, choices made, or chances to learn something new.">
              <textarea id="cp-learning" name="learning" rows={4} maxLength={3000} className="field" placeholder="Used her library card at the self-checkout with one prompt." />
            </Field>
            <label className="flex items-start gap-2.5 rounded-xl border border-line px-4 py-3 text-sm">
              <input type="checkbox" name="attest" required className="mt-0.5 h-4 w-4 accent-brand" />
              <span>
                This note is accurate. Saving it adds my electronic signature, <span className="font-semibold">{user.name}</span>, with the date and time.
              </span>
            </label>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
