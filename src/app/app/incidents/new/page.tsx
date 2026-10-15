import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/ui";
import { ReportableEventForm } from "@/components/incidents/ReportableEventForm";
import { dateKey, zone } from "@/lib/format";
import { submitReportableEvent } from "@/server/actions/incidents";
import { requireUser } from "@/server/guard";
import { incidentFormData } from "@/server/queries/incident-form";

export const metadata = { title: "Report an incident" };

const isUuid = (value?: string) => Boolean(value && /^[0-9a-f-]{36}$/.test(value));
const clock = () => new Intl.DateTimeFormat("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

/*
 * The Reportable Event Form. Opened from a person, they are already chosen and their details filled
 * in; opened from a home, only that home's residents are offered and the address is the home's.
 */
export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ individual?: string; home?: string }> }) {
  const user = await requireUser();
  const { individual, home } = await searchParams;
  const data = await incidentFormData();
  const person = isUuid(individual) ? data.people.find(item => item.id === individual) ?? null : null;
  const homeRow = !person && isUuid(home) ? data.homes.find(item => item.id === home) ?? null : null;
  const back = person ? { href: `/app/individuals/${person.id}?tab=incidents`, text: `Back to ${person.name.split(" ")[0]}` } : homeRow ? { href: `/app/homes/${homeRow.id}`, text: `Back to ${homeRow.name}` } : { href: "/app/incidents", text: "All incidents" };

  return (
    <div className="max-w-4xl">
      <Link href={back.href} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> {back.text}
      </Link>
      <PageHeader
        eyebrow={person ? `Incident · ${person.name}` : homeRow ? `Incident · ${homeRow.name}` : "Incidents"}
        title="Reportable Event Form"
        description={`Write it while it is fresh. Tier 1 events must reach DIDD Investigations within ${data.tier1Hours} hours; reportable events are filed within ${data.fileHours} hours.`}
      />
      <ReportableEventForm action={submitReportableEvent} data={data} lockedPersonId={person?.id ?? null} homeId={homeRow?.id ?? null} reporter={user.name} today={dateKey()} nowTime={clock()} />
    </div>
  );
}
