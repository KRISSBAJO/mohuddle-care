import { AlertTriangle, CheckCircle2, CircleX, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

export type HandoverView = {
  note: string;
  people: { individualId: string; name: string; note: string }[];
  checks: { label: string; done: boolean; comment: string }[];
  incident: "none" | "reported" | "not_reported";
  staff: string | null;
  createdAt: Date | string;
  home?: string | null;
};

const when = (at: Date | string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));

/* A handover as the incoming staff read it: the note, a line per person, the ticks and any incident. */
export function HandoverCard({ handover, compact = false }: { handover: HandoverView; compact?: boolean }) {
  const missed = handover.checks.filter(check => !check.done);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-mute">
        From <span className="font-semibold text-ink">{handover.staff ?? "a staff member"}</span> · {when(handover.createdAt)}
        {handover.home ? ` · ${handover.home}` : ""}
      </p>
      {handover.incident !== "none" && (
        <p className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold", handover.incident === "reported" ? "bg-accent-soft text-[#8a5a10]" : "bg-flag-soft text-flag")}>
          <AlertTriangle className="h-3.5 w-3.5" /> {handover.incident === "reported" ? "An incident happened on this shift and was reported." : "An incident happened on this shift and was not reported yet."}
        </p>
      )}
      {handover.note && <p className="whitespace-pre-line leading-relaxed">{handover.note}</p>}
      {handover.people.length > 0 && (
        <ul className="space-y-1.5">
          {handover.people.map(person => (
            <li key={person.individualId} className="flex gap-2">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <span><span className="font-semibold">{person.name}:</span> {person.note}</span>
            </li>
          ))}
        </ul>
      )}
      {handover.checks.length > 0 && (
        <ul className={cn("grid gap-1", !compact && "sm:grid-cols-2")}>
          {handover.checks.map(check => (
            <li key={check.label} className={cn("flex gap-2 text-xs", check.done ? "text-mute" : "font-semibold text-flag")}>
              {check.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sage" /> : <CircleX className="h-3.5 w-3.5 shrink-0" />}
              <span>
                {check.label}
                {check.comment && <span className="font-normal text-ink"> · {check.comment}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {compact && missed.length === 0 && handover.checks.length > 0 && <p className="text-xs text-sage">Every handover tick was done.</p>}
    </div>
  );
}
