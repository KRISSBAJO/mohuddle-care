import Link from "next/link";
import { Download } from "lucide-react";
import { Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { timeReport } from "@/server/queries/time-reports";
import type { Settings } from "@/server/settings";

const isDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/* Attendance and hours for a date range: by home and by staff member, with the EVV export. */
export async function ReportsView({ query, settings, now }: { query: Record<string, string | undefined>; settings: Settings; now: number }) {
  const today = dateKey(new Date(now));
  const to = isDay(query.to) && query.to! <= today ? query.to! : today;
  const fromRaw = isDay(query.from) || addDays(to, -27);
  const from = fromRaw > to ? to : fromRaw;
  const report = await timeReport(from, to, settings);
  const ranges: [string, string, string][] = [
    ["Last 7 days", addDays(today, -6), today],
    ["Last 4 weeks", addDays(today, -27), today],
    ["Last 3 months", addDays(today, -89), today],
  ];
  const t = report.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {ranges.map(([text, rangeFrom, rangeTo]) => (
            <Link key={text} href={`/app/time?tab=reports&from=${rangeFrom}&to=${rangeTo}`} aria-current={from === rangeFrom && to === rangeTo ? "true" : undefined} className={cn("chip", from === rangeFrom && to === rangeTo ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
              {text}
            </Link>
          ))}
          <form className="flex items-center gap-1.5">
            <input type="hidden" name="tab" value="reports" />
            <input type="date" name="from" defaultValue={from} max={today} aria-label="From" className="field w-auto py-1.5 text-xs" />
            <span className="text-xs text-mute">to</span>
            <input type="date" name="to" defaultValue={to} max={today} aria-label="To" className="field w-auto py-1.5 text-xs" />
            <button className="btn-ghost btn-sm">Show</button>
          </form>
        </div>
        <a href={`/api/time/evv?from=${from}&to=${to}`} className="btn-ghost btn-sm"><Download className="h-4 w-4" /> EVV visits (CSV)</a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {(
          [
            ["Hours worked", hours(t.minutes), ""],
            ["Overtime", hours(t.overtime), t.overtime ? "text-[#8a5a10]" : ""],
            ["Late clock-ins", `${t.late} (${pct(t.late, t.punches)})`, t.late ? "text-[#8a5a10]" : "text-sage"],
            ["No-shows", `${t.noShows} of ${t.scheduled}`, t.noShows ? "text-flag" : "text-sage"],
            ["Exceptions", `${t.exceptions} (${pct(t.exceptions, t.punches)})`, t.exceptions ? "text-[#8a5a10]" : "text-sage"],
            ["Handovers written", t.handoverRate === null ? "—" : `${t.handoverRate}%`, t.handoverRate !== null && t.handoverRate < 90 ? "text-[#8a5a10]" : "text-sage"],
          ] as const
        ).map(([title, value, tone]) => (
          <div key={title} className="card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
            <p className={cn("mt-1 font-display text-xl font-bold tabular-nums", tone)}>{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-mute">{fmt.dayLong(from)} to {fmt.dayLong(to)}. Overtime here is counted inside the range; timesheets count it per workweek and pay period.</p>

      <Panel title="By home">
        {report.homes.length === 0 ? (
          <Empty>No punches in this range.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Home</th><th className="text-right">Hours</th><th className="text-right">Punches</th><th className="text-right">Late</th><th className="text-right">No-shows</th><th className="text-right">Exceptions</th><th className="text-right">Handovers</th></tr></thead>
              <tbody>
                {report.homes.map(row => (
                  <tr key={row.homeId ?? "none"}>
                    <td className="font-semibold">{row.homeId ? <Link href={`/app/homes/${row.homeId}`} className="hover:text-brand">{row.home}</Link> : row.home}</td>
                    <td className="text-right tabular-nums">{hours(row.minutes)}</td>
                    <td className="text-right tabular-nums">{row.punches}</td>
                    <td className="text-right tabular-nums">{row.late}</td>
                    <td className={cn("text-right tabular-nums", row.noShows && "font-semibold text-flag")}>{row.noShows}</td>
                    <td className="text-right tabular-nums">{row.exceptions}</td>
                    <td className="text-right tabular-nums">{pct(row.handovers, row.punches)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="By staff member">
        {report.staff.length === 0 ? (
          <Empty>No punches in this range.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Staff</th><th className="text-right">Hours</th><th className="text-right">Overtime</th><th className="text-right">Late</th><th className="hidden text-right md:table-cell">Avg late</th><th className="text-right">No-shows</th><th className="text-right">Exceptions</th><th className="hidden text-right md:table-cell">Time off</th></tr></thead>
              <tbody>
                {report.staff.map(row => (
                  <tr key={row.staffId}>
                    <td className="font-semibold"><Link href={`/app/staff/${row.staffId}?tab=time`} className="hover:text-brand">{row.name}</Link></td>
                    <td className="text-right tabular-nums">{hours(row.minutes)}</td>
                    <td className={cn("text-right tabular-nums", row.overtime ? "font-semibold text-[#8a5a10]" : "text-dim")}>{hours(row.overtime)}</td>
                    <td className="text-right tabular-nums">{row.late}{row.punches ? <span className="text-xs text-dim"> /{row.punches}</span> : null}</td>
                    <td className="hidden text-right tabular-nums text-mute md:table-cell">{row.late ? `${Math.round(row.lateMinutes / row.late)} m` : "—"}</td>
                    <td className={cn("text-right tabular-nums", row.noShows && "font-semibold text-flag")}>{row.noShows}{row.scheduled ? <span className="text-xs font-normal text-dim"> /{row.scheduled}</span> : null}</td>
                    <td className="text-right tabular-nums">{row.exceptions}</td>
                    <td className="hidden text-right tabular-nums text-mute md:table-cell">{row.timeOff ? hours(row.timeOff) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-xs text-dim">
        The EVV file lists each punch once for every person living at the home, with the six items federal Electronic Visit Verification needs: the service, the person, the date, where, who gave it, and the start and end times. Check the column layout your EVV vendor or TennCare health plan expects before uploading.
      </p>
    </div>
  );
}
