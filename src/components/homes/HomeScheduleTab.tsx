import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, UserRound } from "lucide-react";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, label, weekStart, zonedTime } from "@/lib/format";
import {
  analyzeWeek,
  compactRange,
  counts,
  coverageKey,
  patternHours,
  requiredPatterns,
  shiftDay,
  windowFor,
  type SchedShift,
} from "@/lib/schedule";
import { notesOwed, owedTotals } from "@/server/queries/notes-owed";
import { scheduleData } from "@/server/queries/schedule";

const statusTone = { open: "bad", scheduled: "neutral", confirmed: "good", completed: "brand", missed: "bad" } as const;

/*
 * One home's week: for each day, the shift patterns it needs and who covers them, the gaps and open
 * shifts, other shifts, and how its daily notes stand. Coordinators fill gaps in the full scheduler.
 */
export async function HomeScheduleTab({ homeId, week, manager }: { homeId: string; week?: string; manager: boolean }) {
  const today = dateKey();
  const start = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const data = await scheduleData(start);
  const home = data.homes.find(option => option.id === homeId);
  const base = `/app/homes/${homeId}?tab=schedule`;
  const scheduler = `/app/schedule?home=${homeId}${start !== weekStart(today) ? `&week=${start}` : ""}`;
  const nav = (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${base}&week=${addDays(start, -7)}`} className="btn-ghost btn-sm px-2" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Link>
      {start !== weekStart(today) && <Link href={base} className="btn-ghost btn-sm">This week</Link>}
      <Link href={`${base}&week=${addDays(start, 7)}`} className="btn-ghost btn-sm px-2" aria-label="Next week"><ChevronRight className="h-4 w-4" /></Link>
      <Link href={scheduler} className="btn-brand btn-sm"><ExternalLink className="h-3.5 w-3.5" /> {manager ? "Edit in the scheduler" : "Open the scheduler"}</Link>
    </div>
  );
  if (!home) {
    return (
      <Panel>
        <Empty>This home is closed, so it has no schedule.</Empty>
      </Panel>
    );
  }

  const shifts = data.shifts.filter(shift => shift.homeId === homeId);
  const inWeek = shifts.filter(shift => days.includes(shiftDay(shift)));
  const analysis = analyzeWeek(data.shifts, data.staff, [home], days, data.rules, today);
  const names = new Map([...data.staff, ...data.former].map(person => [person.id, `${person.firstName} ${person.lastName}`]));
  const open = inWeek.filter(shift => !shift.staffId && counts(shift) && shiftDay(shift) >= today);
  const gaps = analysis.issues.filter(issue => issue.type === "coverage");
  let need = 0;
  let have = 0;
  for (const day of days) {
    for (const pattern of requiredPatterns(home, day, data.rules.patterns)) {
      const cell = analysis.coverage.get(coverageKey(home.id, day, pattern.id));
      need += cell?.required ?? 0;
      have += Math.min(cell?.filled ?? 0, cell?.required ?? 0);
    }
  }
  const staffedPct = need ? Math.round((have / need) * 100) : 100;
  const hours = inWeek.filter(shift => shift.staffId && counts(shift)).reduce((sum, shift) => sum + (Date.parse(shift.endsAt) - Date.parse(shift.startsAt)) / 3_600_000, 0);
  const owed = await notesOwed({ from: zonedTime(start, "00:00"), to: zonedTime(addDays(start, 7), "00:00"), homeId });
  const owedSum = owedTotals(owed);
  const patternName = new Map(data.rules.patterns.map(pattern => [pattern.id, pattern.name]));

  const card = (shift: SchedShift) => (
    <li key={shift.id} className={cn("rounded-lg border px-2.5 py-1.5 text-xs", !shift.staffId ? "border-dashed border-flag/60 bg-flag-soft/60" : "border-line bg-white")}>
      <p className="font-semibold">{compactRange(shift)}</p>
      <p className="truncate text-[11px] text-mute">{shift.patternId ? patternName.get(shift.patternId) ?? "Retired pattern" : "Custom times"}</p>
      <p className={cn("mt-0.5 flex items-center gap-1 truncate", !shift.staffId ? "font-semibold text-flag" : "text-ink")}>
        <UserRound className="h-3 w-3 shrink-0" /> {shift.staffId ? names.get(shift.staffId) ?? "Former staff" : "Open shift"}
      </p>
      {shift.staffId && shift.status !== "scheduled" && <Badge tone={statusTone[shift.status]} className="mt-1 px-1.5 py-0 text-[10px]">{label("shiftStatus", shift.status)}</Badge>}
    </li>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="h-5 w-5 text-brand" /> {fmt.day(start)} – {fmt.day(addDays(start, 6))}</h2>
          <p className="text-sm text-mute">
            {home.staffedPatterns === null ? "Staffed around the clock" : home.staffedPatterns.length ? `Needs ${data.rules.patterns.filter(pattern => home.staffedPatterns!.includes(pattern.id)).map(pattern => pattern.name).join(", ")}` : "No set staffing"}
            {home.openDays.length < 7 && `, ${home.openDays.length} days a week`}.
          </p>
        </div>
        {nav}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Staffed", need ? `${staffedPct}%` : "—", need ? (staffedPct === 100 ? "text-sage" : staffedPct >= 80 ? "text-[#8a5a10]" : "text-flag") : "", "of the hours this home needs"],
          ["Shifts", String(inWeek.length), "", `${Math.round(hours)} staffed hours`],
          ["Open shifts", String(open.length), open.length ? "text-flag" : "text-sage", "from today on"],
          ["Coverage gaps", String(gaps.length), gaps.length ? "text-flag" : "text-sage", "patterns not fully staffed"],
          ["Notes owed", String(owedSum.missing), owedSum.overdue ? "text-flag" : owedSum.missing ? "text-[#8a5a10]" : "text-sage", owedSum.overdue ? `${owedSum.overdue} overdue` : `${owedSum.written} of ${owedSum.expected} written`],
        ].map(([title, value, tone, hint]) => (
          <div key={title} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
            <p className={cn("mt-1 font-display text-2xl font-bold", tone)}>{value}</p>
            <p className="text-xs text-mute">{hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[880px] grid-cols-7 gap-2">
          {days.map(day => {
            const required = requiredPatterns(home, day, data.rules.patterns);
            const dayShifts = inWeek.filter(shift => shiftDay(shift) === day).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
            const closed = !home.openDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay() || 7);
            return (
              <section key={day} className={cn("card overflow-hidden", day === today && "ring-2 ring-brand/40", (day < today || closed) && "opacity-80")}>
                <header className={cn("border-b border-line px-3 py-2", day === today ? "bg-sky/60" : "bg-panel/50")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{fmt.weekday(day)}</p>
                  <p className="font-display text-lg font-bold">{fmt.day(day)}</p>
                </header>
                <div className="space-y-2 p-2">
                  {closed && <p className="rounded-lg bg-panel px-2 py-1.5 text-center text-[11px] text-mute">Closed</p>}
                  {required.map(pattern => {
                    const cell = analysis.coverage.get(coverageKey(home.id, day, pattern.id));
                    const ok = (cell?.filled ?? 0) >= data.rules.coverageMinimum;
                    const window = windowFor(day, patternHours(pattern));
                    return (
                      <div key={pattern.id} className={cn("rounded-lg px-2 py-1 text-[11px]", ok ? "bg-sage-soft text-sage" : day < today ? "bg-panel text-mute" : "bg-flag-soft text-flag")} title={`${pattern.name} ${pattern.start}–${pattern.end}`}>
                        <span className="flex items-center gap-1 font-semibold">
                          {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} {pattern.name}
                        </span>
                        <span>{compactRange(window)} · {ok ? "covered" : day < today ? "was not covered" : "needs cover"}</span>
                      </div>
                    );
                  })}
                  <ul className="space-y-1.5">{dayShifts.map(card)}</ul>
                  {!dayShifts.length && !closed && <p className="py-2 text-center text-[11px] text-dim">No shifts</p>}
                  {manager && day >= today && required.some(pattern => (analysis.coverage.get(coverageKey(home.id, day, pattern.id))?.filled ?? 0) < data.rules.coverageMinimum) && (
                    <Link href={`/app/schedule?home=${homeId}&view=day&day=${day}${start !== weekStart(today) ? `&week=${start}` : ""}`} className="block rounded-lg border border-dashed border-flag/60 py-1.5 text-center text-[11px] font-semibold text-flag hover:bg-flag-soft/50">
                      Fill the gap
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Open shifts (${open.length})`}>
          {open.length === 0 ? (
            <Empty>No open shifts from today on.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {open.map(shift => (
                <li key={shift.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{fmt.weekday(shiftDay(shift))} {fmt.day(shiftDay(shift))}</span>
                    <span className="text-mute"> · {shift.patternId ? patternName.get(shift.patternId) : "Custom"} {compactRange(shift)}</span>
                  </span>
                  {manager && <Link href={`/app/schedule?home=${homeId}&view=day&day=${shiftDay(shift)}${start !== weekStart(today) ? `&week=${start}` : ""}`} className="text-xs font-semibold text-brand">Fill</Link>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Problems this week">
          {analysis.issues.filter(issue => issue.homeId === homeId || (issue.shiftId && inWeek.some(shift => shift.id === issue.shiftId))).length === 0 ? (
            <Empty>No gaps, clashes or rest problems.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {analysis.issues
                .filter(issue => issue.homeId === homeId || (issue.shiftId && inWeek.some(shift => shift.id === issue.shiftId)))
                .map(issue => (
                  <li key={issue.key} className="flex items-start gap-2 px-5 py-3 text-sm">
                    <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", issue.severity === "high" ? "text-flag" : "text-[#b7791f]")} />
                    {issue.text}
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Daily notes this week"
        action={<Link href={`/app/daily-logs?view=owed&home=${homeId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand"><ClipboardCheck className="h-3.5 w-3.5" /> Notes owed</Link>}
      >
        <p className="px-5 py-4 text-sm text-mute">
          {owedSum.expected === 0
            ? "No notes were due this week."
            : `${owedSum.written} of ${owedSum.expected} notes written by the staff who worked here.${owedSum.overdue ? ` ${owedSum.overdue} are overdue.` : ""}`}
        </p>
      </Panel>
    </div>
  );
}
