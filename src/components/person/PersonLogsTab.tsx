import Link from "next/link";
import { CalendarDays, ClipboardList, MapPin } from "lucide-react";
import { Pagination } from "@/components/app/ListControls";
import { Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { durationWords } from "@/lib/community-note";
import { fmt, label } from "@/lib/format";
import { clockLabel } from "@/lib/log-note";
import { communityNotesFor } from "@/server/queries/community-notes";
import type { schema } from "@/server/db";
import { logMoodFilters, logPageSizes, moodSeries, personLogs } from "@/server/queries/person";
import { LogNoteView } from "@/components/logs/LogNoteView";
import { MoodStrip } from "./parts";

type Person = typeof schema.individuals.$inferSelect;


/* Every daily log, newest first, with the mood picture and a filter for the hard days. */
export async function PersonLogsTab({ id, person, query, adlOrder }: { id: string; person: Person; query: Record<string, string | undefined>; adlOrder: string[] }) {
  const mood = (Object.keys(logMoodFilters) as (keyof typeof logMoodFilters)[]).find(key => key === query.mood) ?? "any";
  const per = logPageSizes.find(size => String(size) === query.per) ?? 10;
  const requested = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const [logs, series, community] = await Promise.all([personLogs(id, { mood, page: requested, per }), moodSeries(id, 30), communityNotesFor(id)]);
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
          <Link href={`/app/daily-logs/person/${id}`} className="btn-ghost btn-sm ml-auto"><CalendarDays className="h-3.5 w-3.5" /> Day by day</Link>
          {person.active && (
            <Link href={`/app/daily-logs/new?individual=${id}`} className="btn-brand btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Write today&apos;s log</Link>
          )}
        </div>

        {logs.rows.length === 0 ? (
          <Panel>
            <Empty>{mood === "any" ? "No daily logs yet." : "No logs match this mood."}</Empty>
          </Panel>
        ) : (
          <ol className="space-y-3">
            {logs.rows.map(({ log, staff }) => (
              <li key={log.id} className={cn("card p-5", (log.mood === "low" || log.mood === "distressed" || log.seizure || log.behaviourOccurred) && "border-l-4 border-l-accent")}>
                <LogNoteView log={log} goals={logs.goals.get(log.id) ?? []} staff={staff} adlOrder={adlOrder} compact />
                <p className="no-print mt-3 text-right">
                  <Link href={`/app/daily-logs/${log.id}`} className="text-xs font-semibold text-brand hover:text-brand-deep">Open the full note</Link>
                </p>
              </li>
            ))}
          </ol>
        )}
        <div className="card overflow-hidden">
          <Pagination page={logs.page} pages={logs.pages} total={logs.total} per={per} sizes={logPageSizes} hrefFor={href} />
        </div>
      </div>

      <aside className="space-y-6">
        <Panel title="Community Participation" action={person.active ? <Link href={`/app/community-notes/new?individual=${id}`} className="text-xs font-semibold text-brand hover:text-brand-deep">New note</Link> : undefined}>
          {community.length === 0 ? (
            <Empty>No Community Participation notes yet.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {community.map(note => (
                <li key={note.id}>
                  <Link href={`/app/community-notes/${note.id}`} className="flex items-start gap-2.5 px-5 py-3 text-sm hover:bg-panel/60">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{note.activity}</span>
                      <span className="block text-xs text-mute">{fmt.day(note.noteDate)}, {clockLabel(note.startTime)} to {clockLabel(note.endTime)} · {durationWords(note.minutes)}{note.staff ? ` · ${note.staff}` : ""}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
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
