import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, label, zone } from "@/lib/format";
import { addMedication } from "@/server/actions/hub";
import { requestTime } from "@/server/clock";
import type { schema } from "@/server/db";
import { personDoses, personMedications, type MarCell } from "@/server/queries/person";
import { DoseList, medTone } from "./parts";

type Person = typeof schema.individuals.$inferSelect;

const WINDOWS = [7, 14, 28] as const;

const cellStyle: Record<MarCell["status"], string> = {
  given: "bg-sage text-white",
  refused: "bg-accent text-ink",
  held: "bg-plum text-white",
  missed: "bg-flag text-white",
  due: "",
};
const cellCode: Record<MarCell["status"], string> = { given: "G", refused: "R", held: "H", missed: "M", due: "" };

/* Orders, today's doses and a medication administration record for any window of days. */
export async function PersonMedicationsTab({ id, person, manager, end, days, lateMinutes }: { id: string; person: Person; manager: boolean; end?: string; days?: string; lateMinutes: number }) {
  const today = dateKey();
  const endDay = end && /^\d{4}-\d{2}-\d{2}$/.test(end) && end <= today ? end : today;
  const span = WINDOWS.find(size => String(size) === days) ?? 14;
  const [data, todayDoses, now] = await Promise.all([personMedications(id, endDay, span), personDoses(id, today), requestTime()]);
  const href = (changes: { end?: string; days?: number }) => {
    const params = new URLSearchParams({ tab: "medications" });
    const nextEnd = changes.end ?? endDay;
    const nextDays = changes.days ?? span;
    if (nextEnd !== today) params.set("end", nextEnd);
    if (nextDays !== 14) params.set("days", String(nextDays));
    return `/app/individuals/${id}?${params}`;
  };
  const recorded = data.pastTotal - data.tally.unrecorded;
  const givenRate = data.pastTotal ? Math.round((data.tally.given / data.pastTotal) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title={`Today · ${fmt.dayLong(today)}`}>
          <DoseList doses={todayDoses} now={now} lateMinutes={lateMinutes} canRecord={person.active} firstName={person.firstName} />
        </Panel>

        <Panel
          title={`Active orders (${data.active.length})`}
          action={
            manager && person.active ? (
              <ModalForm action={addMedication} title="Add a medication" description="Doses start from now. Earlier times today are not added as late." triggerLabel="Add medication" triggerTone="ghost" submitLabel="Add medication">
                <input type="hidden" name="individualId" value={id} />
                <Field label="Name" htmlFor="add-med-name"><input id="add-med-name" name="name" required minLength={2} maxLength={120} className="field" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Dose" htmlFor="add-med-dose"><input id="add-med-dose" name="dose" required maxLength={80} className="field" placeholder="10 mg" /></Field>
                  <Field label="Route" htmlFor="add-med-route"><input id="add-med-route" name="route" maxLength={40} className="field" defaultValue="oral" /></Field>
                </div>
                <Field label="Times" htmlFor="add-med-times" hint="24-hour, separated by commas"><input id="add-med-times" name="times" required className="field" placeholder="08:00, 20:00" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Prescriber" htmlFor="add-med-prescriber"><input id="add-med-prescriber" name="prescriber" maxLength={120} className="field" /></Field>
                  <Field label="Instructions" htmlFor="add-med-instructions"><input id="add-med-instructions" name="instructions" maxLength={1000} className="field" placeholder="With food" /></Field>
                </div>
                <label className="flex items-start gap-2.5 text-sm">
                  <input type="checkbox" name="controlled" className="mt-0.5 h-4 w-4" />
                  <span><span className="font-semibold">Controlled medicine</span> <span className="text-mute">Counted on a count sheet. On the phone app it can only be recorded with a signal.</span></span>
                </label>
              </ModalForm>
            ) : undefined
          }
        >
          {data.active.length === 0 ? (
            <Empty>No active medications.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.active.map(med => (
                <li key={med.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{med.name} <span className="font-normal text-mute">{med.dose}, {med.route}</span></p>
                    <p className="mt-0.5 flex flex-wrap gap-1">
                      {med.times.map(time => <span key={time} className="chip bg-plum-soft px-2 py-0 text-plum">{time}</span>)}
                    </p>
                    {med.instructions && <p className="mt-1 text-xs text-mute">{med.instructions}</p>}
                    {med.controlled && <p className="mt-1 inline-flex rounded-full bg-flag-soft px-2 py-0.5 text-[11px] font-semibold text-flag">Controlled</p>}
                    <p className="text-xs text-dim">{[med.prescriber, med.startedAt ? `since ${fmt.day(med.startedAt)}` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  {manager && <Link href={`/app/individuals/${id}/medications/${med.id}`} className="no-print shrink-0 text-xs font-semibold text-brand">Change or stop</Link>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-col gap-3 border-b border-line px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-bold">Medication administration record</h2>
            <p className="text-xs text-mute">{fmt.dayLong(data.columns[0])} to {fmt.dayLong(endDay)}</p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-1.5">
            {WINDOWS.map(size => (
              <Link key={size} href={href({ days: size })} aria-current={span === size ? "true" : undefined} className={cn("chip", span === size ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>{size} days</Link>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            <Link href={href({ end: addDays(endDay, -span) })} className="btn-ghost btn-sm px-2" aria-label="Earlier"><ChevronLeft className="h-4 w-4" /></Link>
            {endDay !== today && <Link href={href({ end: today })} className="btn-ghost btn-sm">Today</Link>}
            {endDay < today ? (
              <Link href={href({ end: addDays(endDay, span) > today ? today : addDays(endDay, span) })} className="btn-ghost btn-sm px-2" aria-label="Later"><ChevronRight className="h-4 w-4" /></Link>
            ) : (
              <span className="btn-ghost btn-sm px-2 opacity-40" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-px border-b border-line bg-line text-center sm:grid-cols-5">
          {[
            ["Given", givenRate === null ? "—" : `${givenRate}%`, `${data.tally.given} of ${data.pastTotal} doses`, "text-sage"],
            ["Refused", String(data.tally.refused), "Offered, declined", data.tally.refused ? "text-[#8a5a10]" : ""],
            ["Held", String(data.tally.held), "Not given on purpose", data.tally.held ? "text-plum" : ""],
            ["Missed", String(data.tally.missed), "Should have been given", data.tally.missed ? "text-flag" : ""],
            ["Not recorded", String(data.tally.unrecorded), `${recorded} recorded`, data.tally.unrecorded ? "text-flag" : ""],
          ].map(([title, value, hint, tone]) => (
            <div key={title} className="bg-white px-3 py-3 last:col-span-2 sm:last:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
              <p className={cn("font-display text-xl font-bold", tone)}>{value}</p>
              <p className="text-[11px] text-dim">{hint}</p>
            </div>
          ))}
        </div>

        {data.rows.length === 0 ? (
          <Empty>No doses in this window.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-mute">
                  <th className="sticky left-0 z-[1] min-w-48 bg-white px-4 py-2 text-left font-semibold">Medication</th>
                  {data.columns.map(day => (
                    <th key={day} className={cn("min-w-9 px-0.5 py-2 text-center font-semibold", day === today && "text-brand")}>
                      <span className="block text-[10px] font-normal">{fmt.weekday(day).slice(0, 2)}</span>
                      {Number(day.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.key} className="border-t border-line/60">
                    <th scope="row" className="sticky left-0 z-[1] bg-white px-4 py-2 text-left font-normal">
                      <span className="font-semibold text-ink">{row.name}</span> <span className="text-mute">{row.dose}</span>
                      <span className="ml-1.5 chip bg-plum-soft px-1.5 py-0 text-plum">{row.time}</span>
                    </th>
                    {data.columns.map(day => {
                      const cell = row.cells[day];
                      if (!cell) return <td key={day} className="px-0.5 py-1.5 text-center text-line">·</td>;
                      // Shown as not recorded once the dose is late, the same rule as the medication rounds.
                      const unrecorded = cell.status === "due" && (day < today || (day === today && isPastTime(row.time, now - lateMinutes * 60_000, today)));
                      return (
                        <td key={day} className="px-0.5 py-1.5 text-center">
                          <span
                            title={cell.status === "due" ? (unrecorded ? "Not recorded" : "Due") : `${label("medStatus", cell.status)}${cell.recordedAt ? ` ${fmt.dateTime(cell.recordedAt)}` : ""}${cell.staff ? ` by ${cell.staff}` : ""}${cell.note ? `. ${cell.note}` : ""}`}
                            className={cn(
                              "mx-auto grid h-7 w-7 place-items-center rounded-md font-bold",
                              cellStyle[cell.status],
                              cell.status === "due" && (unrecorded ? "border-2 border-flag text-flag" : "border border-dashed border-line text-dim"),
                            )}
                          >
                            {cell.status === "due" ? (unrecorded ? "!" : "") : cellCode[cell.status]}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-2.5 text-xs text-mute">
          {(["given", "refused", "held", "missed"] as const).map(status => (
            <span key={status} className="inline-flex items-center gap-1.5"><span className={cn("grid h-4 w-4 place-items-center rounded text-[9px] font-bold", cellStyle[status])}>{cellCode[status]}</span>{label("medStatus", status)}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded border-2 border-flag text-[9px] font-bold text-flag">!</span>Not recorded</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-dashed border-line" />Still to come</span>
          <span>Hover a square for who recorded it.</span>
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Refused, held or missed in this window">
          {data.exceptions.length === 0 ? (
            <Empty>Every recorded dose in this window was given.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.exceptions.map(dose => (
                <li key={dose.id} className="px-5 py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={medTone[dose.status]}>{label("medStatus", dose.status)}</Badge>
                    <span className="font-semibold">{dose.name}</span>
                    <span className="text-mute">{dose.dose} · due {fmt.dateTime(dose.scheduledFor)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-mute">{[dose.note || "No note", dose.staff].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Stopped and earlier orders (${data.stopped.length})`}>
          {data.stopped.length === 0 ? (
            <Empty>No stopped medications.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.stopped.map(med => (
                <li key={med.id} className="px-5 py-3 text-sm">
                  <p><span className="font-semibold">{med.name}</span> <span className="text-mute">{med.dose}, {med.times.join(", ")}</span></p>
                  <p className="text-xs text-mute">
                    {[med.startedAt ? `Started ${fmt.day(med.startedAt)}` : null, med.stoppedAt ? `stopped ${fmt.dateTime(med.stoppedAt)}` : "stopped", med.stopReason].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* True when a 24-hour time today in the agency's time zone has already passed. */
function isPastTime(hhmm: string, at: number, today: string) {
  if (dateKey(new Date(at)) < today) return false;
  const current = new Intl.DateTimeFormat("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return hhmm <= current;
}
