import { Activity, Bed, CheckCircle2, Clock, HeartPulse, MapPin, PenLine, Phone, ShieldAlert, Target, Utensils, UserRound } from "lucide-react";
import { Badge } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt, label } from "@/lib/format";
import { GOAL_OFFERED, GOAL_OUTCOME, MEALS, isLateEntry, shiftMinutes } from "@/lib/log-note";
import type { LogGoal, LogRow } from "@/server/queries/logs";

const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;

function Block({ icon: Icon, title, children, className }: { icon: typeof Clock; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("break-inside-avoid", className)}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute"><Icon className="h-3.5 w-3.5" /> {title}</h3>
      {children}
    </section>
  );
}

function Pairs({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-lg border border-line text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-line last:border-b-0">
          <dt className="bg-panel/60 px-3 py-1.5 text-mute">{term}</dt>
          <dd className="px-3 py-1.5 font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Para = ({ children }: { children: React.ReactNode }) => <p className="whitespace-pre-line text-sm leading-relaxed">{children}</p>;

function duration(minutes: number | null) {
  if (minutes === null) return "";
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

/* A signed shift note laid out the way a reviewer reads it. Sections with nothing recorded are left out. */
export function LogNoteView({ log, goals, staff, adlOrder = [], compact = false }: { log: LogRow; goals: LogGoal[]; staff: string | null; adlOrder?: string[]; compact?: boolean }) {
  const late = isLateEntry(log.logDate, dateKey(log.createdAt));
  const vitals = log.vitals ?? {};
  const vitalRows: [string, React.ReactNode][] = [];
  if (vitals.bpSys !== undefined && vitals.bpDia !== undefined) vitalRows.push(["Blood pressure", `${vitals.bpSys}/${vitals.bpDia}`]);
  if (vitals.pulse !== undefined) vitalRows.push(["Pulse", `${vitals.pulse} bpm`]);
  if (vitals.temp !== undefined) vitalRows.push(["Temperature", `${vitals.temp} °F`]);
  if (vitals.weight !== undefined) vitalRows.push(["Weight", `${vitals.weight} lb`]);
  if (vitals.pain !== undefined) vitalRows.push(["Pain", `${vitals.pain} of 10`]);
  // The database does not keep key order, so personal care follows the order set in Settings.
  const rank = (item: string) => (adlOrder.includes(item) ? adlOrder.indexOf(item) : adlOrder.length);
  const adl = Object.entries(log.adl ?? {}).sort(([a], [b]) => rank(a) - rank(b));
  const meals = MEALS.filter(meal => log.mealIntake?.[meal]).map(meal => [meal, log.mealIntake[meal]] as [string, string]);
  const sleepRows: [string, React.ReactNode][] = [];
  if (log.sleepHours !== null) sleepRows.push(["Hours slept", String(log.sleepHours)]);
  if (log.sleepQuality) sleepRows.push(["Sleep", log.sleepQuality]);
  if (log.bowelMovements !== null) sleepRows.push(["Bowel movements", String(log.bowelMovements)]);
  if (log.incontinence !== null) sleepRows.push(["Incontinence episodes", String(log.incontinence)]);
  const structured = Boolean(log.shift);

  return (
    <article className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">{fmt.dayLong(log.logDate)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
            {log.shift && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{label("shiftKind", log.shift)} shift{log.timeIn && ` · ${log.timeIn}–${log.timeOut} (${duration(shiftMinutes(log.timeIn, log.timeOut))})`}</span>}
            {log.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{log.location}</span>}
            <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{staff ?? "Staff"}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {late && <Badge tone="warn">Late entry · written {fmt.dateTime(log.createdAt)}</Badge>}
          {log.seizure && <Badge tone="bad">Seizure</Badge>}
          {log.behaviourOccurred && <Badge tone="warn">Behaviour</Badge>}
          <Badge tone={moodTone[log.mood]}>Mood: {label("mood", log.mood)}</Badge>
        </div>
      </header>

      {log.notes && structured && (
        <div className="rounded-xl bg-sky/50 px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-deep">Shift summary</p>
          <Para>{log.notes}</Para>
        </div>
      )}
      {log.presentation && <p className="text-sm"><span className="font-semibold">How they seemed: </span>{log.presentation}</p>}

      <div className={cn("grid gap-5", !compact && "md:grid-cols-2")}>
        {log.checks.length > 0 && (
          <Block icon={CheckCircle2} title="Checks confirmed">
            <p className="flex flex-wrap gap-1.5">{log.checks.map(check => <span key={check} className="chip bg-sage-soft px-2 py-0.5 text-sage">{check}</span>)}</p>
          </Block>
        )}
        {adl.length > 0 && (
          <Block icon={UserRound} title="Personal care">
            <Pairs rows={adl.map(([item, level]) => [item, <span key={item} className={level === "Refused" ? "text-[#8a5a10]" : undefined}>{level}</span>])} />
          </Block>
        )}
        {(meals.length > 0 || log.fluidsOz !== null || log.meals) && (
          <Block icon={Utensils} title="Meals and fluids">
            {(meals.length > 0 || log.fluidsOz !== null) && <Pairs rows={[...meals, ...(log.fluidsOz !== null ? [["Fluids", `${log.fluidsOz} oz`] as [string, string]] : [])]} />}
            {log.meals && <p className="mt-2 text-sm text-mute">{log.meals}</p>}
          </Block>
        )}
        {sleepRows.length > 0 && (
          <Block icon={Bed} title="Sleep and continence">
            <Pairs rows={sleepRows} />
          </Block>
        )}
        {(vitalRows.length > 0 || log.seizure || log.health) && (
          <Block icon={HeartPulse} title="Health">
            {vitalRows.length > 0 && <Pairs rows={vitalRows} />}
            {log.seizure && (
              <div className="mt-2 rounded-lg bg-flag-soft px-3 py-2 text-sm text-flag">
                <p className="font-semibold">Seizure activity</p>
                <p className="whitespace-pre-line">{log.seizureNotes}</p>
              </div>
            )}
            {log.health && <div className="mt-2"><Para>{log.health}</Para></div>}
          </Block>
        )}
        {(goals.length > 0 || log.goalProgress) && (
          <Block icon={Target} title="Plan goals" className={!compact ? "md:col-span-2" : undefined}>
            {goals.length > 0 && (
              <ul className="grid gap-2">
                {goals.map(goal => (
                  <li key={goal.id} className={cn("rounded-lg border px-3 py-2 text-sm", goal.offered === "yes" ? "border-sage/40" : "border-line")}>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{goal.title}</span>
                      <Badge tone={goal.offered === "yes" ? "good" : goal.offered === "refused" ? "warn" : "neutral"}>{GOAL_OFFERED[goal.offered as keyof typeof GOAL_OFFERED] ?? goal.offered}</Badge>
                      {goal.outcome && <Badge tone={goal.outcome === "met" ? "good" : goal.outcome === "progressing" ? "brand" : "warn"}>{GOAL_OUTCOME[goal.outcome as keyof typeof GOAL_OUTCOME] ?? goal.outcome}</Badge>}
                    </p>
                    {(goal.promptLevel || goal.attempts !== null) && (
                      <p className="mt-0.5 text-xs text-mute">
                        {[goal.promptLevel, goal.attempts !== null ? `${goal.successes ?? 0} of ${goal.attempts} attempts successful` : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {goal.note && <p className="mt-0.5">{goal.note}</p>}
                  </li>
                ))}
              </ul>
            )}
            {log.goalProgress && <p className="mt-2 text-sm"><span className="text-mute">Also: </span>{log.goalProgress}</p>}
          </Block>
        )}
        {(log.activityTypes.length > 0 || log.activities) && (
          <Block icon={Activity} title="Activities and community" className={!compact ? "md:col-span-2" : undefined}>
            {log.activityTypes.length > 0 && <p className="mb-2 flex flex-wrap gap-1.5">{log.activityTypes.map(type => <span key={type} className="chip bg-sky px-2 py-0.5 text-brand-deep">{type}</span>)}</p>}
            {log.activities && <Para>{log.activities}</Para>}
          </Block>
        )}
        {(log.behaviourOccurred || log.behaviours) && (
          <Block icon={ShieldAlert} title="Behaviour" className={!compact ? "md:col-span-2" : undefined}>
            {log.behaviourOccurred ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Before", log.antecedent],
                  ["What happened", log.behaviours],
                  ["Staff response", log.intervention],
                  ["How it ended", log.behaviourOutcome],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-lg bg-accent-soft/50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a5a10]">{title}</p>
                    <p className="whitespace-pre-line text-sm">{text || "Not recorded"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Para>{log.behaviours}</Para>
            )}
          </Block>
        )}
        {(log.familyContact || log.appointments) && (
          <Block icon={Phone} title="Contacts and appointments" className={!compact ? "md:col-span-2" : undefined}>
            {log.familyContact && <p className="text-sm"><span className="text-mute">Family or guardian: </span>{log.familyContact}</p>}
            {log.appointments && <p className="text-sm"><span className="text-mute">Appointments: </span>{log.appointments}</p>}
          </Block>
        )}
        {log.notes && !structured && (
          <Block icon={PenLine} title="Other notes">
            <Para>{log.notes}</Para>
          </Block>
        )}
      </div>

      <footer className="border-t border-line pt-3 text-xs text-mute">
        {log.signedAt ? (
          <span className="inline-flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" /> Electronically signed by <strong className="text-ink">{log.signedName}</strong> on {fmt.dateTime(log.signedAt)}</span>
        ) : (
          <span>Written by {staff ?? "staff"} on {fmt.dateTime(log.createdAt)}. Logs from before signatures were added are not signed.</span>
        )}
      </footer>
    </article>
  );
}
