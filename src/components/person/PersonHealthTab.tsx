import Link from "next/link";
import { Activity, HeartPulse, ShieldAlert, Stethoscope } from "lucide-react";
import { Badge, Empty, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, label } from "@/lib/format";
import type { schema } from "@/server/db";
import { personHealth } from "@/server/queries/person";
import { MoreLink, moodTone } from "./parts";

type Person = typeof schema.individuals.$inferSelect;
const severityTone = { low: "neutral", moderate: "warn", high: "bad", critical: "bad" } as const;

/* Health in one place: allergies and diagnoses, what staff observed, behaviour, and medication exceptions. */
export async function PersonHealthTab({ id, person, manager }: { id: string; person: Person; manager: boolean }) {
  const data = await personHealth(id);
  const base = `/app/individuals/${id}`;
  const doses = data.doseCounts;
  const total = Object.values(doses).reduce<number>((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className={cn("card p-5", person.allergies && "ring-2 ring-flag/30")}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute"><ShieldAlert className="h-4 w-4 text-flag" /> Allergies</p>
          <p className={cn("mt-2 whitespace-pre-line text-sm", person.allergies ? "font-semibold text-flag" : "text-mute")}>{person.allergies || "None known"}</p>
        </div>
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute"><Stethoscope className="h-4 w-4 text-brand" /> Diagnoses</p>
          <p className="mt-2 whitespace-pre-line text-sm">{person.diagnoses || <span className="text-mute">None recorded</span>}</p>
        </div>
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute"><Activity className="h-4 w-4 text-plum" /> Medication, last 90 days</p>
          {total === 0 ? (
            <p className="mt-2 text-sm text-mute">No doses recorded.</p>
          ) : (
            <>
              <p className="mt-2 font-display text-2xl font-bold text-sage">{Math.round(((doses.given ?? 0) / total) * 100)}% given</p>
              <p className="text-xs text-mute">
                {[["refused", doses.refused], ["held", doses.held], ["missed", doses.missed], ["not recorded", doses.due]]
                  .filter(([, n]) => n)
                  .map(([what, n]) => `${n} ${what}`)
                  .join(" · ") || "No exceptions"}
              </p>
              <MoreLink href={`${base}?tab=medications&days=28`}>See the record</MoreLink>
            </>
          )}
        </div>
      </div>
      {manager && !person.allergies && !person.diagnoses && <p className="text-xs text-mute">Coordinators add allergies and diagnoses with Edit details at the top of the page.</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Health observations from daily logs">
          {data.observations.length === 0 ? (
            <Empty>No health notes in daily logs yet.</Empty>
          ) : (
            <ol className="divide-y divide-line/60">
              {data.observations.map(note => (
                <li key={note.id} className="px-5 py-3">
                  <p className="flex items-center justify-between gap-2 text-xs font-semibold text-mute">
                    <span className="inline-flex items-center gap-1.5"><HeartPulse className="h-3.5 w-3.5 text-plum" /> {fmt.dayLong(note.day)}{note.staff ? ` · ${note.staff}` : ""}</span>
                    <Badge tone={moodTone[note.mood]}>{label("mood", note.mood)}</Badge>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{note.text}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Behaviour notes from daily logs">
          {data.behaviours.length === 0 ? (
            <Empty>No behaviour notes in daily logs yet.</Empty>
          ) : (
            <ol className="divide-y divide-line/60">
              {data.behaviours.map(note => (
                <li key={note.id} className="px-5 py-3">
                  <p className="flex items-center justify-between gap-2 text-xs font-semibold text-mute">
                    <span>{fmt.dayLong(note.day)}{note.staff ? ` · ${note.staff}` : ""}</span>
                    <Badge tone={moodTone[note.mood]}>{label("mood", note.mood)}</Badge>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{note.text}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Injuries, medication errors and behaviour incidents" action={<MoreLink href={`${base}?tab=incidents`}>All incidents</MoreLink>}>
        {data.incidents.length === 0 ? (
          <Empty>None on record.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {data.incidents.map(incident => (
              <li key={incident.id}>
                <Link href={`/app/incidents/${incident.id}`} className="block px-5 py-3 hover:bg-panel/60">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{label("incidentCategory", incident.category)}</span>
                    <Badge tone={severityTone[incident.severity]}>{label("incidentSeverity", incident.severity)}</Badge>
                    <Badge tone={incident.status === "closed" ? "good" : "warn"}>{label("incidentStatus", incident.status)}</Badge>
                    <span className="text-xs text-dim">{fmt.dateTime(incident.occurredAt)}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-mute">{incident.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
