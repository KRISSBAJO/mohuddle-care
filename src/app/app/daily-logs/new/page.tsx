import { ActionForm } from "@/components/app/ActionForm";
import { Field, PageHeader } from "@/components/app/ui";
import { dateKey, labels } from "@/lib/format";
import { createDailyLog } from "@/server/actions/hub";
import { requireUser } from "@/server/guard";
import { listIndividuals } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "New daily log" };

export default async function NewDailyLogPage({ searchParams }: { searchParams: Promise<{ individual?: string }> }) {
  await requireUser();
  const { individual } = await searchParams;
  const [people, settings] = await Promise.all([listIndividuals(), getSettings()]);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Daily logs" title="Write a daily log" description={`Logs are due by ${settings.daily_log_due_hour}:00. Write what you saw, plainly. Families and reviewers read these.`} />
      <ActionForm action={createDailyLog} submitLabel="Save log" className="card p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Person" htmlFor="individualId">
              <select id="individualId" name="individualId" required className="field" defaultValue={individual ?? ""}>
                <option value="" disabled>Choose a person</option>
                {people.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}{person.home ? ` · ${person.home}` : ""}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Date" htmlFor="logDate"><input id="logDate" name="logDate" type="date" required className="field" defaultValue={dateKey()} /></Field>
        </div>
        <fieldset>
          <legend className="label">Mood today</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(labels.mood).map(([value, text]) => (
              <label key={value} className="cursor-pointer rounded-full border border-line px-3.5 py-2 text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-sky has-[:checked]:text-brand-deep">
                <input type="radio" name="mood" value={value} defaultChecked={value === "good"} className="sr-only" /> {text}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Required checks</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {settings.required_daily_checks.map(item => (
              <label key={item} className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-sage has-[:checked]:bg-sage-soft">
                <input type="checkbox" name="checks" value={item} className="h-4 w-4 accent-[#3e8e6a]" /> {item}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Meals and fluids" htmlFor="meals"><input id="meals" name="meals" className="field" placeholder="Ate well at breakfast and lunch, declined snack" /></Field>
        <Field label="Activities and community" htmlFor="activities"><textarea id="activities" name="activities" rows={3} className="field" placeholder="Where they went, who they saw, what they enjoyed" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Health and wellbeing" htmlFor="health"><textarea id="health" name="health" rows={3} className="field" placeholder="Sleep, pain, appointments, anything a nurse should know" /></Field>
          <Field label="Behaviours of concern" htmlFor="behaviours"><textarea id="behaviours" name="behaviours" rows={3} className="field" placeholder="What happened, what helped. Report incidents separately." /></Field>
        </div>
        <Field label="Progress on goals" htmlFor="goalProgress"><input id="goalProgress" name="goalProgress" className="field" placeholder="Practised bus route with support, needed one prompt" /></Field>
        <Field label="Anything else for the next shift" htmlFor="notes"><textarea id="notes" name="notes" rows={2} className="field" /></Field>
      </ActionForm>
    </div>
  );
}
