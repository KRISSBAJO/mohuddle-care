import { desc, eq } from "drizzle-orm";
import { Scale } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt } from "@/lib/format";
import { bmi, bmiBand, fastChange, feetAndInches, rangeCheck } from "@/lib/weight";
import { addWeightRecord, removeWeightRecord, setWeightPlan } from "@/server/actions/weight";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

type Person = typeof schema.individuals.$inferSelect;

/* A line of weights over time, with the suggested range shaded. Drawn on the server as plain SVG. */
function WeightLine({ points, low, high }: { points: { day: string; pounds: number }[]; low: number | null; high: number | null }) {
  const width = 640;
  const height = 160;
  const pad = 24;
  const values = [...points.map(point => point.pounds), ...(low !== null ? [low] : []), ...(high !== null ? [high] : [])];
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const times = points.map(point => Date.parse(point.day));
  const first = Math.min(...times);
  const span = Math.max(Math.max(...times) - first, 1);
  const x = (day: string) => pad + ((Date.parse(day) - first) / span) * (width - pad * 2);
  const y = (pounds: number) => height - pad - ((pounds - min) / (max - min)) * (height - pad * 2);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.day).toFixed(1)},${y(point.pounds).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto max-h-48 w-full" role="img" aria-label={`Weight from ${fmt.day(points[0].day)} to ${fmt.day(points[points.length - 1].day)}`}>
      {(low !== null || high !== null) && (
        <rect x={pad} width={width - pad * 2} y={y(high ?? max)} height={Math.max(y(low ?? min) - y(high ?? max), 0)} className="fill-sage-soft" />
      )}
      <path d={path} fill="none" strokeWidth={2} className="stroke-brand" />
      {points.map(point => (
        <circle key={point.day + point.pounds} cx={x(point.day)} cy={y(point.pounds)} r={3.5} className={cn(rangeCheck(point.pounds, low, high) ? "fill-flag" : "fill-brand")}>
          <title>{`${fmt.day(point.day)}: ${point.pounds} lb`}</title>
        </circle>
      ))}
      <text x={pad} y={14} className="fill-mute text-[11px]">{Math.round(max)} lb</text>
      <text x={pad} y={height - 6} className="fill-mute text-[11px]">{Math.round(min)} lb</text>
    </svg>
  );
}

