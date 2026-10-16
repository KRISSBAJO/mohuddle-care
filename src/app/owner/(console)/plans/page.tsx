import Link from "next/link";
import { Check, Layers, Pencil, Plus, X } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { OwnerCard } from "@/components/owner/OwnerCard";
import { PlanFields } from "@/components/owner/PlanFields";
import { monthlyCents, PLAN_FEATURES, PLAN_UNITS } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { savePlanAction } from "@/server/actions/owner";
import { billingOverview, defaultPlanId, listPlans } from "@/server/billing";
import { requireOwner } from "@/server/owner-auth";

export const metadata = { title: "Plans" };

// The example agency size used to show what each plan costs in practice.
const EXAMPLE = 10;
const MANY = { person: "people supported", staff: "active staff", home: "homes", none: "" } as const;

/* The plans agencies can be on: prices and features. */
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireOwner();
  const [plans, rows, defaultPlan] = await Promise.all([listPlans(), billingOverview(), defaultPlanId()]);
  const { edit } = await searchParams;
  const editing = edit === "new" ? "new" : plans.find(plan => plan.id === edit) ?? null;
  const onPlan = (id: string) => rows.filter(row => row.plan?.id === id && row.agency.active).length;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] p-6 text-white shadow-[0_24px_60px_-30px_#0e2a24] sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#dcef98]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Money</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Plans and prices</h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">What agencies pay each month, and which features each plan includes. A change applies to every agency on the plan straight away.</p>
          </div>
          <Link href="/owner/plans?edit=new#editor" className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-[#dcef98] px-3.5 py-2 text-[13px] font-semibold text-[#173e35] hover:brightness-95 sm:self-auto"><Plus className="h-4 w-4" /> Add a plan</Link>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => {
          const selected = editing !== "new" && editing?.id === plan.id;
          const count = onPlan(plan.id);
          return (
            <section key={plan.id} className={cn("card relative flex flex-col p-6 transition", selected && "ring-2 ring-brand", !plan.active && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{plan.name}</h2>
                  <p className="mt-1 min-h-10 text-sm text-mute">{plan.description || "No description yet."}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {plan.id === defaultPlan && <span className="rounded-full bg-[#dcef98] px-2.5 py-0.5 text-[11px] font-semibold text-[#173e35]">New agencies</span>}
                  {!plan.active && <span className="rounded-full bg-[var(--color-panel)] px-2.5 py-0.5 text-[11px] font-semibold text-mute">Retired</span>}
                </div>
              </div>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tabular-nums tracking-tight">{money(plan.baseCents, true)}</span>
                <span className="text-sm text-mute">a month</span>
              </p>
              <p className="mt-1 text-sm text-mute">{plan.unit === "none" ? "Flat price" : `+ ${money(plan.unitCents)} per ${PLAN_UNITS[plan.unit].split(" (")[0]}`}</p>
              {plan.unit !== "none" && (
                <p className="mt-3 rounded-xl bg-[var(--color-panel)]/60 px-3 py-2 text-xs text-mute">
                  With {EXAMPLE} {MANY[plan.unit]}: <span className="font-semibold text-ink">{money(monthlyCents(plan, EXAMPLE))} a month</span>
                </p>
              )}

              <ul className="mt-5 flex-1 space-y-2.5 border-t border-line pt-5 text-sm">
                {PLAN_FEATURES.map(feature => {
                  const has = plan.features.includes(feature.key);
                  return (
                    <li key={feature.key} className={cn("flex items-center gap-2.5", !has && "text-dim")}>
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", has ? "bg-sage-soft text-sage" : "bg-[var(--color-panel)]")}>{has ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
                      {feature.label}
                    </li>
                  );
                })}
                <li className="flex items-center gap-2.5 text-mute">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sage-soft text-sage"><Check className="h-3 w-3" /></span>
                  Everything else
                </li>
              </ul>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-xs text-mute">{count} {count === 1 ? "agency" : "agencies"} on it</span>
                <Link href={`/owner/plans?edit=${plan.id}#editor`} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", selected ? "bg-brand text-white" : "bg-[var(--color-panel)] hover:bg-sky")}>
                  <Pencil className="h-3.5 w-3.5" /> {selected ? "Editing" : "Edit"}
                </Link>
              </div>
            </section>
          );
        })}

        <Link href="/owner/plans?edit=new#editor" className={cn("group grid min-h-64 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition", editing === "new" ? "border-brand bg-sky/40" : "border-line hover:border-brand/50 hover:bg-white")}>
          <span>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-panel)] text-mute transition group-hover:bg-sky group-hover:text-brand"><Plus className="h-6 w-6" /></span>
            <span className="mt-3 block font-semibold">Add a plan</span>
            <span className="block text-sm text-mute">A new price or set of features</span>
          </span>
        </Link>
      </div>

      {editing && (
        <div id="editor" className="wizard-step scroll-mt-6" key={editing === "new" ? "new" : editing.id}>
          <OwnerCard title={editing === "new" ? "Add a plan" : `Edit ${editing.name}`} icon={Layers} action={<Link href="/owner/plans" scroll={false} className="text-xs font-semibold text-mute hover:text-ink">Close</Link>}>
            <div className="p-6">
              <ActionForm action={savePlanAction.bind(null, editing === "new" ? null : editing.id)} submitLabel={editing === "new" ? "Add plan" : `Save ${editing.name}`}>
                <PlanFields plan={editing === "new" ? undefined : editing} />
              </ActionForm>
            </div>
          </OwnerCard>
        </div>
      )}
    </div>
  );
}
