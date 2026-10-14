import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, History, LogIn, LogOut, MapPin, TimerReset } from "lucide-react";
import { BreakButtons, LiveWorked } from "@/components/clock/ClockControls";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt } from "@/lib/format";
import { flagLabel, formatMinutes } from "@/lib/timeclock";
import { endBreak, startBreak } from "@/server/actions/timeclock";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { clockInContext, openEntry, rowMinutes, staffTime } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export const metadata = { title: "My time clock" };

const DONE: Record<string, string> = {
  in: "You are clocked in. Have a good shift.",
  out: "You are clocked out. Thank you, your handover is saved for the next shift.",
  correction: "Your correction request was sent to your manager.",
};


/* The staff member's own clock: in or out now, breaks, and their last three weeks of punches. */
export default async function ClockPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const { done } = await searchParams;
  if (!user.staffId) {
    return (
      <>
        <PageHeader eyebrow="Time clock" title="My time clock" />
        <Panel><Empty>Your login is not linked to a staff record, so there is no time clock for you.</Empty></Panel>
      </>
    );
  }
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  const [open, history, context] = await Promise.all([openEntry(user.staffId), staffTime(user.staffId, now), clockInContext(user.staffId, now, settings)]);
  const mealTaken = open ? open.breaks.filter(item => item.kind === "meal" && item.endAt).reduce((sum, item) => sum + (item.endAt!.getTime() - item.startAt.getTime()) / 60_000, 0) : 0;
  const { shift, upcoming } = context;
  const startBreakMeal = startBreak.bind(null, "meal");
  const startBreakRest = startBreak.bind(null, "rest");

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Time clock" title="My time clock" description={fmt.dayLong(dateKey(new Date(now)))} />

      {done && DONE[done] && <p className="mb-5 flex items-center gap-2 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage"><CheckCircle2 className="h-4 w-4" /> {DONE[done]}</p>}

      <section className={cn("card mb-6 overflow-hidden", open ? "ring-2 ring-sage/40" : "")}>
        <div className={cn("flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between", open ? "bg-sage-soft/40" : "bg-panel/40")}>
          {open ? (
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sage">
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sage" /></span>
                {open.openBreak ? `On a ${open.openBreak.kind} break since ${fmt.time(open.openBreak.startAt)}` : "On the clock"}
              </p>
              <p className="mt-2 font-display text-5xl font-bold">
                <LiveWorked since={open.entry.clockInAt.toISOString()} mealMinutes={mealTaken} openMealSince={open.openBreak?.kind === "meal" ? open.openBreak.startAt.toISOString() : null} />
              </p>
              <p className="mt-1 text-sm text-mute">
                Clocked in {fmt.time(open.entry.clockInAt)} at {open.home ?? "no home"}
                {open.shiftEnd ? ` · ${open.pattern ?? "shift"} ends ${fmt.time(open.shiftEnd)}` : " · no scheduled shift"}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">Off the clock</p>
              {shift ? (
                <>
                  <p className="mt-2 text-2xl font-bold">{shift.pattern ?? "Your shift"} at {shift.home}</p>
                  <p className="text-sm text-mute">{fmt.time(shift.startsAt)} to {fmt.time(shift.endsAt)}{shift.startsAt.getTime() < now ? " · started" : ` · starts ${fmt.time(shift.startsAt)}`}</p>
                </>
              ) : upcoming ? (
                <>
                  <p className="mt-2 text-2xl font-bold">Next: {upcoming.pattern ?? "shift"} at {upcoming.home}</p>
                  <p className="text-sm text-mute">{fmt.dateTime(upcoming.startsAt)}. You can clock in {settings.clock_early_minutes} minutes before.</p>
                </>
              ) : (
                <p className="mt-2 text-lg font-semibold">No shift coming up in the next day and a half.</p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:items-end">
            {open ? (
              <>
                <Link href="/app/clock/out" className="btn-brand justify-center px-6 py-3 text-base"><LogOut className="h-5 w-5" /> Clock out</Link>
                <BreakButtons onBreak={Boolean(open.openBreak)} startMeal={startBreakMeal} startRest={startBreakRest} end={endBreak} />
              </>
            ) : (
              <Link href="/app/clock/in" className="btn-brand justify-center px-6 py-3 text-base"><LogIn className="h-5 w-5" /> Clock in</Link>
            )}
          </div>
        </div>
        {open && open.entry.flags.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-3 text-xs text-mute">
            <AlertTriangle className="h-3.5 w-3.5 text-[#8a5a10]" /> Your manager will see: {open.entry.flags.map(flagLabel).join(", ")}
          </p>
        )}
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">This week</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatMinutes(history.weekMinutes)}</p>
          <p className="text-xs text-mute">From Monday, less meal breaks</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Late, 3 weeks</p>
          <p className={cn("mt-1 font-display text-2xl font-bold", history.lateCount ? "text-[#8a5a10]" : "text-sage")}>{history.lateCount}</p>
          <p className="text-xs text-mute">Past {settings.clock_late_grace_minutes} minutes</p>
        </div>
        <Link href="/app/clock/correction" className="card col-span-2 block p-4 transition hover:-translate-y-0.5 sm:col-span-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand"><TimerReset className="h-4 w-4" /> Fix a punch</p>
          <p className="mt-1 text-xs text-mute">Forgot to clock in or out, or a time is wrong? Ask your manager to correct it.</p>
        </Link>
      </div>

      {history.corrections.length > 0 && (
        <Panel title="My correction requests" className="mb-6">
          <ul className="divide-y divide-line/60">
            {history.corrections.map(row => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="font-semibold">{fmt.day(row.clockInAt)} · {fmt.time(row.clockInAt)}–{fmt.time(row.clockOutAt)}</span>
                <span className="min-w-0 flex-1 truncate text-mute">{row.reason}</span>
                <Badge tone={row.status === "approved" ? "good" : row.status === "declined" ? "bad" : "neutral"}>{row.status === "pending" ? "Waiting" : row.status === "approved" ? "Approved" : "Declined"}</Badge>
                {row.decisionNote && <span className="w-full text-xs text-mute">Manager: {row.decisionNote}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="My punches, last three weeks" action={<History className="h-4 w-4 text-mute" />}>
        {history.rows.length === 0 ? (
          <Empty>No punches yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Day</th><th>Home</th><th>In</th><th>Out</th><th className="text-right">Worked</th><th>Notes</th></tr></thead>
              <tbody>
                {history.rows.map(row => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap font-semibold">{fmt.day(row.clockInAt)}</td>
                    <td className="text-mute">{row.home ?? "—"}</td>
                    <td className="whitespace-nowrap">
                      {fmt.time(row.clockInAt)}
                      {row.lateMinutes > 0 && <span className="ml-1 text-xs text-[#8a5a10]">+{row.lateMinutes}m</span>}
                      {row.inLocation === "ok" && <MapPin className="ml-1 inline h-3 w-3 text-sage" />}
                    </td>
                    <td className="whitespace-nowrap">{row.clockOutAt ? fmt.time(row.clockOutAt) : <Badge tone="good">On now</Badge>}</td>
                    <td className="text-right tabular-nums">{formatMinutes(rowMinutes(row, now))}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {row.flags.map(flag => <Badge key={flag} tone={["late", "edited", "corrected"].includes(flag) ? "neutral" : "warn"}>{flagLabel(flag)}</Badge>)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-dim"><Clock className="h-3.5 w-3.5" /> <CalendarClock className="h-3.5 w-3.5" /> Times are Central. Your location is only read when you clock in and out.</p>
    </div>
  );
}
