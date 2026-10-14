import Link from "next/link";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { Pagination } from "@/components/app/ListControls";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, label } from "@/lib/format";
import type { schema } from "@/server/db";
import { logMoodFilters, logPageSizes, moodSeries, personLogs } from "@/server/queries/person";
import { MoodStrip, moodTone } from "./parts";

type Person = typeof schema.individuals.$inferSelect;

const sections = [
  ["meals", "Meals and fluids"],
  ["activities", "Activities"],
  ["health", "Health"],
  ["behaviours", "Behaviour"],
  ["goalProgress", "Goal progress"],
  ["notes", "Other notes"],
] as const;

/* Every daily log, newest first, with the mood picture and a filter for the hard days. */
export async function PersonLogsTab({ id, person, query }: { id: string; person: Person; query: Record<string, string | undefined> }) {
  const mood = (Object.keys(logMoodFilters) as (keyof typeof logMoodFilters)[]).find(key => key === query.mood) ?? "any";
  const per = logPageSizes.find(size => String(size) === query.per) ?? 10;
  const requested = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const [logs, series] = await Promise.all([personLogs(id, { mood, page: requested, per }), moodSeries(id, 30)]);
  const href = (changes: { mood?: string; page?: number; per?: number }) => {
    const params = new URLSearchParams({ tab: "logs" });
    const next = { mood, page: logs.page, per, ...changes };
    if (next.mood !== "any") params.set("mood", next.mood);
    if (next.per !== 10) params.set("per", String(next.per));
    if (next.page !== 1) params.set("page", String(next.page));
    return `/app/individuals/${id}?${params}`;
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="no-print flex flex-wrap items-center gap-1.5">
          {Object.entries(logMoodFilters).map(([value, text]) => (
            <Link key={value} href={href({ mood: value, page: 1 })} aria-current={mood === value ? "true" : undefined} className={cn("chip", mood === value ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
              {text}
            </Link>
          ))}
          {person.active && (
            <Link href={`/app/daily-logs/new?individual=${id}`} className="btn-brand btn-sm ml-auto"><ClipboardList className="h-3.5 w-3.5" /> Write today&apos;s log</Link>
          )}
        </div>

        {logs.rows.length === 0 ? (
          <Panel>
            <Empty>{mood === "any" ? "No daily logs yet." : "No logs match this mood."}</Empty>
          </Panel>
        ) : (
          <ol className="space-y-3">
            {logs.rows.map(log => {
              return (
                <li key={log.id} className={cn("card p-5", (log.mood === "low" || log.mood === "distressed") && "border-l-4 border-l-accent")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold">{fmt.dayLong(log.logDate)}</p>
                      <p className="text-xs text-mute">Written by {log.staff ?? "staff"} at {fmt.dateTime(log.createdAt)}</p>
                    </div>
                    <Badge tone={moodTone[log.mood]}>Mood: {label("mood", log.mood)}</Badge>
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {sections.map(([key, title]) =>
                      log[key] ? (
                        <div key={key} className={key === "notes" || key === "activities" ? "sm:col-span-2" : undefined}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</dt>
                          <dd className="mt-0.5 whitespace-pre-line text-sm">{log[key]}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                  {log.checks.length > 0 && (
                    <p className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                      {log.checks.map(check => (
                        <span key={check} className="chip bg-sage-soft px-2 py-0.5 text-sage"><CheckCircle2 className="h-3 w-3" /> {check}</span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className="card overflow-hidden">
          <Pagination page={logs.page} pages={logs.pages} total={logs.total} per={per} sizes={logPageSizes} hrefFor={href} />
        </div>
      </div>

      <aside className="space-y-6">
        <Panel title="Last 30 days">
          <div className="space-y-4 p-5">
            <MoodStrip days={series} compact />
            <ul className="space-y-1.5 border-t border-line pt-4 text-sm">
              {(["great", "good", "okay", "low", "distressed"] as const).map(key => {
                const n = logs.moods[key] ?? 0;
                const all = Object.values(logs.moods).reduce<number>((sum, value) => sum + (value ?? 0), 0);
                return (
                  <li key={key} className="flex items-center gap-2">
                    <span className="w-20 text-mute">{label("mood", key)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                      <span className={cn("block h-full rounded-full", key === "low" ? "bg-accent" : key === "distressed" ? "bg-flag" : key === "okay" ? "bg-brand/40" : "bg-sage")} style={{ width: `${all ? (n / all) * 100 : 0}%` }} />
                    </span>
                    <span className="w-6 text-right font-semibold">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
