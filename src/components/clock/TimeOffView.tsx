import Link from "next/link";
import { AlertTriangle, CalendarOff } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { addDays, daysBetween, dateKey, fmt } from "@/lib/format";
import { hours } from "@/lib/payroll";
import { decideTimeOff } from "@/server/actions/pay";
import { timeOffBoard } from "@/server/queries/pay";
import type { Settings } from "@/server/settings";

const when = (start: string, end: string) => (start === end ? fmt.dayLong(start) : `${fmt.day(start)} – ${fmt.day(end)}`);

/* Time off waiting for a decision, with the shifts it affects and the leave balance, then what is coming up. */
export async function TimeOffView({ settings, now }: { settings: Settings; now: number }) {
  const today = dateKey(new Date(now));
  const board = await timeOffBoard(today);

  return (
    <div className="space-y-6">
      <Panel title={`Waiting for a decision (${board.pending.length})`}>
        {board.pending.length === 0 ? (
          <Empty>No requests waiting.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {board.pending.map(({ request, staff, balance, shifts }) => {
              const notice = daysBetween(dateKey(request.createdAt), request.startDate);
              const short = notice < settings.time_off_notice_days && !/sick/i.test(request.type);
              const over = request.usesBalance && balance < request.minutes;
              return (
                <li key={request.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_22rem]">
                  <div className="text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/app/staff/${request.staffId}?tab=pay`} className="font-semibold hover:text-brand">{staff}</Link>
                      <Badge tone="neutral">{request.type}</Badge>
                      {!request.paid && <Badge tone="neutral">Unpaid</Badge>}
                      {short && <Badge tone="warn">Short notice: {Math.max(0, notice)} days</Badge>}
                    </p>
                    <p className="mt-1 font-semibold">{when(request.startDate, request.endDate)} · {hours(request.minutes)} h</p>
                    {request.reason && <p className="mt-1 text-mute">“{request.reason}”</p>}
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                      {request.usesBalance && <span className={over ? "font-semibold text-flag" : ""}>Balance {hours(balance)} h{over ? `, short by ${hours(request.minutes - balance)} h` : ""}</span>}
                      <span className={shifts ? "font-semibold text-[#8a5a10]" : ""}>{shifts ? `${shifts} scheduled ${shifts === 1 ? "shift" : "shifts"} on those days` : "No scheduled shifts on those days"}</span>
                      <span>Asked {fmt.dateTime(request.createdAt)}</span>
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <ActionForm action={decideTimeOff.bind(null, request.id, true)} submitLabel="Approve">
                      {shifts > 0 && (
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="openShifts" defaultChecked /> Put their {shifts} {shifts === 1 ? "shift" : "shifts"} on the open shift list
                        </label>
                      )}
                      {over && (
                        <label className="flex items-center gap-2 text-sm text-flag">
                          <input type="checkbox" name="allowNegative" /> Allow going below zero
                        </label>
                      )}
                      <input name="note" maxLength={500} className="field py-2 text-sm" placeholder="Note to them (optional)" aria-label="Approval note" />
                    </ActionForm>
                    <ActionForm action={decideTimeOff.bind(null, request.id, false)} submitLabel="Decline">
                      <input name="note" maxLength={500} className="field py-2 text-sm" placeholder="Why it is declined" aria-label="Reason for declining" />
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={`Coming up (${board.upcoming.length})`}>
          {board.upcoming.length === 0 ? (
            <Empty>Nobody is off in the coming days.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {board.upcoming.map(({ request, staff }) => (
                <li key={request.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <CalendarOff className="h-4 w-4 shrink-0 text-plum" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{staff}</span> · {request.type}
                    <span className="block text-xs text-mute">{when(request.startDate, request.endDate)} · {hours(request.minutes)} h{request.startDate <= today ? " · off now" : request.startDate <= addDays(today, 7) ? " · this week" : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recently decided">
          {board.recent.length === 0 ? (
            <Empty>Nothing decided in the last 60 days.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {board.recent.map(({ request, staff }) => (
                <li key={request.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{staff}</span> · {request.type} · {when(request.startDate, request.endDate)}
                    {request.decisionNote && <span className="block truncate text-xs text-mute">{request.decisionNote}</span>}
                  </span>
                  <Badge tone={request.status === "approved" ? "good" : request.status === "declined" ? "bad" : "neutral"}>{request.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="flex items-center gap-2 text-xs text-dim"><AlertTriangle className="h-3.5 w-3.5" /> Types, notice and leave earning are set in Settings, Time off.</p>
    </div>
  );
}
