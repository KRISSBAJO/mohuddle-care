import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Lock, LockOpen } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { sheetStatus } from "@/components/clock/TimesheetTable";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { approveSigned, lockPeriod, unlockPeriod } from "@/server/actions/payroll";
import { isDay, periodOn, periodOverview } from "@/server/queries/payroll";
import type { Settings } from "@/server/settings";

/* The manager's view of one pay period: everyone's hours, where each timesheet stands, then lock and export. */
export async function TimesheetsView({ requested, settings, now, admin }: { requested?: string; settings: Settings; now: number; admin: boolean }) {
  const today = dateKey(new Date(now));
  // By default, the most recent period that has ended: that is the one waiting for payroll.
  let period = await periodOn(isDay(requested) ? requested : addDays(today, -1), settings);
  if (!isDay(requested) && period.end >= today) period = await periodOn(addDays(period.start, -1), settings);
  const overview = await periodOverview(period, settings);
  const row = overview.period;
  const locked = row.status === "locked";
  const ended = period.end < today;
  const waiting = overview.rows.filter(item => item.sheet?.status !== "approved").length;
  const base = "/app/time?tab=timesheets&period=";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href={`${base}${addDays(period.start, -1)}`} className="btn-ghost btn-sm px-2" aria-label="Earlier period"><ChevronLeft className="h-4 w-4" /></Link>
          <div>
            <p className="text-lg font-bold">{fmt.day(period.start)} – {fmt.day(period.end)}, {period.end.slice(0, 4)}</p>
            <p className="text-xs text-mute">{locked ? `Locked ${row.lockedAt ? fmt.dateTime(row.lockedAt) : ""}` : ended ? "Ended, not locked" : "In progress"}{row.exportedAt ? ` · exported ${fmt.dateTime(row.exportedAt)}` : ""}</p>
          </div>
          {period.end < today && <Link href={`${base}${addDays(period.end, 1)}`} className="btn-ghost btn-sm px-2" aria-label="Later period"><ChevronRight className="h-4 w-4" /></Link>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/time/export?period=${period.start}`} className={cn("btn-sm", locked ? "btn-brand" : "btn-ghost")}>
            <Download className="h-4 w-4" /> {locked ? "Payroll file (CSV)" : "Draft payroll file"}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(
          [
            ["Staff", String(overview.rows.length), ""],
            ["Total hours", hours(overview.totals.total), ""],
            ["Overtime", hours(overview.totals.overtime), overview.totals.overtime ? "text-[#8a5a10]" : ""],
            ["Approved", `${overview.approved} / ${overview.rows.length}`, overview.approved === overview.rows.length && overview.rows.length ? "text-sage" : ""],
            ["Still open or flagged", `${overview.totals.open} / ${overview.unreviewed}`, overview.totals.open ? "text-flag" : overview.unreviewed ? "text-[#8a5a10]" : "text-sage"],
          ] as const
        ).map(([title, value, tone]) => (
          <div key={title} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
            <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone)}>{value}</p>
          </div>
        ))}
      </div>

      <Panel
        title="Timesheets"
        action={
          !locked && overview.signed > 0 ? (
            <ConfirmAction action={approveSigned.bind(null, row.id)} label={`Approve all ${overview.signed} signed`} confirm={`Approve the ${overview.signed} signed timesheets?`} />
          ) : undefined
        }
      >
        {overview.rows.length === 0 ? (
          <Empty>Nobody clocked any time in this period.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th className="text-right">Regular</th>
                  <th className="text-right">Overtime</th>
                  <th className="text-right">Total</th>
                  <th className="hidden text-right md:table-cell">Holiday</th>
                  <th>Status</th>
                  <th className="hidden lg:table-cell">Needs attention</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows.map(item => {
                  const status = item.sheet?.status ?? "open";
                  return (
                    <tr key={item.id} className="group hover:bg-panel/50">
                      <td>
                        <Link href={`/app/time/sheets/${period.start}/${item.id}`} className="font-semibold group-hover:text-brand">{item.last}, {item.first}</Link>
                        {item.employeeNumber && <span className="block text-xs text-dim">No. {item.employeeNumber}</span>}
                      </td>
                      <td className="text-right tabular-nums">{hours(item.totals.regular)}</td>
                      <td className={cn("text-right tabular-nums", item.totals.overtime ? "font-semibold text-[#8a5a10]" : "text-dim")}>{hours(item.totals.overtime)}</td>
                      <td className="text-right font-semibold tabular-nums">{hours(item.totals.total)}</td>
                      <td className="hidden text-right tabular-nums text-mute md:table-cell">{item.totals.holiday ? hours(item.totals.holiday) : "—"}</td>
                      <td><Badge tone={sheetStatus[status].tone}>{status === "signed" ? "Signed" : sheetStatus[status].text}</Badge></td>
                      <td className="hidden lg:table-cell">
                        <span className="flex flex-wrap gap-1">
                          {item.totals.open > 0 && <Badge tone="bad">{item.totals.open} open</Badge>}
                          {item.unreviewed > 0 && <Badge tone="warn">{item.unreviewed} flagged</Badge>}
                          {item.totals.adjustments !== 0 && <Badge tone="neutral">Adjusted</Badge>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {!locked && ended && (
        <Panel title="Lock this pay period">
          <div className="p-5">
            <p className="mb-4 text-sm text-mute">
              Locking stops any change to punches in this period. Fixes found later go into the next period as adjustments. Lock it once every timesheet is approved, then download the payroll file.
            </p>
            {overview.totals.open > 0 && <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-flag"><AlertTriangle className="h-4 w-4" /> Close the {overview.totals.open} open {overview.totals.open === 1 ? "punch" : "punches"} first.</p>}
            <ActionForm action={lockPeriod.bind(null, row.id)} submitLabel="Lock pay period">
              {waiting > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="anyway" /> Lock anyway: {waiting} {waiting === 1 ? "timesheet is" : "timesheets are"} not approved
                </label>
              )}
            </ActionForm>
          </div>
        </Panel>
      )}
      {locked && (
        <p className="flex items-center gap-2 text-sm text-mute">
          <Lock className="h-4 w-4" /> Locked. Punches in this period cannot change.
        </p>
      )}
      {locked && admin && (
        <Panel title="Unlock (administrators)">
          <div className="p-5">
            <ActionForm action={unlockPeriod.bind(null, row.id)} submitLabel="Unlock">
              <Field label="Why it needs unlocking" htmlFor="unlock-reason"><input id="unlock-reason" name="reason" required minLength={5} maxLength={500} className="field" placeholder="Payroll found a missing shift before paying" /></Field>
              <p className="flex items-center gap-1.5 text-xs text-mute"><LockOpen className="h-3.5 w-3.5" /> The reason is kept in the audit log.</p>
            </ActionForm>
          </div>
        </Panel>
      )}
    </div>
  );
}
