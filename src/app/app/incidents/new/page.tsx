import { ActionForm } from "@/components/app/ActionForm";
import { Field, PageHeader } from "@/components/app/ui";
import { labels } from "@/lib/format";
import { createIncident } from "@/server/actions/hub";
import { requireUser } from "@/server/guard";
import { listHomes, listIndividuals } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Report an incident" };

function nowLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ individual?: string }> }) {
  await requireUser();
  const { individual } = await searchParams;
  const [people, homes, settings] = await Promise.all([listIndividuals(), listHomes(), getSettings()]);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Incidents" title="Report an incident" description={`Write it while it is fresh. If it is reportable, the office must file it with the state within ${settings.incident_report_hours} hours.`} />
      <ActionForm action={createIncident} submitLabel="Submit report" className="card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Person involved" htmlFor="individualId">
            <select id="individualId" name="individualId" className="field" defaultValue={individual ?? ""}>
              <option value="">No specific person</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
            </select>
          </Field>
          <Field label="Home or location" htmlFor="homeId">
            <select id="homeId" name="homeId" className="field" defaultValue="">
              <option value="">Elsewhere or not applicable</option>
              {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}
            </select>
          </Field>
          <Field label="When it happened" htmlFor="occurredAt"><input id="occurredAt" name="occurredAt" type="datetime-local" required className="field" defaultValue={nowLocal()} /></Field>
          <Field label="Category" htmlFor="category">
            <select id="category" name="category" className="field">{Object.entries(labels.incidentCategory).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
          </Field>
          <Field label="Severity" htmlFor="severity">
            <select id="severity" name="severity" className="field" defaultValue="low">{Object.entries(labels.incidentSeverity).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
          </Field>
          <label className="flex items-center gap-2.5 self-end rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-flag has-[:checked]:bg-flag-soft">
            <input type="checkbox" name="reportable" className="h-4 w-4 accent-[#d2543f]" /> Reportable to the state
          </label>
        </div>
        <Field label="What happened" htmlFor="description" hint="Facts only: what you saw and heard, in order. No opinions about why."><textarea id="description" name="description" rows={5} required className="field" /></Field>
        <Field label="What was done" htmlFor="actionsTaken"><textarea id="actionsTaken" name="actionsTaken" rows={3} className="field" placeholder="First aid given, nurse called, guardian informed at 3:40pm" /></Field>
      </ActionForm>
    </div>
  );
}
