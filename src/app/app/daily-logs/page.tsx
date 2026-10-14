import Link from "next/link";
import { ArrowRight, ClipboardCheck, ClipboardList, Clock, Home as HomeIcon, Plus, Search, Users } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { Select } from "@/components/app/Select";
import { listHref, Pagination, SortHeader } from "@/components/app/ListControls";
import { CoverageLegend, DaySquare, MoodBadge, dayHead } from "@/components/logs/LogBrowserParts";
import { OwedShifts } from "@/components/logs/OwedShifts";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, label, zonedTime } from "@/lib/format";
import { coverage, percent } from "@/lib/log-browser";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import { allNotes, homesOverview, moodFilters, notePageSizes, noteSorts, type MoodFilter, type NoteSort } from "@/server/queries/log-browser";
import { notesOwed, owedTotals } from "@/server/queries/notes-owed";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Daily logs" };

type Search = Record<string, string | undefined>;
const VIEWS = [
  ["homes", "By home", HomeIcon],
  ["notes", "All notes", ClipboardList],
  ["owed", "Notes owed", ClipboardCheck],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function DailyLogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const manager = canManage(user);
  const view: View = VIEWS.some(([value]) => value === query.view) ? (query.view as View) : "homes";
  const selected = query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Daily logs"
        title={view === "owed" ? (manager ? "Notes owed by staff" : "Notes I owe") : view === "notes" ? "All daily notes" : "Daily logs by home"}
        description={
          view === "owed"
            ? "Everyone who works a shift writes a note for each person living at that home. Gaps show here until they are written."
            : view === "notes"
              ? "Every signed shift note in one list. Search, filter and sort, then open any note."
              : "Start with a home, then a person, then a day. Each square is one day: green when every note owed was written."
        }
        action={<Link href="/app/daily-logs/new" className="btn-brand"><Plus className="h-4 w-4" /> New log</Link>}
      />
      <nav className="mb-5 flex w-full gap-1 overflow-x-auto rounded-xl bg-panel p-1 sm:w-fit" aria-label="Daily log views">
        {VIEWS.map(([value, text, Icon]) => (
          <Link
            key={value}
            href={value === "homes" ? "/app/daily-logs" : `/app/daily-logs?view=${value}`}
            aria-current={view === value ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold", view === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}
          >
            <Icon className="h-4 w-4" /> {value === "owed" && !manager ? "Notes I owe" : text}
          </Link>
        ))}
      </nav>
      {view === "owed" ? <OwedView user={user} manager={manager} day={selected} home={query.home} /> : view === "notes" ? <NotesView query={query} /> : <HomesView />}
    </>
  );
}

