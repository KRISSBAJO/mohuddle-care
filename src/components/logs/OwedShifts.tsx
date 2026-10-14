import Link from "next/link";
import { CheckCircle2, Circle, Clock, PenLine } from "lucide-react";
import { Avatar, Badge, Empty } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, initials } from "@/lib/format";
import { compactRange } from "@/lib/schedule";
import type { OwedShift } from "@/server/queries/notes-owed";

const stateBadge = {
  in_progress: { tone: "brand", text: "Shift in progress" },
  due: { tone: "warn", text: "Due" },
  overdue: { tone: "bad", text: "Overdue" },
} as const;

/*
 * One card per shift worked: who worked it, and a tick or a gap for every person living there.
 * The person who worked the shift gets a Write button on each missing note.
 */
export function OwedShifts({ shifts, myStaffId, showComplete = true, empty }: { shifts: OwedShift[]; myStaffId: string | null; showComplete?: boolean; empty: string }) {
  const list = showComplete ? shifts : shifts.filter(shift => shift.people.some(person => !person.logId));
  if (!list.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-line/60">
      {list.map(shift => {
        const done = shift.people.filter(person => person.logId).length;
        const complete = done === shift.people.length;
        const mine = shift.staffId === myStaffId;
        const badge = complete ? null : stateBadge[shift.state];
        return (
          <li key={shift.shiftId} className={cn("px-5 py-4", !complete && shift.state === "overdue" && "bg-flag-soft/30")}>
            <div className="flex flex-wrap items-start gap-3">
              <Avatar initials={initials(shift.staff.split(" ")[0] ?? "", shift.staff.split(" ").at(-1) ?? "")} size="sm" tone={complete ? "good" : shift.state === "overdue" ? "bad" : "brand"} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/app/staff/${shift.staffId}`} className="font-semibold hover:text-brand">{mine ? "You" : shift.staff}</Link>
                  <span className="text-mute">
                    {shift.pattern} · {compactRange({ startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() })} · {shift.home}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-mute">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmt.weekday(shift.day)} {fmt.day(shift.day)}</span>
                  {complete ? <Badge tone="good">All notes written</Badge> : badge && <Badge tone={badge.tone}>{badge.text}{shift.state !== "in_progress" && ` · by ${fmt.dateTime(shift.dueBy)}`}</Badge>}
                  <span>{done} of {shift.people.length} notes</span>
                </p>
              </div>
            </div>
            {shift.people.length === 0 ? (
              <p className="mt-2 pl-10 text-xs text-mute">Nobody lives here, so no notes are owed.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
                {shift.people.map(person =>
                  person.logId ? (
                    <Link key={person.id} href={`/app/daily-logs/${person.logId}`} className="chip bg-sage-soft px-2.5 py-1 text-sage hover:bg-sage/20">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {person.name}
                    </Link>
                  ) : mine ? (
                    <Link key={person.id} href={`/app/daily-logs/new?shift=${shift.shiftId}&individual=${person.id}`} className="chip border border-brand/40 bg-white px-2.5 py-1 text-brand hover:bg-sky">
                      <PenLine className="h-3.5 w-3.5" /> Write for {person.name.split(" ")[0]}
                    </Link>
                  ) : (
                    <span key={person.id} className={cn("chip px-2.5 py-1", shift.state === "overdue" ? "bg-flag-soft text-flag" : "bg-panel text-mute")}>
                      <Circle className="h-3.5 w-3.5" /> {person.name}
                    </span>
                  ),
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
