import { ActionForm } from "@/components/app/ActionForm";
import { Badge, PageHeader, Panel } from "@/components/app/ui";
import { PlanFields } from "@/components/owner/PlanFields";
import { PLAN_FEATURES, PLAN_UNITS } from "@/lib/billing";
import { money } from "@/lib/format";
import { savePlanAction } from "@/server/actions/owner";
import { listPlans } from "@/server/billing";
import { requireOwner } from "@/server/guard";

export const metadata = { title: "Plans" };

/* The plans agencies can be on: prices and features. */
export default async function PlansPage() {
  await requireOwner();
  const plans = await listPlans();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Owner console" title="Plans and prices" description="What agencies pay each month, and which features each plan includes. A change applies to every agency on the plan straight away." />
      {plans.map(plan => (
        <Panel
          key={plan.id}
          title={plan.name}
          action={
            <span className="flex items-center gap-2 text-xs text-mute">
              {money(plan.baseCents)} + {money(plan.unitCents)} per {PLAN_UNITS[plan.unit].split(" (")[0]} · {plan.features.map(key => PLAN_FEATURES.find(feature => feature.key === key)?.label).filter(Boolean).join(", ") || "no extra features"}
              {!plan.active && <Badge tone="neutral">Retired</Badge>}
            </span>
          }
        >
          <div className="p-5">
            <ActionForm action={savePlanAction.bind(null, plan.id)} submitLabel={`Save ${plan.name}`}>
              <PlanFields plan={plan} />
            </ActionForm>
          </div>
        </Panel>
      ))}
      <Panel title="Add a plan">
        <div className="p-5">
          <ActionForm action={savePlanAction.bind(null, null)} submitLabel="Add plan">
            <PlanFields />
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
