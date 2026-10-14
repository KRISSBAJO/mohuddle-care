import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Lock, TimerReset } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Badge, Field, PageHeader, Panel } from "@/components/app/ui";
import { SheetTotals, sheetStatus, TimesheetTable } from "@/components/clock/TimesheetTable";
import { addDays, dateKey, fmt } from "@/lib/format";
import { signTimesheet } from "@/server/actions/payroll";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { isDay, periodOn, sheetFor } from "@/server/queries/payroll";
import { getSettings } from "@/server/settings";

export const metadata = { title: "My timesheet" };

/* One pay period for the signed-in staff member, with the sign-off once the period has ended. */
export default async function MyTimesheetPage({ params }: { params: Promise<{ start: string }> }) {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  const { start } = await params;
  if (!isDay(start)) notFound();
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  const today = dateKey(new Date(now));
  const period = await periodOn(start, settings);
  if (period.start !== start) redirect(`/app/clock/timesheets/${period.start}`);
  if (period.start > today) notFound();
  const sheet = await sheetFor(user.staffId, period, settings);
  const status = sheet.sheet?.status ?? "open";
  const locked = sheet.period.status === "locked";
  const ended = period.end <= today;
  const name = sheet.member ? `${sheet.member.first} ${sheet.member.last}` : user.name;

  return (
    <div className="max-w-5xl">
      <Link href="/app/clock/timesheets" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> My timesheets
      </Link>
      <PageHeader
        eyebrow="My timesheet"
        title={`${fmt.day(period.start)} – ${fmt.day(period.end)}`}
        description={locked ? "This pay period is locked and has gone to payroll." : ended ? "This period has ended. Check your hours, then sign." : `This period ends ${fmt.dayLong(period.end)}. You can sign it on or after that day.`}
        action={
          <div className="flex gap-2">
            <Link href={`/app/clock/timesheets/${addDays(period.start, -1)}`} className="btn-ghost btn-sm" aria-label="Earlier period"><ChevronLeft className="h-4 w-4" /></Link>
            {period.end < today && <Link href={`/app/clock/timesheets/${addDays(period.end, 1)}`} className="btn-ghost btn-sm" aria-label="Later period"><ChevronRight className="h-4 w-4" /></Link>}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={sheetStatus[status].tone}>{sheetStatus[status].text}</Badge>
        {locked && <Badge tone="neutral"><Lock className="mr-1 inline h-3 w-3" />Locked</Badge>}
        {sheet.sheet?.signedAt && <span className="text-xs text-mute">Signed {fmt.dateTime(sheet.sheet.signedAt)}</span>}
        {sheet.sheet?.approvedAt && <span className="text-xs text-mute">· approved {fmt.dateTime(sheet.sheet.approvedAt)}</span>}
      </div>

      {sheet.sheet?.returnNote && status === "open" && (
        <p className="mb-5 flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-[#8a5a10]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span><span className="font-semibold">Your manager asked you to check this:</span> {sheet.sheet.returnNote}</span>
        </p>
      )}

      <SheetTotals sheet={sheet} />

      <Panel title="Punches" className="mt-6" action={<Link href="/app/clock/correction" className="inline-flex items-center gap-1 text-xs font-semibold text-brand"><TimerReset className="h-3.5 w-3.5" /> Something wrong? Fix a punch</Link>}>
        <TimesheetTable sheet={sheet} linkPunches={false} />
      </Panel>

      {!locked && ended && status === "open" && (
        <Panel title="Sign your timesheet" className="mt-6">
          <div className="p-5">
            <p className="mb-4 text-sm">I confirm these hours are correct and complete, and that I took the breaks shown.</p>
            <ActionForm action={signTimesheet.bind(null, period.start)} submitLabel="Sign timesheet">
              <Field label="Type your full name" htmlFor="sheet-sign"><input id="sheet-sign" name="signedName" required autoComplete="off" className="field" placeholder={name} /></Field>
            </ActionForm>
          </div>
        </Panel>
      )}
      {status !== "open" && (
        <p className="mt-6 flex items-center gap-2 text-sm text-sage"><CheckCircle2 className="h-4 w-4" /> Signed as “{sheet.sheet?.signedName || "—"}”. {status === "approved" ? "Approved for payroll." : "Waiting for your manager."}</p>
      )}
    </div>
  );
}
