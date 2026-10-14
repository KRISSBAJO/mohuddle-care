import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { Avatar, Badge, Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, initials, label } from "@/lib/format";
import { recordMedication } from "@/server/actions/hub";
import { requestTime } from "@/server/clock";
import { homeMedRounds } from "@/server/queries/homes";

const statusTone = { due: "neutral", given: "good", refused: "warn", missed: "bad", held: "plum" } as const;

/* The home's medication rounds: every dose for the people living here, grouped by the time it is due. */
export async function HomeMedsTab({ homeId, day, lateMinutes }: { homeId: string; day: string; lateMinutes: number }) {
  const [rows, now] = await Promise.all([homeMedRounds(homeId, day), requestTime()]);
  const lateBefore = now - lateMinutes * 60_000;
  const rounds = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = fmt.time(row.scheduledFor);
    rounds.set(key, [...(rounds.get(key) ?? []), row]);
  }
  const base = `/app/homes/${homeId}?tab=medications`;
  const given = rows.filter(row => row.status === "given").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{fmt.dayLong(day)}</h2>
          <p className="text-sm text-mute">
            {rows.length ? `${rounds.size} ${rounds.size === 1 ? "round" : "rounds"}, ${given} of ${rows.length} doses given.` : "No medications for people living here."} A dose is late {lateMinutes} minutes after its time.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`${base}&day=${addDays(day, -1)}`} className="btn-ghost btn-sm">Previous day</Link>
          {day !== dateKey() && <Link href={base} className="btn-ghost btn-sm">Today</Link>}
          <Link href={`${base}&day=${addDays(day, 1)}`} className="btn-ghost btn-sm">Next day</Link>
        </div>
      </div>

      {rows.length === 0 && (
        <Panel>
          <Empty>Add medications from each person&apos;s page. Their times appear here as rounds.</Empty>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {[...rounds.entries()].map(([time, doses]) => {
          const done = doses.filter(dose => dose.status !== "due").length;
          const late = doses.filter(dose => dose.status === "due" && dose.scheduledFor.getTime() < lateBefore).length;
          const upcoming = doses[0].scheduledFor.getTime() > now;
          return (
            <section key={time} className={cn("card overflow-hidden", late && "ring-2 ring-flag/40")}>
              <header className="flex items-center justify-between border-b border-line px-5 py-3">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Clock className="h-4 w-4 text-plum" /> {time} round
                </h3>
                <span className="flex items-center gap-2">
                  {late > 0 && <Badge tone="bad"><AlertTriangle className="h-3 w-3" /> {late} late</Badge>}
                  <Badge tone={done === doses.length ? "good" : upcoming ? "neutral" : "warn"}>{done}/{doses.length} done</Badge>
                </span>
              </header>
              <ul className="divide-y divide-line/60">
                {doses.map(dose => {
                  const due = dose.status === "due";
                  const isLate = due && dose.scheduledFor.getTime() < lateBefore;
                  const notYet = due && dose.scheduledFor.getTime() > now;
                  return (
                    <li key={dose.id} className={cn("px-5 py-3", isLate && "bg-flag-soft/30")}>
                      <div className="flex items-start gap-3">
                        <Avatar initials={initials(dose.first, dose.last)} size="sm" tone={isLate ? "bad" : "brand"} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <Link href={`/app/individuals/${dose.individualId}`} className="font-semibold hover:text-brand">{dose.first} {dose.last}</Link>
                            <span className="text-mute"> · {dose.medication} {dose.dose}, {dose.route}</span>
                          </p>
                          {dose.instructions && <p className="text-xs text-mute">{dose.instructions}</p>}
                          {dose.allergies && <p className="text-xs font-semibold text-flag">Allergy: {dose.allergies}</p>}
                          {!due && (
                            <p className="mt-1 text-xs text-mute">
                              <Badge tone={statusTone[dose.status]}>{label("medStatus", dose.status)}</Badge>{" "}
                              {dose.recordedAt && `${fmt.time(dose.recordedAt)} by ${dose.staff ?? "staff"}`}
                              {dose.note && ` · ${dose.note}`}
                            </p>
                          )}
                        </div>
                      </div>
                      {due && (
                        <form className="mt-2 flex flex-wrap items-center gap-1.5 pl-10">
                          <input name="note" placeholder="Note" className="field w-32 py-1.5 text-xs" aria-label={`Note for ${dose.first}'s ${dose.medication}`} />
                          <button formAction={recordMedication.bind(null, dose.id, "given")} className="btn-brand btn-sm disabled:opacity-50" disabled={notYet} title={notYet ? "Not due yet" : undefined}>Given</button>
                          <button formAction={recordMedication.bind(null, dose.id, "refused")} className="btn-ghost btn-sm">Refused</button>
                          <button formAction={recordMedication.bind(null, dose.id, "held")} className="btn-ghost btn-sm">Held</button>
                          <button formAction={recordMedication.bind(null, dose.id, "missed")} className="btn-ghost btn-sm text-flag">Missed</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
