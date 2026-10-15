import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { PageHeader, Panel } from "@/components/app/ui";
import { AgencyFields } from "@/components/owner/AgencyFields";
import { createAgencyAction } from "@/server/actions/owner";
import { requireOwner } from "@/server/owner-auth";
import { listAgencies } from "@/server/owner";

export const metadata = { title: "Add an agency" };

const STARTS_WITH = ["The 40 standard document types for staff, people supported and the business", "The standard documents to sign", "Five shift patterns: weekday day, evening and overnight; weekend day and night", "The daily-note sections, and the service question library switched off", "A free trial of the default plan"];

/* Onboarding a new agency: its profile, web address and first administrator. */
export default async function NewAgencyPage() {
  await requireOwner();
  const agencies = await listAgencies();
  return (
    <div className="space-y-8">
      <Link href="/owner/agencies" className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> All agencies</Link>
      <PageHeader eyebrow="Agencies" title="Add an agency" description="Usually after a demo. The agency's first administrator gets a setup link, emailed and shown here to copy, and sets up their homes, staff and people from there." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="The agency">
          <div className="p-5">
            {/* Keyed on the count, so the form starts fresh once the agency is made and "Done" is pressed. */}
            <LinkIssuer key={agencies.length} action={createAgencyAction} label="Create the agency and its setup link">
              <AgencyFields creating />
            </LinkIssuer>
          </div>
        </Panel>
        <Panel title="It starts with">
          <ul className="space-y-3 p-5 text-sm">
            {STARTS_WITH.map(line => (
              <li key={line} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> {line}</li>
            ))}
            <li className="border-t border-line pt-3 text-xs text-mute">The administrator can change all of it in their Settings. Nothing from any other agency is copied.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
