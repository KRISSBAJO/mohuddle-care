import { CalendarOff, DollarSign, Lock } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { dateKey, fmt } from "@/lib/format";
import { dollars, rateOn } from "@/lib/pay";
import { hours } from "@/lib/payroll";
import { addPayRate, adjustLeave, removePayRate } from "@/server/actions/pay";
import { leaveBalance, ledgerFor, myTimeOff, ratesFor } from "@/server/queries/pay";

const statusTone = { pending: "warn", approved: "good", declined: "bad", cancelled: "neutral" } as const;
const kindWords = { accrual: "Earned", used: "Used", adjustment: "Set by hand" } as const;

/* Pay rate history (administrators only) and the leave balance with every change to it. */
export async function StaffPayTab({ staffId, first, admin }: { staffId: string; first: string; admin: boolean }) {
  const today = dateKey();
  const [rates, balance, ledger, requests] = await Promise.all([admin ? ratesFor([staffId]) : Promise.resolve([]), leaveBalance(staffId), ledgerFor(staffId), myTimeOff(staffId)]);
  const current = rateOn(rates.map(rate => ({ effectiveFrom: rate.effectiveFrom, centsPerHour: rate.centsPerHour })), today);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {admin ? (
        <Panel title="Pay rate" action={<span className="flex items-center gap-1 text-xs text-mute"><Lock className="h-3 w-3" /> Administrators only</span>}>
          <div className="border-b border-line p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Now</p>
            <p className="mt-0.5 font-display text-xl font-bold">{current !== null ? `${dollars(current)}/h` : "Not set"}</p>
            {current === null && <p className="text-xs text-flag">Timesheets cannot estimate pay until a rate is set.</p>}
          </div>
          {rates.length > 0 && (
            <ul className="divide-y divide-line/60">
              {rates.map(rate => (
                <li key={rate.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <DollarSign className="h-4 w-4 text-mute" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{dollars(rate.centsPerHour)}/h</span> from {fmt.day(rate.effectiveFrom)}
                    {rate.effectiveFrom > today && <Badge tone="neutral" className="ml-2">Future</Badge>}
                    {rate.note && <span className="block text-xs text-mute">{rate.note}</span>}
                  </span>
                  <ConfirmAction action={removePayRate.bind(null, rate.id)} label="Remove" confirm="Remove this rate? Pay estimates for those dates change." />
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-5">
            <ActionForm action={addPayRate.bind(null, staffId)} submitLabel="Add rate">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Hourly rate ($)" htmlFor="rate"><input id="rate" name="rate" type="number" step="0.01" min="0.01" required className="field" placeholder="16.50" /></Field>
                <Field label="From" htmlFor="rate-from"><input id="rate-from" name="effectiveFrom" type="date" required className="field" defaultValue={today} /></Field>
              </div>
              <Field label="Note (optional)" htmlFor="rate-note"><input id="rate-note" name="note" maxLength={300} className="field" placeholder="Annual raise" /></Field>
            </ActionForm>
            <p className="mt-2 text-xs text-mute">A new rate starts on its date; older periods keep the rate they had.</p>
          </div>
        </Panel>
      ) : (
        <Panel title="Pay rate">
          <p className="flex items-center gap-2 p-5 text-sm text-mute"><Lock className="h-4 w-4" /> Pay rates are visible to administrators only.</p>
        </Panel>
      )}

      <div className="space-y-6">
        <Panel title="Leave balance">
          <div className="border-b border-line p-5">
            <p className={cn("font-display text-3xl font-bold", balance < 0 ? "text-flag" : "")}>{hours(balance)} h</p>
            <p className="text-xs text-mute">Earned when pay periods are locked, used when time off is approved.</p>
          </div>
          {ledger.length === 0 ? (
            <Empty>No leave earned or used yet.</Empty>
          ) : (
            <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto">
              {ledger.map(({ entry, by }) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-16 shrink-0 text-xs text-mute">{fmt.day(entry.onDate)}</span>
                  <span className="min-w-0 flex-1 truncate">{kindWords[entry.kind]}{entry.note ? ` · ${entry.note}` : ""}{by && entry.kind === "adjustment" ? ` · ${by}` : ""}</span>
                  <span className={cn("tabular-nums font-semibold", entry.minutes < 0 ? "text-flag" : "text-sage")}>{entry.minutes > 0 ? "+" : ""}{hours(entry.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-5">
            <ActionForm action={adjustLeave.bind(null, staffId)} submitLabel="Change balance">
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <Field label="Hours" htmlFor="leave-hours"><input id="leave-hours" name="hours" type="number" step="0.25" required className="field" placeholder="40" /></Field>
                <Field label="Why" htmlFor="leave-note"><input id="leave-note" name="note" required minLength={3} maxLength={300} className="field" placeholder="Opening balance carried over" /></Field>
              </div>
            </ActionForm>
          </div>
        </Panel>

        <Panel title={`Time off requests (${requests.length})`}>
          {requests.length === 0 ? (
            <Empty>{first} has not asked for time off.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {requests.map(request => (
                <li key={request.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <CalendarOff className="h-4 w-4 text-mute" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{request.type}</span> · {request.startDate === request.endDate ? fmt.day(request.startDate) : `${fmt.day(request.startDate)} – ${fmt.day(request.endDate)}`}
                    <span className="block text-xs text-mute">{hours(request.minutes)} h{request.paid ? "" : " unpaid"}{request.reason ? ` · ${request.reason}` : ""}</span>
                  </span>
                  <Badge tone={statusTone[request.status]}>{request.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
