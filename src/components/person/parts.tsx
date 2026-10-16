import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Empty } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, label } from "@/lib/format";
import { DoseButtons } from "@/components/app/DoseButtons";
import type { MoodDay } from "@/server/queries/person";

export const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;
export const medTone = { due: "neutral", given: "good", refused: "warn", missed: "bad", held: "plum" } as const;

const moodColour: Record<string, string> = {
  great: "bg-sage",
  good: "bg-sage/55",
  okay: "bg-brand/35",
  low: "bg-accent",
  distressed: "bg-flag",
};

/* One square per day. Empty squares are days nobody wrote a log. */
export function MoodStrip({ days, compact = false }: { days: MoodDay[]; compact?: boolean }) {
  const written = days.filter(day => day.mood).length;
  const concern = days.filter(day => day.mood === "low" || day.mood === "distressed").length;
  return (
    <div>
      <div className={cn("grid gap-1", compact ? "grid-cols-[repeat(15,minmax(0,1fr))]" : "grid-cols-[repeat(15,minmax(0,1fr))] sm:grid-cols-[repeat(30,minmax(0,1fr))]")}>
        {days.map(day => (
          <span
            key={day.day}
            title={`${fmt.weekday(day.day)} ${fmt.day(day.day)}: ${day.mood ? label("mood", day.mood) : "no log"}`}
            className={cn("aspect-square rounded-[4px]", day.mood ? moodColour[day.mood] : "border border-dashed border-line bg-white")}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
        <span>
          {written} of {days.length} days logged{concern ? ` · ${concern} low or distressed` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-2.5">
          {Object.entries(moodColour).map(([mood, colour]) => (
            <span key={mood} className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-sm", colour)} />{label("mood", mood)}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

type Dose = {
  id: string;
  scheduledFor: Date;
  status: keyof typeof medTone;
  recordedAt: Date | null;
  note: string;
  medication: string;
  dose: string;
  route: string;
  instructions: string;
  staff: string | null;
};

/* Today's doses for one person, with the same record buttons as the medication rounds. */
export function DoseList({ doses, now, lateMinutes, canRecord, firstName }: { doses: Dose[]; now: number; lateMinutes: number; canRecord: boolean; firstName: string }) {
  if (!doses.length) return <Empty>No doses today.</Empty>;
  const lateBefore = now - lateMinutes * 60_000;
  return (
    <ul className="divide-y divide-line/60">
      {doses.map(dose => {
        const due = dose.status === "due";
        const late = due && dose.scheduledFor.getTime() < lateBefore;
        const notYet = due && dose.scheduledFor.getTime() > now;
        return (
          <li key={dose.id} className={cn("px-5 py-3", late && "bg-flag-soft/40")}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 w-16 shrink-0 font-display text-sm font-bold", late ? "text-flag" : "text-plum")}>{fmt.time(dose.scheduledFor)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{dose.medication}</span>
                  <span className="text-mute"> {dose.dose}, {dose.route}</span>
                  {late && <Badge tone="bad" className="ml-2">Late</Badge>}
                </p>
                {dose.instructions && <p className="text-xs text-mute">{dose.instructions}</p>}
                {!due && (
                  <p className="mt-1 text-xs text-mute">
                    <Badge tone={medTone[dose.status]}>{label("medStatus", dose.status)}</Badge> {dose.recordedAt && `${fmt.time(dose.recordedAt)} by ${dose.staff ?? "staff"}`}
                    {dose.note && ` · ${dose.note}`}
                  </p>
                )}
              </div>
            </div>
            {due && canRecord && (
              <DoseButtons adminId={dose.id} notYet={notYet} noteLabel={`Note for ${firstName}'s ${dose.medication}`} className="no-print mt-2 sm:pl-[76px]" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="no-print inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-deep">
      {children} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}
