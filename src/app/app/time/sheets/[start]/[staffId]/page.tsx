import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { Badge, Field, PageHeader, Panel } from "@/components/app/ui";
import { SheetTotals, sheetStatus, TimesheetTable } from "@/components/clock/TimesheetTable";
import { dateKey, fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { addAdjustment, approveTimesheet, removeAdjustment, returnTimesheet } from "@/server/actions/payroll";
import { requestTime } from "@/server/clock";
import { requireManager } from "@/server/guard";
import { isDay, periodOn, sheetFor } from "@/server/queries/payroll";
import { isUuid } from "@/server/queries/timeclock";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Timesheet" };

/* One person's timesheet for a manager: check it, adjust it, approve it or send it back. */
export default async function StaffTimesheetPage({ params }: { params: Promise<{ start: string; staffId: string }> }) {
  await requireManager();
  const { start, staffId } = await params;
  if (!isDay(start) || !isUuid(staffId)) notFound();
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  const period = await periodOn(start, settings);
  const sheet = await sheetFor(staffId, period, settings);
  if (!sheet.member) notFound();
  const status = sheet.sheet?.status ?? "open";
  const locked = sheet.period.status === "locked";
  const name = `${sheet.member.first} ${sheet.member.last}`;
  const ended = period.end < dateKey(new Date(now));

  return (
    <div className="max-w-6xl">
      <Link href={`/app/time?tab=timesheets&period=${period.start}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Timesheets for {fmt.day(period.start)} – {fmt.day(period.end)}
      </Link>
      <PageHeader
        eyebrow={`Timesheet · ${fmt.day(period.start)} – ${fmt.day(period.end)}`}
        title={name}
        description={sheet.member.employeeNumber ? `Employee number ${sheet.member.employeeNumber}` : undefined}
        action={<Link href={`/app/staff/${staffId}?tab=time`} className="btn-ghost btn-sm">Staff page</Link>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={sheetStatus[status].tone}>{sheetStatus[status].text}</Badge>
        {locked && <Badge tone="neutral"><Lock className="mr-1 inline h-3 w-3" />Locked</Badge>}
        {sheet.sheet?.signedAt && <span className="text-xs text-mute">Signed “{sheet.sheet.signedName}” {fmt.dateTime(sheet.sheet.signedAt)}</span>}
        {sheet.sheet?.approvedAt && <span className="text-xs text-mute">· approved {fmt.dateTime(sheet.sheet.approvedAt)}{sheet.sheet.approvalNote ? ` (${sheet.sheet.approvalNote})` : ""}</span>}
      </div>

      {sheet.sheet?.signedTotals && sheet.sheet.signedTotals.total !== sheet.totals.total && status !== "open" && (
        <p className="mb-5 flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-[#8a5a10]">
          <AlertTriangle className="h-4 w-4" /> Hours changed after they signed: {hours(sheet.sheet.signedTotals.total)} h then, {hours(sheet.totals.total)} h now.
        </p>
      )}
      {sheet.unreviewed > 0 && (
        <p className="mb-5 flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-[#8a5a10]">
          <AlertTriangle className="h-4 w-4" /> {sheet.unreviewed} flagged {sheet.unreviewed === 1 ? "punch has" : "punches have"} not been reviewed. Open {sheet.unreviewed === 1 ? "it" : "them"} from the table below.
        </p>
      )}

      <SheetTotals sheet={sheet} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Punches">
          <TimesheetTable sheet={sheet} linkPunches />
        </Panel>

        <aside className="space-y-6">
          {!locked && status !== "approved" && (
            <Panel title="Approve">
              <div className="p-5">
                {status !== "signed" && <p className="mb-3 text-xs text-mute">{name} has not signed this{ended ? "" : " yet; the period has not ended"}. Approving anyway needs a note.</p>}
                <ActionForm action={approveTimesheet.bind(null, sheet.period.id, staffId)} submitLabel="Approve timesheet">
                  <Field label={status === "signed" ? "Note (optional)" : "Why approve without their signature"} htmlFor="approve-note">
                    <input id="approve-note" name="note" maxLength={1000} className="field" placeholder={status === "signed" ? "" : "Away on leave; hours checked against the schedule"} />
                  </Field>
                </ActionForm>
              </div>
            </Panel>
          )}
          {!locked && status !== "open" && (
            <Panel title="Send it back">
              <div className="p-5">
                <ActionForm action={returnTimesheet.bind(null, sheet.period.id, staffId)} submitLabel="Send back">
                  <Field label="What they need to check" htmlFor="return-note"><input id="return-note" name="note" required minLength={5} maxLength={1000} className="field" placeholder="Tuesday has no clock-out; ask for a correction" /></Field>
                </ActionForm>
              </div>
            </Panel>
          )}
          {status === "approved" && <p className="flex items-center gap-2 text-sm text-sage"><CheckCircle2 className="h-4 w-4" /> Approved for payroll.</p>}

          {!locked ? (
            <Panel title="Adjust hours">
              <div className="p-5">
                <p className="mb-3 text-xs text-mute">For time that is not a punch, such as a fix for a locked period or training paid off the clock. Use a minus number to take hours away.</p>
                <ActionForm action={addAdjustment.bind(null, sheet.period.id, staffId)} submitLabel="Add adjustment">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Hours" htmlFor="adj-hours"><input id="adj-hours" name="hours" type="number" step="0.25" min={-80} max={80} required className="field" placeholder="1.5" /></Field>
                    <Field label="For day (optional)" htmlFor="adj-day"><input id="adj-day" name="relatesTo" type="date" className="field" /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overtime" /> Count as overtime hours</label>
                  <Field label="Reason" htmlFor="adj-reason"><input id="adj-reason" name="reason" required minLength={5} maxLength={500} className="field" placeholder="Missed clock-out on Oct 3, period already locked" /></Field>
                </ActionForm>
                {sheet.adjustments.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                    {sheet.adjustments.map(({ adjustment }) => (
                      <li key={adjustment.id} className="flex items-start gap-2">
                        <span className="min-w-0 flex-1"><span className="font-semibold">{adjustment.minutes > 0 ? "+" : ""}{hours(adjustment.minutes)} h{adjustment.overtime ? " overtime" : ""}</span> · {adjustment.reason}</span>
                        <ConfirmAction action={removeAdjustment.bind(null, adjustment.id)} label="Remove" confirm="Remove this adjustment?" className="shrink-0" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          ) : (
            <p className="flex items-center gap-2 text-sm text-mute"><Lock className="h-4 w-4" /> Locked. Adjust hours in the current period instead.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
