import Link from "next/link";
import { CalendarClock, MapPin, Pill, Repeat, UserRound } from "lucide-react";
import { Badge, Empty } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { followUpState, visitState, VISIT_STATE } from "@/lib/appointments";
import { dateKey, fmt } from "@/lib/format";
type Row = {
  id: string;
  individualId: string;
  type: string;
  provider: string;
  clinic: string;
  scheduledAt: Date;
  status: "scheduled" | "completed" | "cancelled" | "missed";
  statusReason: string;
  documentedAt: Date | null;
  followUpNeeded: boolean;
  followUpBy: string | null;
  nextAppointmentId: string | null;
  medicationChanges: string;
  first: string;
  last: string;
  home: string | null;
  escort: string | null;
};

/* A list of appointments with a date block, who, what, who goes, and where it stands. */
export function AppointmentList({ rows, now, documentHours, showPerson = true, empty }: { rows: Row[]; now: number; documentHours: number; showPerson?: boolean; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const today = dateKey(new Date(now));
  return (
    <ul className="divide-y divide-line/60">
      {rows.map(row => {
        const state = visitState(row, now, documentHours, today, dateKey);
        const follow = followUpState(row, today);
        const badge = VISIT_STATE[state];
        return (
          <li key={row.id}>
            <Link href={`/app/appointments/${row.id}`} className="flex gap-4 px-5 py-3.5 hover:bg-panel/50">
              <span className={cn("grid w-14 shrink-0 place-items-center rounded-xl py-1.5 text-center", state === "today" ? "bg-plum-soft text-plum" : state === "upcoming" ? "bg-sky text-brand-deep" : "bg-panel text-mute")}>
                <span className="text-[10px] font-semibold uppercase">{fmt.weekday(dateKey(row.scheduledAt))}</span>
                <span className="font-display text-lg font-bold leading-none">{Number(dateKey(row.scheduledAt).slice(8))}</span>
                <span className="text-[10px]">{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(new Date(`${dateKey(row.scheduledAt)}T12:00:00Z`))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.type}{row.provider ? ` · ${row.provider}` : ""}</span>
                  <Badge tone={badge.tone}>{badge.text}</Badge>
                  {follow === "to_book" && <Badge tone="warn"><Repeat className="h-3 w-3" /> Follow-up to book</Badge>}
                  {follow === "overdue" && <Badge tone="bad"><Repeat className="h-3 w-3" /> Follow-up overdue</Badge>}
                  {row.medicationChanges && <Badge tone="plum"><Pill className="h-3 w-3" /> Medication change</Badge>}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mute">
                  {showPerson && <span className="font-semibold text-ink">{row.first} {row.last}{row.home ? ` · ${row.home}` : ""}</span>}
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmt.time(row.scheduledAt)}</span>
                  {row.clinic && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row.clinic}</span>}
                  <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{row.escort ?? "No escort yet"}</span>
                </span>
                {row.statusReason && (row.status === "cancelled" || row.status === "missed") && <span className="mt-0.5 block text-xs text-mute">{row.statusReason}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
