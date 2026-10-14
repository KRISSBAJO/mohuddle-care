import Link from "next/link";
import { LogIn, LogOut, Timer } from "lucide-react";
import { LiveWorked } from "@/components/clock/ClockControls";
import { fmt } from "@/lib/format";
import { clockInContext, openEntry } from "@/server/queries/timeclock";
import type { Settings } from "@/server/settings";

/* The clock on the Today page: on the clock now, a shift to clock in to, or the next shift. */
export async function ClockCard({ staffId, now, settings }: { staffId: string; now: number; settings: Settings }) {
  const open = await openEntry(staffId);
  if (open) {
    const meal = open.breaks.filter(item => item.kind === "meal" && item.endAt).reduce((sum, item) => sum + (item.endAt!.getTime() - item.startAt.getTime()) / 60_000, 0);
    return (
      <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-sage/30 bg-sage-soft/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-sage" /></span>
          <p className="text-sm">
            <span className="font-semibold">{open.openBreak ? "On a break" : "On the clock"}</span> since {fmt.time(open.entry.clockInAt)} at {open.home ?? "work"} ·{" "}
            <span className="font-semibold"><LiveWorked since={open.entry.clockInAt.toISOString()} mealMinutes={meal} openMealSince={open.openBreak?.kind === "meal" ? open.openBreak.startAt.toISOString() : null} /></span>
            {open.shiftEnd && <span className="text-mute"> · shift ends {fmt.time(open.shiftEnd)}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/clock" className="btn-ghost btn-sm"><Timer className="h-4 w-4" /> Breaks</Link>
          <Link href="/app/clock/out" className="btn-brand btn-sm"><LogOut className="h-4 w-4" /> Clock out</Link>
        </div>
      </section>
    );
  }
  const { shift, upcoming } = await clockInContext(staffId, now, settings);
  if (!shift && !(upcoming && upcoming.startsAt.getTime() - now < 12 * 3_600_000)) return null;
  return (
    <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-brand/30 bg-sky/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">
        {shift ? (
          <>
            <span className="font-semibold">{shift.pattern ?? "Your shift"} at {shift.home}</span> {shift.startsAt.getTime() <= now ? `started ${fmt.time(shift.startsAt)}` : `starts ${fmt.time(shift.startsAt)}`}. Clock in when you arrive.
          </>
        ) : (
          <>
            Next shift: <span className="font-semibold">{upcoming!.pattern ?? "shift"} at {upcoming!.home}</span>, {fmt.dateTime(upcoming!.startsAt)}.
          </>
        )}
      </p>
      {shift ? (
        <Link href="/app/clock/in" className="btn-brand btn-sm"><LogIn className="h-4 w-4" /> Clock in</Link>
      ) : (
        <Link href="/app/clock" className="btn-ghost btn-sm"><Timer className="h-4 w-4" /> My time clock</Link>
      )}
    </section>
  );
}
