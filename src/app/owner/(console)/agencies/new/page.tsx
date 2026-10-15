import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewAgencyWizard } from "@/components/owner/NewAgencyWizard";
import { billingRules, defaultPlanId, listPlans } from "@/server/billing";
import { env } from "@/server/env";
import { requireOwner } from "@/server/owner-auth";

export const metadata = { title: "Add an agency" };

/* Onboarding a new agency, step by step: its profile, web address and first administrator. */
export default async function NewAgencyPage() {
  await requireOwner();
  const [rules, planId, plans] = await Promise.all([billingRules(), defaultPlanId(), listPlans()]);
  const plan = plans.find(item => item.id === planId);
  const trialText = rules.trialDays > 0 ? `a ${rules.trialDays}-day trial${plan ? ` of ${plan.name}` : ""}` : `the ${plan?.name ?? "default"} plan`;
  return (
    <div className="space-y-6">
      <Link href="/owner/agencies" className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> All agencies</Link>
      <div>
        <p className="eyebrow">Agencies</p>
        <h1 className="mt-1 text-3xl font-bold">Add an agency</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-mute">Usually after a demo. Four short steps; the first administrator gets a link to set everything else up.</p>
      </div>
      <NewAgencyWizard baseHost={new URL(env.APP_URL).host} trialText={trialText} />
    </div>
  );
}
