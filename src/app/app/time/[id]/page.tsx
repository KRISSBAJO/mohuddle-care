import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Coffee, ExternalLink, History, LogIn, LogOut, MapPin, ScrollText, ShieldCheck } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Badge, Field, PageHeader, Panel } from "@/components/app/ui";
import { HandoverCard } from "@/components/clock/HandoverCard";
import { cn } from "@/lib/cn";
import { dateKey, fmt, zone } from "@/lib/format";
import { flagLabel, formatMinutes, workedMinutes } from "@/lib/timeclock";
import { fixEntryTimes, reviewEntry } from "@/server/actions/timeclock";
import { requestTime } from "@/server/clock";
import { requireManager } from "@/server/guard";
import { lockedOn } from "@/server/queries/payroll";
import { entryDetail, isUuid } from "@/server/queries/timeclock";

export const metadata = { title: "Punch" };

const clock = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
const locationWords = { ok: "At the home", outside: "Away from the home", unavailable: "No location", home_not_set: "Home has no map location", not_checked: "Not checked" } as const;

function Where({ state, distance, latitude, longitude, accuracy }: { state: keyof typeof locationWords; distance: number | null; latitude: number | null; longitude: number | null; accuracy: number | null }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <Badge tone={state === "ok" ? "good" : state === "outside" || state === "unavailable" ? "bad" : "neutral"}>{locationWords[state]}</Badge>
      {distance !== null && <span className="text-mute">about {distance} m away{accuracy ? `, accurate to ${accuracy} m` : ""}</span>}
      {latitude !== null && longitude !== null && (
        <a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand">
          Map <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}

/* One punch in full: the timeline, where they were, what they handed over, and every change made to it. */
export default async function TimeEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [detail, now] = await Promise.all([entryDetail(id), requestTime()]);
  if (!detail) notFound();
  const { entry } = detail;
  const locked = await lockedOn(dateKey(entry.clockInAt));
  const worked = workedMinutes(entry.clockInAt, entry.clockOutAt, detail.breaks, now);
  const open = !entry.clockOutAt;
  const reference = entry.clockOutAt ?? new Date(now);

  return (
    <div className="max-w-6xl">
      <Link href="/app/time" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Time &amp; attendance
      </Link>
      <PageHeader
        eyebrow={detail.home ?? "No home"}
        title={`${detail.staff} · ${fmt.dayLong(dateKey(entry.clockInAt))}`}
        description={`${fmt.time(entry.clockInAt)} to ${entry.clockOutAt ? fmt.time(entry.clockOutAt) : "now"} · ${formatMinutes(worked)} worked${detail.shiftStart ? ` · scheduled ${detail.pattern ?? "shift"} ${fmt.time(detail.shiftStart)}–${fmt.time(detail.shiftEnd)}` : " · no scheduled shift"}`}
        action={<Link href={`/app/staff/${entry.staffId}`} className="btn-ghost btn-sm">Staff page</Link>}
      />

      {entry.flags.length > 0 && (
        <div className={cn("mb-5 flex flex-wrap items-center gap-2 rounded-2xl border px-5 py-3 text-sm", entry.reviewedAt ? "border-line bg-panel" : "border-accent bg-accent-soft")}>
          <AlertTriangle className="h-4 w-4 text-[#8a5a10]" />
          {entry.flags.map(flag => <Badge key={flag} tone="warn">{flagLabel(flag)}</Badge>)}
          {entry.reviewedAt && <span className="ml-auto flex items-center gap-1 text-xs text-sage"><CheckCircle2 className="h-3.5 w-3.5" /> Reviewed by {detail.reviewer ?? "a manager"} {fmt.dateTime(entry.reviewedAt)}</span>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Panel title="Timeline">
            <ol className="relative space-y-5 p-5 before:absolute before:bottom-6 before:left-[29px] before:top-6 before:w-px before:bg-line">
              <li className="relative flex gap-4">
                <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage text-white"><LogIn className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">Clocked in {fmt.time(entry.clockInAt)}{entry.lateMinutes > 0 && <span className="ml-2 text-[#8a5a10]">{entry.lateMinutes} minutes late</span>}</p>
                  <Where state={entry.inLocation} distance={entry.inDistance} latitude={entry.inLatitude} longitude={entry.inLongitude} accuracy={entry.inAccuracy} />
                  {entry.inNote && <p className="mt-1 whitespace-pre-line text-mute">“{entry.inNote}”</p>}
                  {entry.statements.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-mute">
                      {entry.statements.map(statement => <li key={statement} className="flex gap-1.5"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sage" /> {statement}</li>)}
                    </ul>
                  )}
                </div>
              </li>
              {detail.breaks.map(item => (
                <li key={item.id} className="relative flex gap-4">
                  <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-ink"><Coffee className="h-3.5 w-3.5" /></span>
                  <p className="text-sm">
                    <span className="font-semibold">{item.kind === "meal" ? "Meal break (unpaid)" : "Rest break (paid)"}</span> {fmt.time(item.startAt)} – {item.endAt ? fmt.time(item.endAt) : "still on it"}
                    {item.endAt && <span className="text-mute"> · {formatMinutes(Math.round((item.endAt.getTime() - item.startAt.getTime()) / 60_000))}</span>}
                  </p>
                </li>
              ))}
              <li className="relative flex gap-4">
                <span className={cn("z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", open ? "bg-panel text-mute" : "bg-ink text-white")}><LogOut className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 text-sm">
                  {open ? (
                    <p className="font-semibold text-sage">Still on the clock</p>
                  ) : (
                    <>
                      <p className="font-semibold">Clocked out {fmt.time(entry.clockOutAt)}{entry.closedBy === "manager" && <span className="ml-2 font-normal text-mute">closed by a manager</span>}</p>
                      {entry.closedBy === "staff" && <Where state={entry.outLocation} distance={entry.outDistance} latitude={entry.outLatitude} longitude={entry.outLongitude} accuracy={entry.outAccuracy} />}
                      {entry.overstayReason && <p className="mt-1 text-mute">Stayed late: “{entry.overstayReason}”</p>}
                      {entry.warnings.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs font-semibold text-[#8a5a10]">
                          {entry.warnings.map(warning => <li key={warning}>Left undone: {warning}</li>)}
                        </ul>
                      )}
                      {entry.attestedName && <p className="mt-1 text-xs text-mute">Signed “{entry.attestedName}”</p>}
                    </>
                  )}
                </div>
              </li>
            </ol>
          </Panel>

          <Panel title="Handover they wrote">
            {detail.handover ? (
              <div className="p-5"><HandoverCard handover={{ ...detail.handover, staff: detail.staff, home: detail.home }} /></div>
            ) : (
              <p className="px-5 py-4 text-sm text-mute">{open ? "Written when they clock out." : "No handover was written."}</p>
            )}
          </Panel>

          {detail.reads.length > 0 && (
            <Panel title="Handovers they acknowledged before clocking in">
              <ul className="divide-y divide-line/60">
                {detail.reads.map(read => (
                  <li key={read.handoverId} className="flex gap-3 px-5 py-3 text-sm">
                    <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                    <span className="min-w-0">
                      <span className="font-semibold">From {read.writer ?? "a staff member"}</span> <span className="text-xs text-mute">read {fmt.time(read.readAt)}</span>
                      <span className="block truncate text-mute">{read.note}</span>
                      {read.remark && <span className="mt-1 block rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs text-[#8a5a10]">Their remark: {read.remark}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-6">
          {locked ? (
            <Panel title="Locked for payroll">
              <p className="p-5 text-sm text-mute">
                This punch is in the pay period {fmt.day(locked.start)} – {fmt.day(locked.end)}, which is locked. To fix the hours, add an adjustment to {detail.staffFirst}&apos;s timesheet in the current period.
              </p>
            </Panel>
          ) : (
          <Panel title={open ? "Close this clock-out" : "Change the times"}>
            <div className="p-5">
              <p className="mb-4 text-xs text-mute">{open ? "For a forgotten clock-out. Use the time you know they left. They are told." : "The original times are kept in the history below. They are told."}</p>
              <ActionForm action={fixEntryTimes.bind(null, entry.id)} submitLabel={open ? "Close it" : "Save new times"}>
                {!open && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="In, day" htmlFor="fix-in-day"><input id="fix-in-day" name="inDay" type="date" required className="field" defaultValue={dateKey(entry.clockInAt)} /></Field>
                    <Field label="In, time" htmlFor="fix-in-time"><input id="fix-in-time" name="inTime" type="time" required className="field" defaultValue={clock(entry.clockInAt)} /></Field>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Out, day" htmlFor="fix-out-day"><input id="fix-out-day" name="outDay" type="date" required className="field" defaultValue={dateKey(open && detail.shiftEnd && detail.shiftEnd.getTime() < now ? detail.shiftEnd : reference)} /></Field>
                  <Field label="Out, time" htmlFor="fix-out-time"><input id="fix-out-time" name="outTime" type="time" required className="field" defaultValue={clock(open && detail.shiftEnd && detail.shiftEnd.getTime() < now ? detail.shiftEnd : reference)} /></Field>
                </div>
                <Field label="Reason" htmlFor="fix-reason"><textarea id="fix-reason" name="reason" rows={3} required minLength={5} maxLength={1000} className="field" placeholder={open ? "Confirmed with the night staff that she left at 3:05" : "Phone clock was wrong; checked against the handover"} /></Field>
              </ActionForm>
            </div>
          </Panel>
          )}

          {entry.flags.length > 0 && !entry.reviewedAt && (
            <Panel title="Mark as reviewed">
              <div className="p-5">
                <ActionForm action={reviewEntry.bind(null, entry.id)} submitLabel="Mark reviewed">
                  <Field label="Note (optional)" htmlFor="review-note"><input id="review-note" name="note" maxLength={1000} className="field" placeholder="Spoke with Jamal; he was picking up Tasha" /></Field>
                </ActionForm>
              </div>
            </Panel>
          )}

          <Panel title="History" action={<History className="h-4 w-4 text-mute" />}>
            <ol className="divide-y divide-line/60 text-sm">
              <li className="px-5 py-3">
                <p className="font-semibold">Punched by {detail.staffFirst}</p>
                <p className="text-xs text-mute">{fmt.dateTime(entry.createdAt)}{entry.userAgent ? ` · ${entry.userAgent.includes("Mobile") ? "phone" : "computer"}` : ""}</p>
              </li>
              {detail.changes.map(({ change, by }) => (
                <li key={change.id} className="px-5 py-3">
                  <p className="font-semibold capitalize">{change.action} by {by ?? "a manager"}</p>
                  <p className="text-xs text-mute">{fmt.dateTime(change.createdAt)}</p>
                  {(change.before.clockInAt !== undefined || change.after.clockInAt !== undefined) && (
                    <p className="mt-1 text-xs">
                      {change.before.clockInAt ? <span className="text-mute line-through">{fmt.time(new Date(change.before.clockInAt))}–{change.before.clockOutAt ? fmt.time(new Date(change.before.clockOutAt)) : "open"}</span> : null}
                      {change.after.clockInAt && <span className="ml-2 font-semibold">{fmt.time(new Date(change.after.clockInAt))}–{change.after.clockOutAt ? fmt.time(new Date(change.after.clockOutAt)) : "open"}</span>}
                    </p>
                  )}
                  {change.reason && <p className="mt-1 text-xs">“{change.reason}”</p>}
                </li>
              ))}
            </ol>
          </Panel>
          <p className="flex items-center gap-1.5 text-xs text-dim"><MapPin className="h-3.5 w-3.5" /> Locations are read only at clock in and clock out.</p>
        </aside>
      </div>
    </div>
  );
}
