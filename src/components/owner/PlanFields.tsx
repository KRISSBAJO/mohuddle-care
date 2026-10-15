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
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Included features</legend>
        {PLAN_FEATURES.map(feature => (
          <label key={feature.key} className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="features" value={feature.key} defaultChecked={plan.features.includes(feature.key)} className="mt-1" />
            <span><span className="font-semibold">{feature.label}</span> <span className="text-mute">{feature.help}</span></span>
          </label>
        ))}
        <p className="text-xs text-mute">Everything else (notes, medications, schedules, time clock, incidents, documents) comes with every plan.</p>
      </fieldset>
      <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={plan.active} /> Offered to agencies (switch off to retire a plan; agencies already on it keep it)
      </label>
    </div>
  );
}
