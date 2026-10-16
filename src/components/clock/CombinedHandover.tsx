import { AlertTriangle, CheckCircle2, CircleX, UserRound } from "lucide-react";
import { zone } from "@/lib/format";
import { combineHandovers, type HandoverInput } from "@/lib/handover";

const time = (at: Date | string) => new Intl.DateTimeFormat("en-US", { timeZone: zone(), hour: "numeric", minute: "2-digit" }).format(new Date(at));

/* The handovers waiting at a home, as one: notes, people, every tick with who did it, and incidents. */
export function CombinedHandover({ handovers }: { handovers: HandoverInput[] }) {
  const combined = combineHandovers(handovers);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-mute">
        From <span className="font-semibold text-ink">{combined.from.join(", ")}</span>
      </p>
      {combined.incidents.map(incident => (
        <p key={incident.staff} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${incident.reported ? "bg-accent-soft text-[#8a5a10]" : "bg-flag-soft text-flag"}`}>
          <AlertTriangle className="h-3.5 w-3.5" /> {incident.staff}: {incident.reported ? "an incident happened and was reported." : "an incident happened and is not reported yet."}
        </p>
      ))}
      {combined.notes.map(entry => (
        <div key={entry.staff + String(entry.at)}>
          <p className="text-xs font-semibold text-mute">
            {entry.staff} · {time(entry.at)}
          </p>
          <p className="whitespace-pre-line leading-relaxed">{entry.note}</p>
        </div>
      ))}
      {combined.people.length > 0 && (
        <ul className="space-y-1.5">
          {combined.people.map(person => (
            <li key={person.name} className="flex gap-2">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <span>
                <span className="font-semibold">{person.name}:</span> {person.notes.map(note => (combined.from.length > 1 ? `${note.note} (${note.staff})` : note.note)).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {combined.checks.length > 0 && (
        <ul className="space-y-1.5">
          {combined.checks.map(check => (
            <li key={check.label} className={`flex gap-2 text-xs ${check.notDone.length ? "font-semibold text-flag" : "text-mute"}`}>
              {check.notDone.length ? <CircleX className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sage" />}
              <span>
                {check.label}
                {check.notDone.map(miss => (
                  <span key={miss.staff} className="block font-normal text-ink">
                    Not done by {miss.staff}
                    {miss.comment ? `: ${miss.comment}` : ""}
                  </span>
                ))}
                {check.notDone.length > 0 && check.done.length > 0 && <span className="block font-normal text-mute">Done by {check.done.join(", ")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
