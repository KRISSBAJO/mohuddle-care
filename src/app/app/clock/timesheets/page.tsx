import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/app/ui";
import { sheetStatus } from "@/components/clock/TimesheetTable";
import { dateKey, fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { myPeriods } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";

export const metadata = { title: "My timesheets" };

/* A staff member's recent pay periods: hours, overtime and whether each is signed and approved. */
export default async function MyTimesheetsPage() {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  const today = dateKey(new Date(now));
  const periods = await myPeriods(user.staffId, settings, today);

  return (
    <div className="max-w-4xl">
      <Link href="/app/clock" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> My time clock
      </Link>
      <PageHeader eyebrow="Time clock" title="My timesheets" description="Check your hours at the end of each pay period and sign them. Your manager then approves them for payroll." />
      <Panel>
        <ul className="divide-y divide-line/60">
          {periods.map(period => {
            const current = period.start <= today && period.end >= today;
            const status = sheetStatus[period.status as keyof typeof sheetStatus];
            const needsSigning = !current && period.status === "open" && period.totals.punches > 0 && !period.locked;
            return (
              <li key={period.start}>
                <Link href={`/app/clock/timesheets/${period.start}`} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-panel/40">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{fmt.day(period.start)} – {fmt.day(period.end)}{current && <span className="ml-2 text-xs font-normal text-brand">This period</span>}</span>
                    <span className="block text-xs text-mute">{period.totals.punches} {period.totals.punches === 1 ? "punch" : "punches"}</span>
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="block font-bold">{hours(period.totals.total)} h</span>
                    {period.totals.overtime > 0 && <span className="block text-xs text-[#8a5a10]">{hours(period.totals.overtime)} h overtime</span>}
                  </span>
                  <span className="flex w-48 justify-end gap-1.5">
                    {period.locked && <Badge tone="neutral"><Lock className="mr-1 inline h-3 w-3" />Locked</Badge>}
                    {needsSigning ? <Badge tone="bad">Sign it</Badge> : current ? <Badge tone="neutral">In progress</Badge> : period.totals.punches === 0 && period.status === "open" ? <Badge tone="neutral">No time</Badge> : <Badge tone={status.tone}>{status.text}</Badge>}
                  </span>
                  <ChevronRight className="h-4 w-4 text-mute" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
