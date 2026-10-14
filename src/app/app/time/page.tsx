import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Coffee, FileSpreadsheet, Palmtree, History, MapPinOff, Phone, Radio, ScrollText, TimerReset, UserX } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { listHref, Pagination } from "@/components/app/ListControls";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { HandoverCard } from "@/components/clock/HandoverCard";
import { TimesheetsView } from "@/components/clock/TimesheetsView";
import { TimeOffView } from "@/components/clock/TimeOffView";
import { ReportsView } from "@/components/clock/ReportsView";
import { Select } from "@/components/app/Select";
import { cn } from "@/lib/cn";
import { dateKey, fmt } from "@/lib/format";
import { flagLabel, formatMinutes } from "@/lib/timeclock";
import { decideCorrection, reviewEntry } from "@/server/actions/timeclock";
import { requestTime } from "@/server/clock";
import { requireManager } from "@/server/guard";
import { listHomes, listStaff } from "@/server/queries/hub";
import { entryFilters, handoverLog, liveBoard, rowMinutes, searchEntries, type EntryFilter, type EntryRow } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Time & attendance" };

const TABS = [
  ["live", "Live board", Radio],
  ["review", "To review", AlertTriangle],
  ["punches", "All punches", History],
  ["handovers", "Handovers", ScrollText],
  ["timesheets", "Timesheets", FileSpreadsheet],
  ["timeoff", "Time off", Palmtree],
  ["reports", "Reports", BarChart3],
] as const;
type Tab = (typeof TABS)[number][0];
type Search = Record<string, string | undefined>;

const isDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");

function Flags({ flags }: { flags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map(flag => <Badge key={flag} tone={["edited", "corrected", "late"].includes(flag) ? "neutral" : "warn"}>{flagLabel(flag)}</Badge>)}
    </span>
  );
}

export default async function TimePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireManager();
  const query = await searchParams;
  const tab: Tab = TABS.some(([value]) => value === query.tab) ? (query.tab as Tab) : "live";
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  const board = await liveBoard(now, settings);
  const counts: Partial<Record<Tab, number>> = { review: board.review.length + board.corrections.length };

  return (
    <>
      <PageHeader
        eyebrow="Time & attendance"
        title={{ live: "Who is working", review: "Time to review", punches: "All punches", handovers: "Handovers", timesheets: "Timesheets and payroll", timeoff: "Time off", reports: "Attendance reports" }[tab]}
        description={tab === "timesheets" ? "Each pay period: check hours, approve timesheets, lock the period, then download the payroll file." : "Live from staff clocking in and out on their phones, against the schedule."}
      />
      <nav className="mb-6 flex w-full gap-1 overflow-x-auto rounded-xl bg-panel p-1 sm:w-fit" aria-label="Time views">
        {TABS.map(([value, text, Icon]) => (
          <Link
            key={value}
            href={value === "live" ? "/app/time" : `/app/time?tab=${value}`}
            aria-current={tab === value ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold", tab === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}
          >
            <Icon className="h-4 w-4" /> {text}
            {counts[value] ? <span className="chip bg-accent-soft px-1.5 py-0 text-[#8a5a10]">{counts[value]}</span> : null}
          </Link>
        ))}
      </nav>
      {tab === "live" && <LiveView board={board} now={now} />}
      {tab === "review" && <ReviewView board={board} now={now} />}
      {tab === "punches" && <PunchesView query={query} now={now} />}
      {tab === "handovers" && <HandoversView query={query} />}
      {tab === "timeoff" && <TimeOffView settings={settings} now={now} />}
      {tab === "reports" && <ReportsView query={query} settings={settings} now={now} />}
      {tab === "timesheets" && <TimesheetsView requested={query.period} settings={settings} now={now} admin={user.role === "admin"} />}
    </>
  );
}

type Board = Awaited<ReturnType<typeof liveBoard>>;

