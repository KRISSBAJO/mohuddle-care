import Link from "next/link";
import { AlertTriangle, CalendarHeart } from "lucide-react";
import { Badge, Empty } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { flagLabel, formatMinutes } from "@/lib/timeclock";
import type { StaffSheet } from "@/server/queries/payroll";

export const sheetStatus = {
  open: { text: "Not signed", tone: "neutral" },
  signed: { text: "Signed, waiting for approval", tone: "warn" },
  approved: { text: "Approved", tone: "good" },
} as const;

/* The figures across the top of a timesheet. */
export function SheetTotals({ sheet }: { sheet: StaffSheet }) {
  const { totals } = sheet;
  const cells: [string, string, string][] = [
    ["Regular", hours(totals.regular), ""],
    ["Overtime", hours(totals.overtime), totals.overtime ? "text-[#8a5a10]" : ""],
    ["Total", hours(totals.total), "text-brand"],
    ["Holiday worked", hours(totals.holiday), ""],
    ...(totals.timeOff ? [["Paid time off", hours(totals.timeOff), "text-plum"] as [string, string, string]] : []),
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-3", totals.timeOff ? "sm:grid-cols-5" : "sm:grid-cols-4")}>
      {cells.map(([title, value, tone]) => (
        <div key={title} className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
          <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone)}>{value}</p>
          <p className="text-xs text-mute">hours</p>
        </div>
      ))}
    </div>
  );
}

/* Each punch in the period with its regular and overtime minutes, then any adjustments. */
export function TimesheetTable({ sheet, linkPunches }: { sheet: StaffSheet; linkPunches: boolean }) {
  if (!sheet.lines.length && !sheet.adjustments.length) return <Empty>No time in this pay period.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Day</th>
            <th className="hidden md:table-cell">Home</th>
            <th>In – out</th>
            <th className="hidden text-right sm:table-cell">Meal</th>
            <th className="text-right">Worked</th>
            <th className="text-right">Regular</th>
            <th className="text-right">Overtime</th>
            <th className="hidden lg:table-cell">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sheet.lines.map(line => {
            const info = sheet.flags[line.id];
            return (
              <tr key={line.id} className={cn(line.open && "bg-flag-soft/30")}>
                <td className="whitespace-nowrap font-semibold">
                  {linkPunches ? <Link href={`/app/time/${line.id}`} className="hover:text-brand">{fmt.day(line.day)}</Link> : fmt.day(line.day)}
                  {line.holiday && <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-plum"><CalendarHeart className="h-3 w-3" /> {line.holiday}</span>}
                </td>
                <td className="hidden text-mute md:table-cell">{line.home ?? "—"}</td>
                <td className="whitespace-nowrap">{fmt.time(line.clockInAt)} – {line.clockOutAt ? fmt.time(line.clockOutAt) : <Badge tone="bad">Still open</Badge>}</td>
                <td className="hidden text-right tabular-nums text-mute sm:table-cell">{line.mealMinutes ? formatMinutes(line.mealMinutes) : "—"}</td>
                <td className="text-right tabular-nums">{line.open ? "—" : hours(line.minutes)}</td>
                <td className="text-right tabular-nums">{line.open ? "—" : hours(line.regular)}</td>
                <td className={cn("text-right tabular-nums", line.overtime ? "font-semibold text-[#8a5a10]" : "text-dim")}>{line.open ? "—" : hours(line.overtime)}</td>
                <td className="hidden lg:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {info?.flags.map(flag => <Badge key={flag} tone={info.reviewed || ["edited", "corrected", "late"].includes(flag) ? "neutral" : "warn"}>{flagLabel(flag)}</Badge>)}
                  </span>
                </td>
              </tr>
            );
          })}
          {sheet.adjustments.map(({ adjustment, by }) => (
            <tr key={adjustment.id} className="bg-sky/30">
              <td className="font-semibold">Adjustment{adjustment.relatesTo && <span className="block text-xs font-normal text-mute">for {fmt.day(adjustment.relatesTo)}</span>}</td>
              <td className="hidden md:table-cell" />
              <td className="text-xs text-mute" colSpan={2}>{adjustment.reason} · {by ?? "a manager"}</td>
              <td className="text-right tabular-nums">{adjustment.minutes > 0 ? "+" : ""}{hours(adjustment.minutes)}</td>
              <td className="text-right tabular-nums">{adjustment.overtime ? "—" : hours(adjustment.minutes)}</td>
              <td className="text-right tabular-nums">{adjustment.overtime ? hours(adjustment.minutes) : "—"}</td>
              <td className="hidden lg:table-cell" />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={4} className="hidden sm:table-cell">Total</td>
            <td className="sm:hidden" colSpan={2}>Total</td>
            <td className="text-right tabular-nums">{hours(sheet.totals.total)}</td>
            <td className="text-right tabular-nums">{hours(sheet.totals.regular)}</td>
            <td className="text-right tabular-nums">{hours(sheet.totals.overtime)}</td>
            <td className="hidden lg:table-cell" />
          </tr>
        </tfoot>
      </table>
      {sheet.totals.open > 0 && (
        <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-sm font-semibold text-flag">
          <AlertTriangle className="h-4 w-4" /> {sheet.totals.open} {sheet.totals.open === 1 ? "punch is" : "punches are"} still open and not counted.
        </p>
      )}
      {sheet.byHome.length > 1 && (
        <p className="border-t border-line px-5 py-3 text-xs text-mute">By home: {sheet.byHome.map(row => `${row.home} ${hours(row.minutes)} h`).join(" · ")}</p>
      )}
    </div>
  );
}
