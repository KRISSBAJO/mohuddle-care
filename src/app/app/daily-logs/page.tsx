import Link from "next/link";
import { ClipboardCheck, ClipboardList, Plus } from "lucide-react";
import { OwedShifts } from "@/components/logs/OwedShifts";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, initials, label, zonedTime } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listDailyLogs, listHomes } from "@/server/queries/hub";
import { notesOwed, owedTotals } from "@/server/queries/notes-owed";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Daily logs" };
const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;

type Search = { day?: string; view?: string; home?: string };

export default async function DailyLogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const manager = canManage(user);
  const view = query.view === "owed" ? "owed" : "notes";
  const selected = query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : undefined;
  const tab = (next: "notes" | "owed") => `/app/daily-logs${next === "owed" ? `?view=owed${selected ? `&day=${selected}` : ""}` : selected ? `?day=${selected}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Daily logs"
        title={view === "owed" ? "Notes owed by staff" : selected ? fmt.dayLong(selected) : "Recent daily logs"}
        description={
          view === "owed"
            ? "Everyone who works a shift writes a note for each person living at that home. Gaps show here until they are written."
            : "One signed shift note per person per shift: personal care, meals, sleep, health, plan goals, activities and behaviour."
        }
        action={
          <div className="flex items-center gap-2">
            <form className="flex items-center gap-2">
              {view === "owed" && <input type="hidden" name="view" value="owed" />}
              {query.home && <input type="hidden" name="home" value={query.home} />}
              <input type="date" name="day" defaultValue={selected ?? dateKey()} className="field w-auto py-2" aria-label="Show a day" />
              <button className="btn-ghost btn-sm">Show</button>
            </form>
            <Link href="/app/daily-logs/new" className="btn-brand btn-sm"><Plus className="h-4 w-4" /> New log</Link>
          </div>
        }
      />
      <nav className="mb-5 flex gap-1 rounded-xl bg-panel p-1" aria-label="Daily log views">
        {(
          [
            ["notes", "Notes written", ClipboardList],
            ["owed", manager ? "Notes owed by staff" : "Notes I owe", ClipboardCheck],
          ] as const
        ).map(([value, text, Icon]) => (
          <Link
            key={value}
            href={tab(value)}
            aria-current={view === value ? "page" : undefined}
            className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold", view === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}
          >
            <Icon className="h-4 w-4" /> {text}
          </Link>
        ))}
      </nav>
      {view === "owed" ? <OwedView user={user} manager={manager} day={selected} home={query.home} /> : <NotesView day={selected} />}
    </>
  );
}

async function NotesView({ day }: { day?: string }) {
  const logs = await listDailyLogs(day);
  return (
    <Panel>
      {logs.length === 0 ? (
        <Empty>No logs {day ? "for that day" : "yet"}.</Empty>
      ) : (
        <ul className="divide-y divide-line/60">
          {logs.map(log => (
            <li key={log.id} className="flex gap-4 px-5 py-4">
              <Avatar initials={initials(log.first, log.last)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/individuals/${log.individualId}`} className="font-semibold hover:text-brand">{log.first} {log.last}</Link>
                  <span className="text-xs text-mute">{log.home ?? ""}</span>
                  <Badge tone={moodTone[log.mood]}>{label("mood", log.mood)}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-mute">{log.notes || log.activities || "No narrative written."}</p>
                <p className="mt-1 text-xs text-dim">
                  {[fmt.day(log.logDate), log.shiftName || (log.shift ? `${label("shiftKind", log.shift)} shift` : null), `written ${fmt.time(log.createdAt)} by ${log.staff ?? "staff"}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Link href={`/app/daily-logs/${log.id}`} className="shrink-0 self-center text-xs font-semibold text-brand hover:text-brand-deep">Open note</Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* Shifts that started on the chosen day (or the last two days), with the notes each person on them still owes. */
async function OwedView({ user, manager, day, home }: { user: { staffId: string | null }; manager: boolean; day?: string; home?: string }) {
  const today = dateKey();
  const from = day ? zonedTime(day, "00:00") : zonedTime(addDays(today, -1), "00:00");
  const to = day ? zonedTime(addDays(day, 1), "00:00") : undefined;
  if (!manager && !user.staffId) return <Panel><Empty>Your login is not linked to a staff record, so no shift notes are owed.</Empty></Panel>;
  const [shifts, homes, settings] = await Promise.all([
    notesOwed({ from, to, staffId: manager ? undefined : user.staffId!, homeId: home && /^[0-9a-f-]{36}$/.test(home) ? home : undefined }),
    listHomes(),
    getSettings(),
  ]);
  const totals = owedTotals(shifts);
  const byStaff = new Map<string, { name: string; missing: number; overdue: number }>();
  for (const shift of shifts) {
    const missing = shift.people.filter(person => !person.logId).length;
    if (!missing) continue;
    const entry = byStaff.get(shift.staffId) ?? { name: shift.staff, missing: 0, overdue: 0 };
    entry.missing += missing;
    if (shift.state === "overdue") entry.overdue += missing;
    byStaff.set(shift.staffId, entry);
  }
  const ranked = [...byStaff.entries()].sort((a, b) => b[1].overdue - a[1].overdue || b[1].missing - a[1].missing);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Notes expected", totals.expected, ""],
            ["Written", totals.written, "text-sage"],
            ["Still to write", totals.missing, totals.missing ? "text-[#8a5a10]" : ""],
            ["Overdue", totals.overdue, totals.overdue ? "text-flag" : "text-sage"],
          ].map(([title, value, tone]) => (
            <div key={title as string} className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
              <p className={cn("mt-1 font-display text-2xl font-bold", tone as string)}>{value}</p>
            </div>
          ))}
        </div>
        {manager && (
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="view" value="owed" />
            {day && <input type="hidden" name="day" value={day} />}
            <select name="home" defaultValue={home ?? ""} className="field w-auto py-2" aria-label="Filter by home">
              <option value="">All homes</option>
              {homes.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <button className="btn-ghost btn-sm">Filter</button>
            <p className="text-xs text-mute">{day ? `Shifts that started on ${fmt.dayLong(day)}.` : "Shifts that started yesterday or today."} Notes are due {settings.shift_note_grace_hours} hours after a shift ends.</p>
          </form>
        )}
        <div className="card overflow-hidden">
          <OwedShifts shifts={[...shifts].reverse()} myStaffId={user.staffId} empty={day ? "No shifts were worked that day." : "No shifts worked yesterday or today."} />
        </div>
      </div>
      {manager && (
        <aside>
          <Panel title="Who still owes notes">
            {ranked.length === 0 ? (
              <Empty>Everyone is up to date.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {ranked.map(([staffId, entry]) => (
                  <li key={staffId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Link href={`/app/staff/${staffId}`} className="font-semibold hover:text-brand">{entry.name}</Link>
                    <span className="flex gap-1.5">
                      {entry.overdue > 0 && <Badge tone="bad">{entry.overdue} overdue</Badge>}
                      {entry.missing > entry.overdue && <Badge tone="warn">{entry.missing - entry.overdue} due</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      )}
    </div>
  );
}
