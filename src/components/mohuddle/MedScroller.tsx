import { Check } from "lucide-react";

/* Example doses for fictional people, in time order. Listed twice so the scroll loops without a seam. */
const DOSES = [
  ["7:00 AM", "Levothyroxine 50 mcg", "Devon", "given"],
  ["7:30 AM", "Metformin 500 mg", "Marcus", "given"],
  ["8:00 AM", "Sertraline 50 mg", "Aisha", "given"],
  ["8:00 AM", "Baclofen 10 mg", "Brianna", "late"],
  ["9:00 AM", "Vitamin D 1000 IU", "Tasha", "due"],
  ["12:00 PM", "Metformin 500 mg", "Marcus", "due"],
  ["2:00 PM", "Baclofen 10 mg", "Brianna", "due"],
  ["5:00 PM", "Lamotrigine 150 mg", "Tasha", "due"],
  ["8:00 PM", "Melatonin 3 mg", "Marcus", "due"],
] as const;

function Row({ time, med, who, state }: { time: string; med: string; who: string; state: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
      <span className="w-[68px] shrink-0 text-xs font-semibold tabular-nums text-white/60">{time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-white">{med}</span>
        <span className="block text-xs text-white/55">{who}</span>
      </span>
      {state === "given" ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#dcef98] text-[#173e35]"><Check className="h-4 w-4" /></span>
      ) : state === "late" ? (
        <span className="mh-blink shrink-0 rounded-full bg-[#ab3c2b] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Late</span>
      ) : (
        <span className="shrink-0 rounded-full border border-white/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70">Due</span>
      )}
    </div>
  );
}

/*
 * The medication record as a moving picture: a ticking clock, and the day's doses scrolling past
 * a "now" line without end, given ones ticked, a late one blinking. Pure CSS; still for people who
 * ask their device for less motion.
 */
export function MedScroller() {
  return (
    <div className="flex w-full flex-col items-center gap-5 px-6 pb-6 pt-7">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="#0f2c25" stroke="#dcef98" strokeWidth="3" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="50" y1="9" x2="50" y2={i % 3 === 0 ? 17 : 14} stroke="rgba(255,255,255,.5)" strokeWidth={i % 3 === 0 ? 3 : 2} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
          ))}
          <line className="mh-hand-hour" x1="50" y1="50" x2="50" y2="30" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <line className="mh-hand-minute" x1="50" y1="50" x2="50" y2="18" stroke="#dcef98" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="50" cy="50" r="4" fill="#dcef98" />
        </svg>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#dcef98]">Med pass · live</p>
          <p className="text-sm text-white/70">Hillcrest House · today</p>
        </div>
      </div>

      <div className="mh-med-window relative w-full max-w-[400px]">
        <div className="mh-med-track space-y-2.5">
          {[0, 1].map(copy => (
            <div key={copy} className="space-y-2.5" aria-hidden={copy === 1}>
              {DOSES.map(([time, med, who, state]) => <Row key={`${copy}-${time}-${med}`} time={time} med={med} who={who} state={state} />)}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-2" aria-hidden="true">
          <span className="rounded-full bg-[#dcef98] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#173e35]">Now</span>
          <span className="h-0.5 flex-1 rounded-full bg-[#dcef98]/70" />
        </div>
      </div>
    </div>
  );
}