function LiveView({ board, now }: { board: Board; now: number }) {
  const today = dateKey(new Date(now));
  const when = (at: Date) => (dateKey(at) === today ? fmt.time(at) : fmt.dateTime(at));
  const onBreak = board.byHome.flatMap(home => home.on).filter(row => row.onBreak).length;
  const stats = [
    { title: "On the clock", value: board.open.length, hint: `${onBreak} on a break`, tone: "good" },
    { title: "Late, not in yet", value: board.lateNotIn.length, hint: "Past the grace period", tone: board.lateNotIn.length ? "warn" : "neutral" },
    { title: "No-shows", value: board.noShows.length, hint: "Shift started, no clock-in", tone: board.noShows.length ? "bad" : "good" },
    { title: "Past shift end", value: board.pastEnd.length, hint: `${board.forgotten.length} look forgotten`, tone: board.forgotten.length ? "bad" : board.pastEnd.length ? "warn" : "neutral" },
  ];
  const attention = [
    ...board.noShows.map(shift => ({ key: `ns-${shift.id}`, icon: UserX, tone: "bad", title: `${shift.staff} has not clocked in`, detail: `${shift.pattern ?? "Shift"} at ${shift.home}, started ${when(shift.startsAt)}`, phone: shift.phone, href: `/app/homes/${shift.homeId}?tab=schedule` })),
    ...board.lateNotIn.map(shift => ({ key: `late-${shift.id}`, icon: Clock, tone: "warn", title: `${shift.staff} is late`, detail: `${shift.pattern ?? "Shift"} at ${shift.home}, started ${fmt.time(shift.startsAt)}`, phone: shift.phone, href: `/app/homes/${shift.homeId}?tab=schedule` })),
    ...board.forgotten.map(row => ({ key: `fg-${row.id}`, icon: TimerReset, tone: "bad", title: `${row.staff} may have forgotten to clock out`, detail: `${row.home ?? "No home"}, ${row.shiftEnd ? `shift ended ${fmt.time(row.shiftEnd)}` : `clocked in ${fmt.dateTime(row.clockInAt)}`}`, phone: "", href: `/app/time/${row.id}` })),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.title} className="card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{stat.title}</p>
            <p className={cn("mt-0.5 font-display text-xl font-bold", stat.tone === "good" && "text-sage", stat.tone === "warn" && "text-[#8a5a10]", stat.tone === "bad" && "text-flag")}>{stat.value}</p>
            <p className="text-xs text-mute">{stat.hint}</p>
          </div>
        ))}
      </div>

      {attention.length > 0 && (
        <Panel title={`Needs you now (${attention.length})`} className="ring-2 ring-flag/30">
          <ul className="divide-y divide-line/60">
            {attention.map(item => (
              <li key={item.key} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <item.icon className={cn("h-4 w-4 shrink-0", item.tone === "bad" ? "text-flag" : "text-[#8a5a10]")} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-xs text-mute">{item.detail}</span>
                </span>
                {item.phone && <a href={`tel:${item.phone}`} className="btn-ghost btn-sm"><Phone className="h-3.5 w-3.5" /> Call</a>}
                <Link href={item.href} className="btn-ghost btn-sm">Open</Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {board.byHome.map(home => {
          const short = home.on.length < Math.min(board.minimum, Math.max(home.expected, 0)) || (home.expected > 0 && home.on.length === 0);
          return (
            <section key={home.id} className={cn("card overflow-hidden", short && "ring-2 ring-flag/30")}>
              <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <Link href={`/app/homes/${home.id}`} className="font-bold hover:text-brand">{home.name}</Link>
                <span className={cn("chip", short ? "bg-flag-soft text-flag" : home.on.length ? "bg-sage-soft text-sage" : "bg-panel text-mute")}>{home.on.length} on{home.expected ? ` · ${home.expected} scheduled` : ""}</span>
              </header>
              {home.on.length === 0 ? (
                <p className="px-5 py-4 text-sm text-mute">{home.expected ? "Nobody has clocked in." : "Nobody scheduled right now."}</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {home.on.map(row => (
                    <li key={row.id}>
                      <Link href={`/app/time/${row.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-panel/40">
                        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", row.onBreak ? "bg-accent" : "bg-sage")} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{row.staff}</span>
                          <span className="block text-xs text-mute">
                            In {fmt.time(row.clockInAt)} · {formatMinutes(rowMinutes(row, now))}
                            {row.shiftEnd ? ` · ends ${fmt.time(row.shiftEnd)}` : " · no shift"}
                          </span>
                        </span>
                        {row.onBreak && <Badge tone="warn"><Coffee className="mr-1 inline h-3 w-3" />Break</Badge>}
                        {row.inLocation === "outside" && <MapPinOff className="h-4 w-4 text-flag" aria-label="Clocked in away from the home" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EntryList({ rows, now, empty, review = false }: { rows: EntryRow[]; now: number; empty: string; review?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Staff</th>
            <th>Day</th>
            <th className="hidden md:table-cell">Home</th>
            <th>In – out</th>
            <th className="text-right">Worked</th>
            <th>Flags</th>
            {review && <th className="text-right">Review</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group hover:bg-panel/50">
              <td><Link href={`/app/time/${row.id}`} className="font-semibold group-hover:text-brand">{row.staff}</Link></td>
              <td className="whitespace-nowrap">{fmt.day(row.clockInAt)}</td>
              <td className="hidden text-mute md:table-cell">{row.home ?? "—"}</td>
              <td className="whitespace-nowrap">
                {fmt.time(row.clockInAt)} – {row.clockOutAt ? fmt.time(row.clockOutAt) : <Badge tone="good">On now</Badge>}
                {row.shiftStart && <span className="block text-xs text-dim">Shift {fmt.time(row.shiftStart)}–{fmt.time(row.shiftEnd)}</span>}
              </td>
              <td className="text-right tabular-nums">{formatMinutes(rowMinutes(row, now))}</td>
              <td><Flags flags={row.flags} />{row.reviewedAt && <span className="mt-1 flex items-center gap-1 text-xs text-sage"><CheckCircle2 className="h-3 w-3" /> Reviewed</span>}</td>
              {review && (
                <td className="text-right">
                  <ActionForm action={reviewEntry.bind(null, row.id)} submitLabel="Mark reviewed" className="justify-items-end">
                    <span className="sr-only">Mark {row.staff}&apos;s punch reviewed</span>
                  </ActionForm>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewView({ board, now }: { board: Board; now: number }) {
  return (
    <div className="space-y-6">
      <Panel title={`Correction requests (${board.corrections.length})`}>
        {board.corrections.length === 0 ? (
          <Empty>No requests waiting.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {board.corrections.map(({ correction, staff, home }) => (
              <li key={correction.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_22rem]">
                <div className="text-sm">
                  <p className="font-semibold">{staff} <span className="font-normal text-mute">· {home ?? "no home"} · asked {fmt.dateTime(correction.createdAt)}</span></p>
                  <p className="mt-1">
                    {correction.entryId ? "Change a punch to " : "Add a shift they did not clock: "}
                    <span className="font-semibold">{fmt.day(correction.clockInAt)} {fmt.time(correction.clockInAt)} to {fmt.time(correction.clockOutAt)}</span>
                    {" "}({formatMinutes(Math.round((correction.clockOutAt.getTime() - correction.clockInAt.getTime()) / 60_000))})
                  </p>
                  <p className="mt-1 whitespace-pre-line text-mute">{correction.reason}</p>
                  {correction.entryId && <Link href={`/app/time/${correction.entryId}`} className="mt-1 inline-block text-xs font-semibold text-brand">See the punch</Link>}
                </div>
                <div className="grid gap-2">
                  <ActionForm action={decideCorrection.bind(null, correction.id, true)} submitLabel="Approve">
                    <input name="note" maxLength={1000} className="field py-2 text-sm" placeholder="Note to them (optional)" aria-label="Approval note" />
                  </ActionForm>
                  <ActionForm action={decideCorrection.bind(null, correction.id, false)} submitLabel="Decline">
                    <input name="note" maxLength={1000} className="field py-2 text-sm" placeholder="Why it is declined" aria-label="Reason for declining" />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={`Punches to look at (${board.review.length})`}>
        <EntryList rows={board.review} now={now} empty="Nothing flagged in the last 45 days." review />
      </Panel>
    </div>
  );
}

const punchDefaults = { tab: "punches", filter: "all", staff: "", home: "", from: "", to: "", page: 1, per: 25 };

async function PunchesView({ query: raw, now }: { query: Search; now: number }) {
  const query = {
    ...punchDefaults,
    filter: raw.filter && raw.filter in entryFilters ? raw.filter : "all",
    staff: raw.staff ?? "",
    home: raw.home ?? "",
    from: isDay(raw.from),
    to: isDay(raw.to),
    page: Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1),
    per: [25, 50, 100].find(size => String(size) === raw.per) ?? 25,
  };
  const [result, staff, homes] = await Promise.all([searchEntries({ ...query, filter: query.filter as EntryFilter }), listStaff(), listHomes()]);
  const current = { ...query, page: result.page };
  const href = (changes: Partial<typeof query>) => listHref("/app/time", { ...punchDefaults, tab: "" }, current, changes);

  return (
    <Panel>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 pt-4">
        {Object.entries(entryFilters).map(([value, text]) => (
          <Link key={value} href={href({ filter: value, page: 1 })} aria-current={query.filter === value ? "true" : undefined} className={cn("chip", query.filter === value ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
            {text}
          </Link>
        ))}
      </div>
      <AutoSubmitForm className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <input type="hidden" name="tab" value="punches" />
        <input type="hidden" name="filter" value={query.filter} data-default="all" />
        <div className="min-w-[220px] flex-1">
          <SearchSelect name="staff" defaultValue={query.staff} placeholder="Any staff member" emptyLabel="Any staff member" submitOnChange options={staff.map(member => ({ value: member.id, label: `${member.firstName} ${member.lastName}` }))} />
        </div>
        <Select name="home" defaultValue={query.home} aria-label="Home" emptyLabel="All homes" className="lg:w-56" options={homes.map(home => ({ value: home.id, label: home.name }))} />
        <label className="flex items-center gap-2 text-xs text-mute">From <input type="date" name="from" defaultValue={query.from} className="field w-auto py-2" /></label>
        <label className="flex items-center gap-2 text-xs text-mute">To <input type="date" name="to" defaultValue={query.to} className="field w-auto py-2" /></label>
        <button type="submit" className="btn-primary btn-sm">Show</button>
      </AutoSubmitForm>
      <EntryList rows={result.rows} now={now} empty="No punches match." />
      <Pagination page={result.page} pages={result.pages} total={result.total} per={query.per} sizes={[25, 50, 100]} hrefFor={changes => href(changes)} />
    </Panel>
  );
}

async function HandoversView({ query: raw }: { query: Search }) {
  const query = { tab: "handovers", home: raw.home ?? "", page: Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1), per: 10 };
  const [result, homes] = await Promise.all([handoverLog(query), listHomes()]);
  const href = (changes: Partial<typeof query>) => listHref("/app/time", { tab: "", home: "", page: 1, per: 10 }, { ...query, page: result.page }, changes);
  return (
    <div className="space-y-4">
      <AutoSubmitForm className="flex items-center gap-3">
        <input type="hidden" name="tab" value="handovers" />
        <Select name="home" defaultValue={query.home} aria-label="Home" emptyLabel="All homes" className="w-64" options={homes.map(home => ({ value: home.id, label: home.name }))} />
      </AutoSubmitForm>
      {result.rows.length === 0 ? (
        <Panel><Empty>No handovers yet. They are written when staff clock out.</Empty></Panel>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {result.rows.map(({ handover, home, staff, reads }) => (
            <li key={handover.id} className="card p-5">
              <HandoverCard handover={{ ...handover, staff, home }} compact />
              <p className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-mute">
                <span>{reads ? `Read by ${reads} ${reads === 1 ? "person" : "people"}` : "Not read yet"}</span>
                {handover.entryId && <Link href={`/app/time/${handover.entryId}`} className="font-semibold text-brand">The punch</Link>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="card overflow-hidden">
        <Pagination page={result.page} pages={result.pages} total={result.total} per={10} sizes={[10]} hrefFor={changes => href(changes)} />
      </div>
    </div>
  );
}
