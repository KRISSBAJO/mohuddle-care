import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { Select } from "@/components/app/Select";
import { listHref, SortHeader } from "@/components/app/ListControls";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { CoverageLegend, Crumbs, DaySquare, MoodBadge, dayHead } from "@/components/logs/LogBrowserParts";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, initials } from "@/lib/format";
import { paginate, percent } from "@/lib/log-browser";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/server/guard";
import { homePeople, isUuid, peopleSorts, windowSizes, type PeopleSort } from "@/server/queries/log-browser";

export const metadata = { title: "Daily logs for a home" };

const defaults = { q: "", end: "", days: 14, sort: "gaps", dir: "desc", status: "current", page: 1 };
type Query = typeof defaults;
const PER = 25;

/* Level two: everyone in one home, with a square for each recent day. Open a person to see their days. */
export default async function HomeLogsPage({ params, searchParams }: { params: Promise<{ homeId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const { homeId } = await params;
  const raw = await searchParams;
  if (homeId !== "none" && !isUuid(homeId)) notFound();
  const home = homeId === "none" ? null : (await db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.id, homeId)).limit(1))[0];
  if (homeId !== "none" && !home) notFound();

  const today = dateKey();
  const days = windowSizes.find(size => String(size) === raw.days) ?? 14;
  const end = raw.end && /^\d{4}-\d{2}-\d{2}$/.test(raw.end) && raw.end <= today ? raw.end : today;
  const query: Query = {
    q: (raw.q ?? "").trim().slice(0, 60),
    end: end === today ? "" : end,
    days,
    sort: raw.sort && raw.sort in peopleSorts ? raw.sort : "gaps",
    dir: raw.dir === "asc" ? "asc" : "desc",
    status: raw.status === "all" ? "all" : "current",
    page: Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1),
  };
  const base = `/app/daily-logs/home/${homeId}`;
  const href = (changes: Partial<Query>) => listHref(base, defaults, query, changes);
  const result = await homePeople(home?.id ?? null, { end, days, q: query.q, sort: query.sort as PeopleSort, dir: query.dir as "asc" | "desc", status: query.status as "current" | "all" });
  const { rows, page, pages, total } = paginate(result.rows, query.page, PER);
  const name = home?.name ?? "Not in one of our homes";
  const expected = result.rows.reduce((sum, row) => sum + row.expected, 0);
  const matched = result.rows.reduce((sum, row) => sum + row.matched, 0);
  const share = percent(matched, expected);
  const sortHead = (sort: PeopleSort, text: string, className?: string) => {
    const active = query.sort === sort;
    return (
      <SortHeader active={active} dir={query.dir as "asc" | "desc"} className={className} href={href({ sort, dir: active ? (query.dir === "asc" ? "desc" : "asc") : sort === "name" ? "asc" : "desc", page: 1 })}>
        {text}
      </SortHeader>
    );
  };

  return (
    <>
      <Crumbs items={[["Daily logs", "/app/daily-logs"], [name, null]]} />
      <PageHeader
        eyebrow="Daily logs"
        title={name}
        description={`${result.rows.length} ${result.rows.length === 1 ? "person" : "people"} · ${fmt.day(result.from)} to ${fmt.day(end)}${share !== null ? ` · ${share}% of notes owed were written` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {home && <Link href={`/app/homes/${home.id}`} className="btn-ghost btn-sm">Home page</Link>}
            <Link href="/app/daily-logs/new" className="btn-brand btn-sm"><Plus className="h-4 w-4" /> New log</Link>
          </div>
        }
      />

      <Panel>
        <AutoSubmitForm className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <input type="hidden" name="sort" value={query.sort} data-default="gaps" />
          <input type="hidden" name="dir" value={query.dir} data-default="desc" />
          {query.end && <input type="hidden" name="end" value={query.end} />}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mute" aria-hidden="true" />
            <input name="q" defaultValue={query.q} placeholder="Find a person" aria-label="Find a person" className="field pl-10" />
          </div>
          <Select name="days" dataDefault="14" defaultValue={String(days)} aria-label="How many days" className="lg:w-auto" options={windowSizes.map(size => ({ value: String(size), label: `Last ${size} days` }))} />
          <Select
            name="status"
            dataDefault="current"
            defaultValue={query.status}
            aria-label="Who to show"
            className="lg:w-auto"
            options={[
              { value: "current", label: "Living here now" },
              { value: "all", label: "Include people who left" },
            ]}
          />
          <div className="flex items-center gap-1">
            <Link href={href({ end: addDays(end, -days), page: 1 })} className="btn-ghost btn-sm px-2" aria-label="Earlier days"><ChevronLeft className="h-4 w-4" /></Link>
            <span className="flex items-center gap-1.5 px-1 text-xs font-semibold text-mute"><CalendarDays className="h-3.5 w-3.5" /> {fmt.day(result.from)} – {fmt.day(end)}</span>
            {end < today ? (
              <Link href={href({ end: addDays(end, days) >= today ? "" : addDays(end, days), page: 1 })} className="btn-ghost btn-sm px-2" aria-label="Later days"><ChevronRight className="h-4 w-4" /></Link>
            ) : (
              <span className="btn-ghost btn-sm px-2 opacity-40" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
            )}
          </div>
        </AutoSubmitForm>

        {rows.length === 0 ? (
          <Empty>{query.q ? "No one here matches that name." : "No one lives here right now."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  {sortHead("name", "Person")}
                  <th className="min-w-[320px]">
                    <div className="flex gap-1">
                      {result.days.map(day => {
                        const head = dayHead(day);
                        return (
                          <span key={day} className={cn("w-5 text-center text-[9px] font-semibold leading-tight", day === today ? "text-brand" : "text-dim")}>
                            {head.weekday.slice(0, 1)}
                            <br />
                            {head.date}
                          </span>
                        );
                      })}
                    </div>
                  </th>
                  {sortHead("gaps", "Gaps")}
                  {sortHead("written", "Notes", "hidden md:table-cell")}
                  {sortHead("concerns", "Look at", "hidden md:table-cell")}
                  {sortHead("last", "Last note")}
                </tr>
              </thead>
              <tbody>
                {rows.map(person => {
                  const personHref = `/app/daily-logs/person/${person.id}`;
                  return (
                    <tr key={person.id} className="group hover:bg-panel/50">
                      <td>
                        <Link href={personHref} className="flex items-center gap-3">
                          <Avatar initials={initials(person.first, person.last)} size="sm" tone={person.active ? "brand" : "neutral"} />
                          <span>
                            <span className="block font-semibold group-hover:text-brand">{person.first} {person.last}</span>
                            <span className="block text-xs text-mute">{person.written} {person.written === 1 ? "note" : "notes"}{person.expected ? ` · ${person.matched} of ${person.expected} owed written` : ""}{!person.active && " · left"}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {person.cells.map(c => (
                            <DaySquare key={c.day} size="sm" day={c.day} state={c.state} matched={c.matched} expected={c.expected} notes={c.notes} concern={c.concern} href={`${personHref}/${c.day}`} />
                          ))}
                        </div>
                      </td>
                      <td>{person.gaps ? <Badge tone="bad">{person.gaps} {person.gaps === 1 ? "day" : "days"}</Badge> : <span className="text-xs text-sage">None</span>}</td>
                      <td className="hidden tabular-nums md:table-cell">{person.written}</td>
                      <td className="hidden md:table-cell">{person.concerns ? <Badge tone="warn">{person.concerns}</Badge> : <span className="text-xs text-dim">—</span>}</td>
                      <td className="whitespace-nowrap">
                        {person.lastNote ? (
                          <span className="flex flex-col gap-1">
                            <span className="text-sm">{fmt.day(person.lastNote)}</span>
                            {person.lastMood && <MoodBadge mood={person.lastMood} />}
                          </span>
                        ) : (
                          <span className="text-xs text-flag">Never</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-mute" aria-label="Pages">
            <span>Page {page} of {pages} · {total} people</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={href({ page: page - 1 })} className="btn-ghost btn-sm">Previous</Link>}
              {page < pages && <Link href={href({ page: page + 1 })} className="btn-ghost btn-sm">Next</Link>}
            </span>
          </nav>
        )}
      </Panel>
      <div className="mt-4"><CoverageLegend /></div>
    </>
  );
}
