import Link from "next/link";
import { Building2 } from "lucide-react";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { AgencyFields } from "@/components/owner/AgencyFields";
import { fmt } from "@/lib/format";
import { createAgencyAction } from "@/server/actions/owner";
import { requireOwner } from "@/server/guard";
import { listAgencies } from "@/server/owner";

// The layout's title template only reaches pages below it, so this one is written in full.
export const metadata = { title: { absolute: "Agencies | Mohuddle owner console" } };

/* Every agency on Mohuddle, and a way to add one. */
export default async function AgenciesPage() {
  await requireOwner();
  const agencies = await listAgencies();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Owner console" title="Agencies" description="Every agency using Mohuddle. A new agency starts with the standard document types, signing templates, shift patterns and daily-note sections, and its first administrator gets a setup link." />

      <Panel title={`${agencies.length} ${agencies.length === 1 ? "agency" : "agencies"}`}>
        {agencies.length === 0 ? (
          <Empty>No agencies yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-mute">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold">Agency</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Logins</th>
                  <th className="px-3 py-3 text-right font-semibold">Staff</th>
                  <th className="px-3 py-3 text-right font-semibold">People</th>
                  <th className="px-3 py-3 text-right font-semibold">Homes</th>
                  <th className="px-5 py-3 font-semibold">Last used</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map(agency => (
                  <tr key={agency.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/owner/agencies/${agency.id}`} className="flex items-center gap-2.5 font-semibold hover:text-brand">
                        <Building2 className="h-4 w-4 shrink-0 text-mute" />
                        <span>
                          {agency.name}
                          <span className="block text-xs font-normal text-mute">{agency.slug}.mohuddle.com</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{agency.active ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Turned off</Badge>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.logins}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.staff}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.people}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.homes}</td>
                    <td className="px-5 py-3 text-mute">{agency.lastSeen ? fmt.dateTime(new Date(agency.lastSeen)) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Add an agency">
        <div className="p-5">
          {/* Keyed on the count, so the form starts fresh once the new agency appears above. */}
          <LinkIssuer key={agencies.length} action={createAgencyAction} label="Create agency and get the setup link">
            <AgencyFields creating />
          </LinkIssuer>
        </div>
      </Panel>
    </div>
  );
}
