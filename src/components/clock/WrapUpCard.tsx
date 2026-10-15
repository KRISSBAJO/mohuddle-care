import Link from "next/link";
import { CheckCircle2, ClipboardList, LogOut, Pill } from "lucide-react";
import { clockTime } from "@/lib/huddle";
import type { WrapUp } from "@/server/huddle";

/* The last stretch of the shift: what is left before clocking out, one tap each. */
export function WrapUpCard({ wrapUp }: { wrapUp: WrapUp }) {
  const when = wrapUp.minutesLeft === null ? "" : wrapUp.minutesLeft > 0 ? `Your shift ends in ${wrapUp.minutesLeft} minutes.` : `Your shift ended ${-wrapUp.minutesLeft} minutes ago.`;
  return (
    <section className="card mb-6 overflow-hidden ring-2 ring-accent/60" aria-label="End of shift">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-ink"><ClipboardList className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{wrapUp.ready ? "Ready to clock out" : "Before you clock out"}</h2>
          <p className="text-sm text-mute">{when} {wrapUp.ready ? "Notes and doses are done. Write the handover and sign." : "Finish these first."}</p>
        </div>
        <Link href="/app/clock/out" className="btn-brand btn-sm"><LogOut className="h-4 w-4" /> Clock out</Link>
      </div>
      {!wrapUp.ready && (
        <ul className="divide-y divide-line/60 border-t border-line text-sm">
          {wrapUp.notes.map(person => (
            <li key={person.id} className="flex items-center gap-3 px-5 py-2.5">
              <ClipboardList className="h-4 w-4 text-mute" />
              <span className="min-w-0 flex-1">Daily note for <span className="font-semibold">{person.name}</span></span>
              <Link href={`/app/daily-logs/new?individual=${person.id}`} className="text-xs font-semibold text-brand hover:text-brand-deep">Write it</Link>
            </li>
          ))}
          {wrapUp.doses.map(dose => (
            <li key={dose.person + dose.name + dose.at} className="flex items-center gap-3 px-5 py-2.5">
              <Pill className="h-4 w-4 text-flag" />
              <span className="min-w-0 flex-1">{dose.person}&apos;s {dose.name} at {clockTime(dose.at)} is not recorded</span>
              <Link href="/app/medications" className="text-xs font-semibold text-brand hover:text-brand-deep">Record it</Link>
            </li>
          ))}
        </ul>
      )}
      {wrapUp.ready && <p className="flex items-center gap-2 border-t border-line px-5 py-2.5 text-sm text-sage"><CheckCircle2 className="h-4 w-4" /> Everything for the people you support is written up.</p>}
    </section>
  );
}