/* Level one: every home with its last seven days of notes, so gaps stand out before anything is opened. */
async function HomesView() {
  const homes = await homesOverview();
  const today = dateKey();
  const all = homes.flatMap(home => home.week);
  const todayAll = homes.reduce((sum, home) => ({ expected: sum.expected + home.today.expected, matched: sum.matched + home.today.matched }), { expected: 0, matched: 0 });
  const weekPercent = percent(all.reduce((sum, d) => sum + d.matched, 0), all.reduce((sum, d) => sum + d.expected, 0));
  const overdue = homes.reduce((sum, home) => sum + home.overdue, 0);
  const concerns = homes.reduce((sum, home) => sum + home.concerns, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Notes today", `${todayAll.matched} of ${todayAll.expected}`, "Owed for shifts started today", ""],
            ["Last 7 days", weekPercent === null ? "—" : `${weekPercent}%`, "Of notes owed were written", weekPercent !== null && weekPercent < 90 ? "text-[#8a5a10]" : "text-sage"],
            ["Overdue", String(overdue), "Past the deadline after a shift", overdue ? "text-flag" : "text-sage"],
            ["Needs a look", String(concerns), "Hard days, seizures or behaviour this week", concerns ? "text-plum" : ""],
          ] as const
        ).map(([title, value, hint, tone]) => (
          <div key={title} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
            <p className={cn("mt-1 font-display text-2xl font-bold", tone)}>{value}</p>
            <p className="mt-0.5 text-xs text-mute">{hint}</p>
          </div>
        ))}
      </div>

      {homes.length === 0 ? (
        <Panel><Empty>No homes yet.</Empty></Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {homes.map(home => {
            const href = `/app/daily-logs/home/${home.id ?? "none"}`;
            return (
              <li key={home.id ?? "none"} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={href} className="text-lg font-bold group-hover:text-brand">{home.name}</Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-mute">
                      <Users className="h-3.5 w-3.5" /> {home.residents} {home.residents === 1 ? "person" : "people"}
                      {home.latest && (
                        <>
                          <span aria-hidden="true">·</span>
                          <Clock className="h-3.5 w-3.5" /> last note {fmt.day(home.latest)} {fmt.time(home.latest)}
                        </>
                      )}
                    </p>
                  </div>
                  {home.weekPercent !== null && (
                    <span
                      title="Notes written of notes owed, last 7 days"
                      className={cn("rounded-full px-2.5 py-1 text-xs font-bold", home.weekPercent >= 95 ? "bg-sage-soft text-sage" : home.weekPercent >= 75 ? "bg-[#fbecc8] text-[#8a5a10]" : "bg-flag-soft text-flag")}
                    >
                      {home.weekPercent}%
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-7 gap-1.5">
                  {home.week.map(d => {
                    const head = dayHead(d.day);
                    return (
                      <div key={d.day} className="flex flex-col items-center gap-1">
                        <span className={cn("text-[10px] font-semibold uppercase", d.day === today ? "text-brand" : "text-dim")}>{head.weekday}</span>
                        <DaySquare day={d.day} state={coverage(d.expected, d.expected ? d.matched : d.notes, d.day === today)} matched={d.matched} expected={d.expected} notes={d.notes} />
                        <span className="text-[10px] text-dim">{head.date}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <Badge tone={home.today.expected && home.today.matched >= home.today.expected ? "good" : "neutral"}>Today {home.today.matched}/{home.today.expected}</Badge>
                  {home.overdue > 0 && <Badge tone="bad">{home.overdue} overdue</Badge>}
                  {home.concerns > 0 && <Badge tone="warn">{home.concerns} to look at</Badge>}
                  <Link href={href} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <CoverageLegend />
    </div>
  );
}

const noteDefaults = { view: "notes", q: "", home: "", mood: "any", from: "", to: "", sort: "date", dir: "desc", per: 25, page: 1 };
type NoteQuery = typeof noteDefaults;
const isDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");

/* Every note in one list, for searching across homes. */
async function NotesView({ query: raw }: { query: Search }) {
  const query: NoteQuery = {
    ...noteDefaults,
    q: (raw.q ?? "").trim().slice(0, 80),
    home: raw.home ?? "",
    mood: raw.mood && raw.mood in moodFilters ? raw.mood : "any",
    from: isDay(raw.from) || isDay(raw.day),
    to: isDay(raw.to) || isDay(raw.day),
    sort: raw.sort && raw.sort in noteSorts ? raw.sort : "date",
    dir: raw.dir === "asc" ? "asc" : "desc",
    per: notePageSizes.find(size => String(size) === raw.per) ?? 25,
    page: Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1),
  };
  const [result, homes] = await Promise.all([
    allNotes({ ...query, mood: query.mood as MoodFilter, sort: query.sort as NoteSort, dir: query.dir as "asc" | "desc" }),
    listHomes(),
  ]);
  const current = { ...query, page: result.page };
  // "view" is always kept so links stay on this tab.
  const href = (changes: Partial<NoteQuery>) => listHref("/app/daily-logs", { ...noteDefaults, view: "" }, current, changes);
  const filtered = query.q || query.home || query.mood !== "any" || query.from || query.to;
  const sortHead = (sort: NoteSort, text: string, className?: string) => {
    const active = query.sort === sort;
    return (
      <SortHeader active={active} dir={query.dir as "asc" | "desc"} className={className} href={href({ sort, dir: active && query.dir === "desc" ? "asc" : "desc", page: 1 })}>
        {text}
      </SortHeader>
    );
  };

  return (
    <Panel>
      <AutoSubmitForm className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <input type="hidden" name="view" value="notes" />
        <input type="hidden" name="sort" value={query.sort} data-default="date" />
        <input type="hidden" name="dir" value={query.dir} data-default="desc" />
        <input type="hidden" name="per" value={query.per} data-default="25" />
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" aria-hidden="true" />
          <input name="q" defaultValue={query.q} placeholder="Search person, staff or note text" aria-label="Search notes" className="field pl-10" />
        </div>
        <Select name="home" defaultValue={query.home} aria-label="Filter by home" className="lg:w-auto" emptyLabel="All homes" searchable options={[...homes.map(home => ({ value: home.id, label: home.name })), { value: "none", label: "Not in one of our homes" }]} />
        <Select name="mood" dataDefault="any" defaultValue={query.mood} aria-label="Filter by mood" className="lg:w-auto" options={Object.entries(moodFilters).map(([value, text]) => ({ value, label: text }))} />
        <label className="flex items-center gap-2 text-xs text-mute">From <input type="date" name="from" defaultValue={query.from} className="field w-auto py-2" /></label>
        <label className="flex items-center gap-2 text-xs text-mute">To <input type="date" name="to" defaultValue={query.to} className="field w-auto py-2" /></label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary btn-sm">Search</button>
          {filtered && <Link href="/app/daily-logs?view=notes" className="btn-ghost btn-sm">Clear</Link>}
        </div>
      </AutoSubmitForm>
      {result.rows.length === 0 ? (
        <Empty>{filtered ? "No notes match these filters." : "No notes written yet."}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {sortHead("date", "Date")}
                {sortHead("person", "Person")}
                {sortHead("home", "Home", "hidden md:table-cell")}
                <th className="hidden lg:table-cell">Shift</th>
                {sortHead("staff", "Written by")}
                {sortHead("mood", "Mood")}
                <th className="hidden xl:table-cell">Summary</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map(note => (
                <tr key={note.id} className="group hover:bg-panel/50">
                  <td className="whitespace-nowrap">
                    <Link href={`/app/daily-logs/person/${note.individualId}/${note.logDate}`} className="font-semibold hover:text-brand">{fmt.day(note.logDate)}</Link>
                    <span className="block text-xs text-dim">{dateKey(note.createdAt) > note.logDate ? `Late entry ${fmt.day(note.createdAt)}` : `at ${fmt.time(note.createdAt)}`}</span>
                  </td>
                  <td><Link href={`/app/daily-logs/person/${note.individualId}`} className="font-semibold hover:text-brand">{note.first} {note.last}</Link></td>
                  <td className="hidden text-mute md:table-cell">{note.homeId ? <Link href={`/app/daily-logs/home/${note.homeId}`} className="hover:text-brand">{note.home}</Link> : "—"}</td>
                  <td className="hidden text-mute lg:table-cell">{note.shiftName || (note.shift ? `${label("shiftKind", note.shift)} shift` : "—")}</td>
                  <td className="text-mute">{note.staff ?? "—"}</td>
                  <td>
                    <span className="flex flex-wrap items-center gap-1">
                      <MoodBadge mood={note.mood} />
                      {note.seizure && <Badge tone="bad">Seizure</Badge>}
                      {note.behaviourOccurred && <Badge tone="warn">Behaviour</Badge>}
                    </span>
                  </td>
                  <td className="hidden max-w-sm xl:table-cell">
                    <Link href={`/app/daily-logs/${note.id}`} className="line-clamp-2 text-sm text-mute group-hover:text-ink">{note.summary || "No summary written."}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={result.page} pages={result.pages} total={result.total} per={query.per} sizes={notePageSizes} hrefFor={changes => href(changes)} />
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
            <Select name="home" defaultValue={home ?? ""} size="sm" aria-label="Filter by home" emptyLabel="All homes" searchable options={homes.map(option => ({ value: option.id, label: option.name }))} />
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
