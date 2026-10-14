import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarOff } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { Select } from "@/components/app/Select";
import { Badge, Empty, Field, PageHeader, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { cancelTimeOff, requestTimeOff } from "@/server/actions/pay";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { leaveBalance, myTimeOff } from "@/server/queries/pay";
import { getSettings } from "@/server/settings";

export const metadata = { title: "My time off" };

const statusTone = { pending: "warn", approved: "good", declined: "bad", cancelled: "neutral" } as const;
const statusWord = { pending: "Waiting", approved: "Approved", declined: "Declined", cancelled: "Cancelled" } as const;

/* Asking for time off, the leave balance, and every request with where it stands. */
export default async function MyTimeOffPage() {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  const [settings, now] = await Promise.all([getSettings(), requestTime()]);
  const today = dateKey(new Date(now));
  const [balance, requests] = await Promise.all([leaveBalance(user.staffId), myTimeOff(user.staffId)]);
  const options = [
    ...settings.time_off_types.map(type => ({ value: type, label: type, hint: settings.time_off_balance_types.includes(type) ? "Paid, uses your balance" : "Paid", group: "Paid" })),
    ...settings.time_off_unpaid_types.map(type => ({ value: type, label: type, hint: "Unpaid", group: "Unpaid" })),
  ];

  return (
    <div className="max-w-5xl">
      <Link href="/app/clock" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> My time clock
      </Link>
      <PageHeader eyebrow="Time clock" title="My time off" description={`Ask at least ${settings.time_off_notice_days} days ahead where you can. Your manager approves it and finds cover for your shifts.`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="Ask for time off">
          <div className="p-5">
            <ActionForm action={requestTimeOff} submitLabel="Send request">
              <Field label="Type" htmlFor="off-type"><Select id="off-type" name="type" required options={options} /></Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="First day" htmlFor="off-start"><input id="off-start" name="startDate" type="date" required min={addDays(today, -30)} className="field" defaultValue={addDays(today, settings.time_off_notice_days)} /></Field>
                <Field label="Last day" htmlFor="off-end"><input id="off-end" name="endDate" type="date" required min={addDays(today, -30)} className="field" defaultValue={addDays(today, settings.time_off_notice_days)} /></Field>
                <Field label="Hours in total" htmlFor="off-hours" hint="For example 8 for one full shift."><input id="off-hours" name="hours" type="number" step="0.25" min="0.25" required className="field" defaultValue={8} /></Field>
              </div>
              <Field label="Note for your manager (optional)" htmlFor="off-reason"><input id="off-reason" name="reason" maxLength={500} className="field" placeholder="Family wedding in Memphis" /></Field>
            </ActionForm>
          </div>
        </Panel>

        <Panel title="Leave balance">
          <div className="p-5">
            <p className={cn("font-display text-2xl font-bold", balance < 0 ? "text-flag" : "text-brand")}>{hours(balance)}</p>
            <p className="text-sm text-mute">hours available</p>
            {settings.pto_accrual_hours_worked > 0 && <p className="mt-3 text-xs text-mute">You earn one hour for every {settings.pto_accrual_hours_worked} hours worked, up to {settings.pto_max_balance_hours} hours.</p>}
            <p className="mt-1 text-xs text-mute">Uses the balance: {settings.time_off_balance_types.join(", ") || "none"}.</p>
          </div>
        </Panel>
      </div>

      <Panel title="My requests" className="mt-6">
        {requests.length === 0 ? (
          <Empty>No requests yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {requests.map(request => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <CalendarOff className="h-4 w-4 text-mute" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{request.type}</span> · {request.startDate === request.endDate ? fmt.dayLong(request.startDate) : `${fmt.day(request.startDate)} – ${fmt.day(request.endDate)}`}
                  <span className="block text-xs text-mute">
                    {hours(request.minutes)} h{request.paid ? "" : ", unpaid"}
                    {request.decisionNote ? ` · Manager: ${request.decisionNote}` : ""}
                    {request.openedShifts ? ` · ${request.openedShifts} of your shifts were given to others` : ""}
                  </span>
                </span>
                <Badge tone={statusTone[request.status]}>{statusWord[request.status]}</Badge>
                {(request.status === "pending" || (request.status === "approved" && request.startDate > today)) && (
                  <ConfirmAction action={cancelTimeOff.bind(null, request.id)} label="Cancel" confirm="Cancel this request?" />
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
