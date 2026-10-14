import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { dateKey, fmt, initials, label } from "@/lib/format";
import { requireUser } from "@/server/guard";
import { listDailyLogs } from "@/server/queries/hub";

export const metadata = { title: "Daily logs" };
const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;

export default async function DailyLogsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireUser();
  const { day } = await searchParams;
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
  const logs = await listDailyLogs(selected);
  return (
    <>
      <PageHeader
        eyebrow="Daily logs"
        title={selected ? fmt.dayLong(selected) : "Recent daily logs"}
        description="One signed shift note per person per shift: personal care, meals, sleep, health, plan goals, activities and behaviour."
        action={
          <div className="flex items-center gap-2">
            <form className="flex items-center gap-2">
              <input type="date" name="day" defaultValue={selected ?? dateKey()} className="field w-auto py-2" aria-label="Show logs for a day" />
              <button className="btn-ghost btn-sm">Show</button>
            </form>
            <Link href="/app/daily-logs/new" className="btn-brand btn-sm"><Plus className="h-4 w-4" /> New log</Link>
          </div>
        }
      />
      <Panel>
        {logs.length === 0 ? <Empty>No logs {selected ? "for that day" : "yet"}.</Empty> : (
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
                    {[fmt.day(log.logDate), log.shift ? `${label("shiftKind", log.shift)} shift` : null, `written ${fmt.time(log.createdAt)} by ${log.staff ?? "staff"}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Link href={`/app/daily-logs/${log.id}`} className="shrink-0 self-center text-xs font-semibold text-brand hover:text-brand-deep">Open note</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
