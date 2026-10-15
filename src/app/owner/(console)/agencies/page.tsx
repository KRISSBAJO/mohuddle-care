import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { fmt } from "@/lib/format";
import { agencyBilling } from "@/server/billing";
import { requireOwner } from "@/server/owner-auth";
import { listAgencies } from "@/server/owner";

export const metadata = { title: "Agencies" };

/* Every agency on Mohuddle, with its size, standing and when it was last used. */
export default async function AgenciesPage() {
  await requireOwner();
  const agencies = await listAgencies();
  const billing = new Map(await Promise.all(agencies.map(async agency => [agency.id, await agencyBilling(agency.id)] as const)));
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agencies"
        title="All agencies"
        description="Every agency using Mohuddle. Open one for its profile, administrators, plan, payments and support visits."
        action={<Link href="/owner/agencies/new" className="btn-brand btn-sm"><Plus className="h-4 w-4" /> Add an agency</Link>}
      />

      <Panel title={`${agencies.length} ${agencies.length === 1 ? "agency" : "agencies"}`}>
        {agencies.length === 0 ? (
          <Empty>No agencies yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-mute">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold">Agency</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Plan</th>
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
                    <td className="px-3 py-3">
                      <span className="flex flex-col items-start gap-1">
                        <span className="text-xs text-mute">{billing.get(agency.id)?.plan?.name ?? "No plan"}</span>
                        {billing.get(agency.id) && <BillingBadge status={billing.get(agency.id)!.billing.status} state={billing.get(agency.id)!.state} />}
                      </span>
                    </td>
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

    </div>
  );
}