/* Weight chart for one person: the latest weight, BMI, the range, a line over time, and every weighing. */
export async function PersonWeightPanel({ person, manager, planEditor }: { person: Person; manager: boolean; planEditor: boolean }) {
  const settings = await getSettings();
  const records = await db
    .select({ id: schema.weightRecords.id, day: schema.weightRecords.recordedOn, pounds: schema.weightRecords.pounds, bmi: schema.weightRecords.bmi, comments: schema.weightRecords.comments, signedName: schema.weightRecords.signedName })
    .from(schema.weightRecords)
    .where(eq(schema.weightRecords.individualId, person.id))
    .orderBy(desc(schema.weightRecords.recordedOn), desc(schema.weightRecords.createdAt))
    .limit(60);
  const latest = records[0] ?? null;
  const latestBmi = latest ? latest.bmi ?? bmi(latest.pounds, person.heightInches) : null;
  const band = latestBmi !== null ? bmiBand(latestBmi) : null;
  const outside = latest ? rangeCheck(latest.pounds, person.weightLow, person.weightHigh) : null;
  const change = fastChange(records.map(record => ({ day: record.day, pounds: record.pounds })), settings.weight_change_days, settings.weight_change_percent);
  const points = [...records].reverse();
  const range = person.weightLow !== null || person.weightHigh !== null ? `${person.weightLow ?? "?"} to ${person.weightHigh ?? "?"} lb` : "Not set";

  return (
    <Panel
      title="Weight chart"
      action={
        <div className="flex gap-2">
          {planEditor && (
            <ModalForm action={setWeightPlan.bind(null, person.id)} title="Weight range and height" description="The suggested range comes from their doctor or support plan. Height is used for BMI." triggerLabel="Range" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Low (lb)" htmlFor="wp-low"><input id="wp-low" name="weightLow" type="number" step="0.1" min={20} max={1000} defaultValue={person.weightLow ?? ""} className="field" /></Field>
                <Field label="High (lb)" htmlFor="wp-high"><input id="wp-high" name="weightHigh" type="number" step="0.1" min={20} max={1000} defaultValue={person.weightHigh ?? ""} className="field" /></Field>
                <Field label="Height (in)" htmlFor="wp-height"><input id="wp-height" name="heightInches" type="number" step="0.1" min={24} max={96} defaultValue={person.heightInches ?? ""} className="field" /></Field>
              </div>
            </ModalForm>
          )}
          {person.active && (
            <ModalForm action={addWeightRecord.bind(null, person.id)} title="Record a weight" description={`Suggested range: ${range}.`} triggerLabel="Record weight" submitLabel="Sign and save">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Date" htmlFor="wr-day"><input id="wr-day" name="recordedOn" type="date" required max={dateKey()} defaultValue={dateKey()} className="field" /></Field>
                <Field label="Weight (lb)" htmlFor="wr-pounds"><input id="wr-pounds" name="pounds" type="number" step="0.1" min={20} max={1000} required inputMode="decimal" className="field" /></Field>
                <Field label="Height (in)" htmlFor="wr-height" hint="Used for BMI."><input id="wr-height" name="heightInches" type="number" step="0.1" min={24} max={96} defaultValue={person.heightInches ?? ""} className="field" /></Field>
              </div>
              <Field label="Comments (optional)" htmlFor="wr-comments"><textarea id="wr-comments" name="comments" rows={2} maxLength={1000} className="field" placeholder="Weighed before breakfast, in light clothes." /></Field>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="attest" required className="mt-0.5 h-4 w-4 accent-brand" />
                <span>This weight is accurate. Saving it adds my electronic signature.</span>
              </label>
            </ModalForm>
          )}
        </div>
      }
    >
      <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Latest</p>
          <p className={cn("font-display text-xl font-bold tabular-nums", outside && "text-flag")}>{latest ? `${latest.pounds} lb` : "—"}</p>
          {latest && <p className="text-xs text-mute">{fmt.day(latest.day)}{outside ? ` · ${outside} range` : ""}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">BMI</p>
          <p className="font-display text-xl font-bold tabular-nums">{latestBmi ?? "—"}</p>
          {band ? <Badge tone={band.tone}>{band.word}</Badge> : <p className="text-xs text-mute">{person.heightInches ? "" : "Add a height"}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Suggested range</p>
          <p className="font-display text-xl font-bold tabular-nums">{range}</p>
          {person.heightInches && <p className="text-xs text-mute">Height {feetAndInches(person.heightInches)}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Last {settings.weight_change_days} days</p>
          <p className={cn("font-display text-xl font-bold tabular-nums", change && "text-[#8a5a10]")}>{change ? `${change.percent > 0 ? "+" : ""}${change.percent}%` : "Steady"}</p>
          {change && <p className="text-xs text-mute">from {change.from.pounds} lb on {fmt.day(change.from.day)}</p>}
        </div>
      </div>
      {records.length === 0 ? (
        <Empty>No weights recorded yet.</Empty>
      ) : (
        <>
          {points.length > 1 && <div className="border-b border-line px-5 py-3"><WeightLine points={points} low={person.weightLow} high={person.weightHigh} /></div>}
          <ul className="max-h-80 divide-y divide-line/60 overflow-y-auto">
            {records.map(record => (
              <li key={record.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Scale className="h-4 w-4 shrink-0 text-mute" />
                <span className="w-16 shrink-0 text-xs text-mute">{fmt.day(record.day)}</span>
                <span className={cn("w-20 shrink-0 font-semibold tabular-nums", rangeCheck(record.pounds, person.weightLow, person.weightHigh) && "text-flag")}>{record.pounds} lb</span>
                <span className="w-16 shrink-0 text-xs tabular-nums text-mute">{record.bmi ? `BMI ${record.bmi}` : ""}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-mute">{record.comments}{record.signedName ? `${record.comments ? " · " : ""}${record.signedName}` : ""}</span>
                {manager && <ConfirmAction action={removeWeightRecord.bind(null, record.id)} label="Remove" confirm="Remove this weight? Only do this for one entered by mistake." />}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
