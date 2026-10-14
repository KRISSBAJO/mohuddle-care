import { and, count, eq, gte, isNotNull } from "drizzle-orm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { SettingsNav } from "@/components/app/SettingsNav";
import { Badge, Field, PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { kindFor } from "@/lib/schedule";
import { savePattern, setPatternActive } from "@/server/actions/patterns";
import { db, schema } from "@/server/db";
import { requireManager } from "@/server/guard";
import { requestTime } from "@/server/clock";
import { allPatterns } from "@/server/queries/patterns";

export const metadata = { title: "Shift patterns" };

type Pattern = typeof schema.shiftPatterns.$inferSelect;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const colour = { day: "bg-brand", evening: "bg-plum", overnight: "bg-ink" } as const;
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const lengthOf = (pattern: Pick<Pattern, "start" | "end">) => (minutes(pattern.end) - minutes(pattern.start) + 1440) % 1440 || 1440;
const hours = (mins: number) => `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
const clock = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/* Each weekday as 24 hours: the patterns that run in it, including the morning end of last night's overnight. */
function dayMap(patterns: Pattern[], weekday: number) {
  const previous = weekday === 1 ? 7 : weekday - 1;
  const segments: { pattern: Pattern; from: number; to: number }[] = [];
  for (const pattern of patterns) {
    const start = minutes(pattern.start);
    const end = minutes(pattern.end);
    const overnight = end <= start;
    if (pattern.weekdays.includes(weekday)) segments.push({ pattern, from: start, to: overnight ? 1440 : end });
    if (overnight && end > 0 && pattern.weekdays.includes(previous)) segments.push({ pattern, from: 0, to: end });
  }
  const covered = new Array<boolean>(1440).fill(false);
  for (const segment of segments) for (let m = segment.from; m < segment.to; m++) covered[m] = true;
  const gaps: [number, number][] = [];
  for (let m = 0; m < 1440; m++) {
    if (covered[m]) continue;
    const startGap = m;
    while (m < 1440 && !covered[m]) m++;
    gaps.push([startGap, m]);
  }
  return { segments, gaps };
}

function PatternFields({ pattern, prefix }: { pattern?: Pattern; prefix: string }) {
  return (
    <>
      <Field label="Name" htmlFor={`${prefix}-name`} hint="What staff see on the schedule, for example Weekend day.">
        <input id={`${prefix}-name`} name="name" required minLength={2} maxLength={60} className="field" defaultValue={pattern?.name} placeholder="Weekend day" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Starts" htmlFor={`${prefix}-start`}><input id={`${prefix}-start`} name="start" type="time" required className="field" defaultValue={pattern?.start ?? "07:00"} /></Field>
        <Field label="Ends" htmlFor={`${prefix}-end`}><input id={`${prefix}-end`} name="end" type="time" required className="field" defaultValue={pattern?.end ?? "19:00"} /></Field>
        <Field label="Order" htmlFor={`${prefix}-order`}><input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={999} className="field" defaultValue={pattern?.sortOrder ?? 10} /></Field>
      </div>
      <p className="-mt-2 text-xs text-mute">An end at or before the start means the shift ends the next morning. At most 16 hours.</p>
      <fieldset>
        <legend className="label">Days it starts on</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day, index) => (
            <label key={day} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
              <input type="checkbox" name="weekdays" value={index + 1} defaultChecked={pattern ? pattern.weekdays.includes(index + 1) : index >= 5} className="h-4 w-4 accent-[#1b6fa8]" /> {day}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/* Admins define the shifts the agency runs. The schedule, coverage checks and daily notes all follow these. */
export default async function ShiftPatternsPage() {
  await requireManager();
  const [patterns, now] = await Promise.all([allPatterns(), requestTime()]);
  const active = patterns.filter(pattern => pattern.active);
  const usage = await db
    .select({ patternId: schema.shifts.patternId, n: count() })
    .from(schema.shifts)
    .where(and(isNotNull(schema.shifts.patternId), gte(schema.shifts.startsAt, new Date(now - 86_400_000))))
    .groupBy(schema.shifts.patternId);
  const upcoming = new Map(usage.map(row => [row.patternId, row.n]));
  const homes = await db.select({ staffedPatterns: schema.homes.staffedPatterns }).from(schema.homes).where(eq(schema.homes.active, true));
  const homesUsing = (id: string) => homes.filter(home => home.staffedPatterns === null || home.staffedPatterns.includes(id)).length;
  const week = [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, ...dayMap(active, weekday) }));
  const gapDays = week.filter(day => day.gaps.length);

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Shift patterns"
        description="The shifts the agency runs, such as 7am to 3pm on weekdays and 7am to 7pm at weekends. The schedule offers these, coverage is checked against them, and every staff member on one owes a daily note for each person they support."
        action={
          <ModalForm action={savePattern.bind(null, null)} title="Add a shift pattern" triggerLabel="Add pattern" submitLabel="Add pattern">
            <PatternFields prefix="new-pattern" />
          </ModalForm>
        }
      />
      <SettingsNav current="/app/settings/shifts" />

      <Panel title="The week at a glance">
        <div className="space-y-2 p-5">
          <div className="ml-12 grid grid-cols-4 text-[10px] text-dim">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span>
          </div>
          {week.map(day => (
            <div key={day.weekday} className="flex items-center gap-3">
              <span className="w-9 text-xs font-semibold text-mute">{DAYS[day.weekday - 1]}</span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-flag-soft/60">
                {day.segments.map((segment, index) => (
                  <span
                    key={`${segment.pattern.id}-${index}`}
                    title={`${segment.pattern.name} ${segment.pattern.start}–${segment.pattern.end}`}
                    className={cn("absolute inset-y-0.5 flex items-center overflow-hidden rounded px-1.5 text-[10px] font-semibold text-white ring-1 ring-white/60", colour[kindFor(segment.pattern.start)])}
                    style={{ left: `${(segment.from / 1440) * 100}%`, width: `${((segment.to - segment.from) / 1440) * 100}%` }}
                  >
                    <span className="truncate">{segment.from === 0 && minutes(segment.pattern.start) !== 0 ? `…${segment.pattern.name}` : segment.pattern.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className={cn("pt-2 text-sm", gapDays.length ? "text-flag" : "text-sage")}>
            {gapDays.length
              ? `Not covered by any pattern: ${gapDays.map(day => `${DAYS[day.weekday - 1]} ${day.gaps.map(([from, to]) => `${clock(from)}–${clock(to)}`).join(", ")}`).join("; ")}. Homes staffed around the clock will have no shift for these hours.`
              : "Every hour of every day is covered by a pattern."}
          </p>
        </div>
      </Panel>

      <Panel title={`Patterns in use (${active.length})`} className="mt-6">
        <ul className="divide-y divide-line/60">
          {patterns.map(pattern => (
            <li key={pattern.id} className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center", !pattern.active && "bg-panel/40")}>
              <span className={cn("h-10 w-1.5 shrink-0 rounded-full max-sm:hidden", pattern.active ? colour[kindFor(pattern.start)] : "bg-line")} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {pattern.name}
                  {!pattern.active && <Badge tone="neutral">Retired</Badge>}
                </p>
                <p className="text-sm text-mute">
                  {pattern.start}–{pattern.end} · {hours(lengthOf(pattern))}
                  {minutes(pattern.end) <= minutes(pattern.start) && " · ends next morning"}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {DAYS.map((day, index) => (
                    <span key={day} className={cn("chip px-1.5 py-0 text-[10px]", pattern.weekdays.includes(index + 1) ? "bg-sky text-brand-deep" : "bg-panel text-dim")}>{day}</span>
                  ))}
                </p>
              </div>
              <div className="text-xs text-mute sm:w-40 sm:text-right">
                <p>{homesUsing(pattern.id)} {homesUsing(pattern.id) === 1 ? "home needs it" : "homes need it"}</p>
                <p>{upcoming.get(pattern.id) ?? 0} current or upcoming shifts</p>
              </div>
              <div className="flex items-center gap-2">
                <ModalForm action={savePattern.bind(null, pattern.id)} title={`Edit ${pattern.name}`} description="Shifts already on the schedule keep their times. New shifts use the change." triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save pattern">
                  <PatternFields pattern={pattern} prefix={`pattern-${pattern.id.slice(0, 8)}`} />
                </ModalForm>
                <ConfirmAction
                  action={setPatternActive.bind(null, pattern.id, !pattern.active)}
                  label={pattern.active ? "Retire" : "Restore"}
                  confirm={pattern.active ? `Retire ${pattern.name}? It stops appearing for new shifts and coverage checks. Existing shifts keep it.` : undefined}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
