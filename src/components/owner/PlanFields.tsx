import { Select } from "@/components/app/Select";
import { PLAN_FEATURES, PLAN_UNITS } from "@/lib/billing";

type Plan = { name: string; description: string; baseCents: number; unitCents: number; unit: string; features: string[]; active: boolean; sortOrder: number };

const blank: Plan = { name: "", description: "", baseCents: 0, unitCents: 0, unit: "person", features: [], active: true, sortOrder: 9 };
const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");

/* A plan's name, prices and features. */
export function PlanFields({ plan = blank }: { plan?: Plan }) {
  const label = "grid gap-1.5 text-sm font-medium";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={label}>Name<input name="name" required maxLength={60} defaultValue={plan.name} className="field" /></label>
      <label className={label}>Order in lists<input name="sortOrder" type="number" min={0} max={99} defaultValue={plan.sortOrder} className="field" /></label>
      <label className={`${label} sm:col-span-2`}>Description<input name="description" maxLength={300} defaultValue={plan.description} className="field" placeholder="What agencies get" /></label>
      <label className={label}>Base price a month ($)<input name="base" inputMode="decimal" required defaultValue={dollars(plan.baseCents)} className="field" /></label>
      <label className={label}>Plus, for each ($)<input name="perUnit" inputMode="decimal" required defaultValue={dollars(plan.unitCents)} className="field" /></label>
      <div className={`${label} sm:col-span-2`}>
        <span>Counting each</span>
        <Select name="unit" defaultValue={plan.unit} options={Object.entries(PLAN_UNITS).map(([value, words]) => ({ value, label: words }))} aria-label="What the per-unit price counts" />
      </div>
      <fieldset className="grid gap-2.5 sm:col-span-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Included features</legend>
        {PLAN_FEATURES.map(feature => (
          <label key={feature.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 text-sm transition hover:border-brand/40 has-[:checked]:border-brand has-[:checked]:bg-sky/40">
            <input type="checkbox" name="features" value={feature.key} defaultChecked={plan.features.includes(feature.key)} className="mt-0.5 h-4 w-4 accent-[#173e35]" />
            <span><span className="block font-semibold">{feature.label}</span> <span className="block text-xs text-mute">{feature.help}</span></span>
          </label>
        ))}
        <p className="text-xs text-mute lg:col-span-3">Everything else (notes, medications, schedules, time clock, incidents, documents) comes with every plan.</p>
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-[var(--color-panel)]/60 p-3.5 text-sm sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={plan.active} className="h-4 w-4 accent-[#173e35]" /> Offered to agencies (switch off to retire a plan; agencies already on it keep it)
      </label>
    </div>
  );
}
