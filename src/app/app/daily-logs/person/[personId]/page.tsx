import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronRight, ClipboardList, Stethoscope, UserRound } from "lucide-react";
import { listHref, Pagination } from "@/components/app/ListControls";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { CoverageLegend, Crumbs, DaySquare, MoodBadge, coverageStyle, dayHead } from "@/components/logs/LogBrowserParts";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, initials, label } from "@/lib/format";
import { percent } from "@/lib/log-browser";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { dayFilters, dayPageSizes, isUuid, personDays, type DayFilter } from "@/server/queries/log-browser";

export const metadata = { title: "Daily logs for a person" };

const isDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");

/* Level three: one person, a row per day, newest first. Each day shows the notes written and who still owes one. */
export default async function PersonLogsPage({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const { personId } = await params;
  if (!isUuid(personId)) notFound();
  const raw = await searchParams;
  const [person] = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId, admittedAt: schema.individuals.admittedAt, active: schema.individuals.active, home: schema.homes.name })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(eq(schema.individuals.id, personId))
    .limit(1);
  if (!person) notFound();

  const today = dateKey();
  const defaultFrom = addDays(today, -29);
  const defaults = { from: defaultFrom, to: today, filter: "all", dir: "desc", per: 14, page: 1 };
  const to = isDay(raw.to) && isDay(raw.to) <= today ? isDay(raw.to) : today;
  const fromRaw = isDay(raw.from) || defaultFrom;
  const from = fromRaw > to ? to : fromRaw;
  const query = {
    from,
    to,
    filter: raw.filter && raw.filter in dayFilters ? raw.filter : "all",
    dir: raw.dir === "asc" ? "asc" : "desc",
    per: (dayPageSizes.find(size => String(size) === raw.per) ?? 14) as number,
    page: Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1),
  };
  const base = `/app/daily-logs/person/${person.id}`;
  const result = await personDays(person, { ...query, filter: query.filter as DayFilter, dir: query.dir as "asc" | "desc" });
  const current = { ...query, page: result.page };
  const href = (changes: Partial<typeof query>) => listHref(base, defaults, current, changes);
  const share = percent(result.totals.matched, result.totals.expected);
  const homeCrumb: [string, string] = [person.home ?? "Not in one of our homes", `/app/daily-logs/home/${person.homeId ?? "none"}`];
  const ranges: [string, string, string][] = [
    ["Last 7 days", addDays(today, -6), today],
    ["Last 30 days", defaultFrom, today],
    ["Last 90 days", addDays(today, -89), today],
  ];

  return (
    <>
      <Crumbs items={[["Daily logs", "/app/daily-logs"], homeCrumb, [`${person.first} ${person.last}`, null]]} />
      <PageHeader
        eyebrow={person.home ?? "Daily logs"}
        title={`${person.first} ${person.last}`}
        description={`${fmt.day(result.start)} to ${fmt.day(to)}${person.admittedAt && person.admittedAt > from ? ` · support started ${fmt.day(person.admittedAt)}` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/individuals/${person.id}`} className="btn-ghost btn-sm"><UserRound className="h-3.5 w-3.5" /> Profile</Link>
            {person.active && <Link href={`/app/daily-logs/new?individual=${person.id}`} className="btn-brand btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Write a log</Link>}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Notes written", `${result.totals.notes}`, `${result.totals.withNotes} of ${result.totals.days} days have a note`, ""],
            ["Notes owed written", share === null ? "—" : `${share}%`, result.totals.expected ? `${result.totals.matched} of ${result.totals.expected} from shifts worked` : "No shifts worked at their home", share !== null && share < 90 ? "text-[#8a5a10]" : "text-sage"],
            ["Days with gaps", `${result.totals.gaps}`, "A shift was worked but a note is missing", result.totals.gaps ? "text-flag" : "text-sage"],
            ["Needs a look", `${result.totals.concerns}`, "Hard days, seizures or behaviour", result.totals.concerns ? "text-plum" : ""],
          ] as const
        ).map(([title, value, hint, tone]) => (
          <div key={title} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
            <p className={cn("mt-1 font-display text-2xl font-bold", tone)}>{value}</p>
            <p className="mt-0.5 text-xs text-mute">{hint}</p>
          </div>
        ))}
      </div>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(dayFilters).map(([value, text]) => (
              <Link key={value} href={href({ filter: value, page: 1 })} aria-current={query.filter === value ? "true" : undefined} className={cn("chip", query.filter === value ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
                {text}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ranges.map(([text, rangeFrom, rangeTo]) => (
              <Link key={text} href={href({ from: rangeFrom, to: rangeTo, page: 1 })} aria-current={from === rangeFrom && to === rangeTo ? "true" : undefined} className={cn("chip", from === rangeFrom && to === rangeTo ? "bg-brand text-white" : "bg-panel text-mute hover:text-ink")}>
                {text}
              </Link>
            ))}
            <form className="flex items-center gap-1.5">
              {query.filter !== "all" && <input type="hidden" name="filter" value={query.filter} />}
              {query.dir !== "desc" && <input type="hidden" name="dir" value={query.dir} />}
              <input type="date" name="from" defaultValue={from} max={today} aria-label="From" className="field w-auto py-1.5 text-xs" />
              <span className="text-xs text-mute">to</span>
              <input type="date" name="to" defaultValue={to} max={today} aria-label="To" className="field w-auto py-1.5 text-xs" />
              <button className="btn-ghost btn-sm">Show</button>
            </form>
            <Link href={href({ dir: query.dir === "desc" ? "asc" : "desc", page: 1 })} className="btn-ghost btn-sm" title="Change the order">
              {query.dir === "desc" ? <><ArrowDownWideNarrow className="h-3.5 w-3.5" /> Newest first</> : <><ArrowUpNarrowWide className="h-3.5 w-3.5" /> Oldest first</>}
            </Link>
          </div>
        </div>

        {result.rows.length === 0 ? (
          <Empty>{query.filter === "all" ? "No days in this range." : "No days match this filter in this range."}</Empty>
        ) : (
          <ol className="divide-y divide-line/60">
            {result.rows.map(row => {
              const head = dayHead(row.day);
              const dayHref = `${base}/${row.day}`;
              return (
                <li key={row.day} className={cn("grid gap-4 px-4 py-4 sm:grid-cols-[88px_1fr_auto] sm:px-5", (row.state === "missing" || row.state === "partial") && "bg-flag-soft/25")}>
                  <Link href={dayHref} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1">
                    <span className={cn("text-xs font-semibold uppercase tracking-wider", row.day === today ? "text-brand" : "text-mute")}>{row.day === today ? "Today" : head.weekday}</span>
                    <span className="font-display text-2xl font-bold leading-none">{head.date}</span>
                    <span className="text-xs text-mute">{fmt.day(row.day).split(" ")[0]}</span>
                  </Link>

                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <DaySquare day={row.day} state={row.state} matched={row.matched} expected={row.expected} notes={row.notes} concern={row.concern} />
                      <span className={cn("text-sm font-semibold", coverageStyle[row.state].text)}>{coverageStyle[row.state].word}</span>
                      {row.incidents > 0 && <Badge tone="bad"><AlertTriangle className="mr-1 inline h-3 w-3" />{row.incidents} incident{row.incidents === 1 ? "" : "s"}</Badge>}
                      {row.appointments > 0 && <Badge tone="neutral"><Stethoscope className="mr-1 inline h-3 w-3" />{row.appointments} appointment{row.appointments === 1 ? "" : "s"}</Badge>}
                    </div>
                    {row.list.length > 0 && (
                      <ul className="grid gap-1.5">
                        {row.list.map(note => (
                          <li key={note.id}>
                            <Link href={`/app/daily-logs/${note.id}`} className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm hover:border-brand hover:bg-panel/40", note.concern && "border-l-4 border-l-plum")}>
                              <span className="font-semibold">{note.shiftName || (note.shift ? `${label("shiftKind", note.shift)} shift` : "Note")}</span>
                              <span className="text-mute">by {note.staff ?? "staff"}</span>
                              <MoodBadge mood={note.mood} />
                              {note.late && <Badge tone="warn">Late entry</Badge>}
                              {!note.signedAt && <Badge tone="neutral">Not signed</Badge>}
                              <span className="ml-auto text-xs text-dim">{fmt.time(note.createdAt)}</span>
                              {note.summary && <span className="w-full truncate text-xs text-mute">{note.summary}</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.owedBy.length > 0 && (
                      <p className="text-xs">
                        <span className={cn("font-semibold", row.open ? "text-brand" : "text-flag")}>{row.open ? "Still to come: " : "Not written: "}</span>
                        {row.owedBy.map(owed => `${owed.staff} (${owed.pattern})`).join(", ")}
                      </p>
                    )}
                  </div>

                  <Link href={dayHref} className="hidden items-center gap-1 self-center text-sm font-semibold text-brand sm:flex">
                    Open day <ChevronRight className="h-4 w-4" />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        <Pagination page={result.page} pages={result.pages} total={result.total} per={query.per} sizes={dayPageSizes} note="days" hrefFor={changes => href(changes)} />
      </Panel>
      <div className="mt-4"><CoverageLegend /></div>
      <p className="mt-2 flex items-center gap-2 text-xs text-dim"><Avatar initials={initials(person.first, person.last)} size="sm" /> Each day counts notes owed from the shifts worked at {person.home ?? "their home"} that day.</p>
    </>
  );
}
