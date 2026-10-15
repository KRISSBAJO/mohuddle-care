import Link from "next/link";
import { CheckCircle2, CircleAlert, DollarSign, Hourglass } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { PageHeader, Panel, Stat } from "@/components/app/ui";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { unitCount } from "@/lib/billing";
import { money } from "@/lib/format";
import { saveBillingRulesAction } from "@/server/actions/owner";
import { billingOverview, billingRules, defaultPlanId, listPlans } from "@/server/billing";
import { requireOwner } from "@/server/guard";

export const metadata = { title: "Billing" };

/* Every agency's plan and where it stands, what Mohuddle earns a month, and the billing rules. */
export default async function BillingPage() {
  await requireOwner();
  const [rows, rules, plans, defaultPlan] = await Promise.all([billingOverview(), billingRules(), listPlans(), defaultPlanId()]);
  // What paying agencies bring in a month; trials are not counted until they pay.
  const monthly = rows.filter(row => row.billing.status === "active" && row.state.mode !== "read_only").reduce((sum, row) => sum + row.monthly, 0);
  const count = (test: (row: (typeof rows)[number]) => boolean) => rows.filter(test).length;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Owner console" title="Billing" description="Each agency's plan and where it stands. Payments are recorded by hand on each agency's page; no card is charged." action={<Link href="/owner/plans" className="btn-ghost btn-sm">Plans and prices</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={DollarSign} label="A month from paying agencies" value={money(monthly, true)} />
        <Stat icon={CheckCircle2} tone="good" label="Paying" value={count(row => row.billing.status === "active" && row.state.mode !== "read_only")} />
        <Stat icon={Hourglass} tone="warn" label="On trial" value={count(row => row.billing.status === "trial" && row.state.mode !== "read_only")} />
        <Stat icon={CircleAlert} tone="bad" label="Past due or read-only" value={count(row => row.state.mode === "past_due" || row.state.mode === "read_only")} />
      </div>

      <Panel title="Agencies">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-mute">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Agency</th>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 font-semibold">Standing</th>
                <th className="px-3 py-3 text-right font-semibold">Counted</th>
                <th className="px-5 py-3 text-right font-semibold">A month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.agency.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3"><Link href={`/owner/agencies/${row.agency.id}#billing`} className="font-semibold hover:text-brand">{row.agency.name}</Link></td>
                  <td className="px-3 py-3">{row.plan?.name ?? <span className="text-mute">No plan</span>}</td>
                  <td className="px-3 py-3"><BillingBadge status={row.billing.status} state={row.state} /></td>
                  <td className="px-3 py-3 text-right tabular-nums text-mute">{row.plan && row.plan.unit !== "none" ? unitCount(row.plan.unit, row.units) : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row.billing.status === "active" ? <span className="font-semibold">{money(row.monthly)}</span> : row.billing.status === "trial" ? <span className="text-mute">{money(row.monthly)} after the trial</span> : <span className="text-mute">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Billing rules">
        <div className="p-5">
          <ActionForm action={saveBillingRulesAction} submitLabel="Save rules">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1.5 text-sm font-medium">Free trial<span className="flex items-center gap-2"><input name="trialDays" type="number" min={0} max={365} required defaultValue={rules.trialDays} className="field" /> days</span></label>
              <label className="grid gap-1.5 text-sm font-medium">Grace after a lapse<span className="flex items-center gap-2"><input name="graceDays" type="number" min={0} max={365} required defaultValue={rules.graceDays} className="field" /> days</span></label>
              <label className="grid gap-1.5 text-sm font-medium">Warn administrators<span className="flex items-center gap-2"><input name="warnDays" type="number" min={0} max={365} required defaultValue={rules.warnDays} className="field" /> days before</span></label>
              <div className="grid gap-1.5 text-sm font-medium">
                <span>New agencies start on</span>
                <Select name="defaultPlan" defaultValue={defaultPlan ?? ""} options={plans.filter(plan => plan.active).map(plan => ({ value: plan.id, label: plan.name }))} aria-label="Plan for new agencies" />
              </div>
            </div>
            <p className="text-xs text-mute">A trial ends on its last day. A paid period gets the grace days after it, with a warning. After that the agency is read-only: everyone can still sign in and see everything, but nothing can be changed until it is renewed.</p>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
