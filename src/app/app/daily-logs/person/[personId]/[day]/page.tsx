import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, ClipboardList, Clock, Pill, Printer, Stethoscope } from "lucide-react";
import { eq } from "drizzle-orm";
import { PrintButton } from "@/components/app/PrintButton";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { Crumbs, DaySquare, coverageStyle } from "@/components/logs/LogBrowserParts";
import { LogNoteView } from "@/components/logs/LogNoteView";
import { cn } from "@/lib/cn";
import { addDays, dateKey, fmt, label } from "@/lib/format";
import { coverage } from "@/lib/log-browser";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";
import { isUuid, personDay } from "@/server/queries/log-browser";
import { getSettings } from "@/server/settings";

export const metadata = { title: "A day of daily logs" };

const doseTone = { given: "good", refused: "warn", missed: "bad", held: "neutral", due: "neutral" } as const;

/* Level four: everything about one person on one day: each shift note in full, who worked, medication and anything else that happened. */
export default async function PersonDayPage({ params }: { params: Promise<{ personId: string; day: string }> }) {
  await requireUser();
  const { personId, day } = await params;
  if (!isUuid(personId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) notFound();
  const today = dateKey();
  if (day > today) notFound();
  const [person] = await db
    .select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, homeId: schema.individuals.homeId, active: schema.individuals.active, allergies: schema.individuals.allergies, home: schema.homes.name })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(eq(schema.individuals.id, personId))
    .limit(1);
  if (!person) notFound();
  const [data, settings] = await Promise.all([personDay(person, day), getSettings()]);

  const base = `/app/daily-logs/person/${person.id}`;
  const expected = data.shifts.length;
  const matched = data.shifts.filter(shift => shift.logId).length;
  const open = data.shifts.some(shift => !shift.logId && shift.state !== "overdue");
  const state = coverage(expected, expected ? matched : data.logs.length, open);
  const given = data.doses.filter(dose => dose.status === "given").length;

  return (
    <>
      <div className="no-print">
        <Crumbs
          items={[
            ["Daily logs", "/app/daily-logs"],
            [person.home ?? "Not in one of our homes", `/app/daily-logs/home/${person.homeId ?? "none"}`],
            [`${person.first} ${person.last}`, base],
            [fmt.day(day), null],
          ]}
        />
      </div>
      <PageHeader
        eyebrow={`${person.first} ${person.last}${person.home ? ` · ${person.home}` : ""}`}
        title={fmt.dayLong(day)}
        description={`${data.logs.length} ${data.logs.length === 1 ? "note" : "notes"} written${expected ? `, ${matched} of ${expected} owed from shifts worked` : ""}.`}
        action={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Link href={`${base}/${addDays(day, -1)}`} className="btn-ghost btn-sm" aria-label="Day before"><ChevronLeft className="h-4 w-4" /> {fmt.day(addDays(day, -1))}</Link>
            {day < today ? (
              <Link href={`${base}/${addDays(day, 1)}`} className="btn-ghost btn-sm" aria-label="Day after">{fmt.day(addDays(day, 1))} <ChevronRight className="h-4 w-4" /></Link>
            ) : (
              <span className="btn-ghost btn-sm opacity-40" aria-hidden="true">Today</span>
            )}
            <PrintButton />
          </div>
        }
      />

      <div className={cn("mb-5 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-3", state === "complete" ? "border-sage/30 bg-sage-soft" : state === "missing" || state === "partial" ? "border-flag/30 bg-flag-soft/60" : "border-line bg-panel")}>
        <DaySquare day={day} state={state} matched={matched} expected={expected} notes={data.logs.length} />
        <p className={cn("text-sm font-semibold", coverageStyle[state].text)}>{coverageStyle[state].word}</p>
        {person.allergies && <span className="ml-auto rounded-lg bg-flag-soft px-3 py-1 text-xs font-semibold text-flag">Allergies: {person.allergies}</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {data.logs.length === 0 ? (
            <Panel>
              <Empty>No notes were written for {person.first} on this day.</Empty>
              {person.active && day === today && (
                <p className="no-print pb-5 text-center">
                  <Link href={`/app/daily-logs/new?individual=${person.id}`} className="btn-brand btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Write today&apos;s log</Link>
                </p>
              )}
            </Panel>
          ) : (
            data.logs.map(({ log, staff }) => (
              <article key={log.id} className="card break-inside-avoid p-5 sm:p-6">
                <LogNoteView log={log} goals={data.goals.get(log.id) ?? []} staff={staff} adlOrder={settings.adl_items} />
                <p className="no-print mt-4 flex justify-end gap-3 border-t border-line pt-3 text-xs">
                  <Link href={`/app/daily-logs/${log.id}`} className="inline-flex items-center gap-1 font-semibold text-brand"><Printer className="h-3.5 w-3.5" /> Open this note alone</Link>
                </p>
              </article>
            ))
          )}
        </div>

        <aside className="space-y-5">
          <Panel title="Shifts worked">
            {data.shifts.length === 0 ? (
              <Empty>{person.homeId ? "No shifts were worked at their home." : "Not in one of our homes, so no shifts are scheduled."}</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {data.shifts.map(shift => (
                  <li key={shift.shiftId} className="flex items-start gap-3 px-5 py-3 text-sm">
                    {shift.logId ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                    ) : shift.state === "overdue" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flag" />
                    ) : (
                      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/staff/${shift.staffId}`} className="font-semibold hover:text-brand">{shift.staff}</Link>
                      <p className="text-xs text-mute">{shift.pattern} · {fmt.time(shift.startsAt)}–{fmt.time(shift.endsAt)}</p>
                    </div>
                    {shift.logId ? (
                      <Link href={`/app/daily-logs/${shift.logId}`} className="text-xs font-semibold text-sage">Written</Link>
                    ) : (
                      <span className={cn("text-xs font-semibold", shift.state === "overdue" ? "text-flag" : "text-brand")}>{shift.state === "overdue" ? "Overdue" : shift.state === "due" ? `Due ${fmt.time(shift.dueBy)}` : "On shift"}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Medication${data.doses.length ? ` · ${given} of ${data.doses.length} given` : ""}`} action={<Link href={`/app/individuals/${person.id}?tab=medications`} className="text-xs font-semibold text-brand">Record</Link>}>
            {data.doses.length === 0 ? (
              <Empty>No doses were due.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {data.doses.map(dose => (
                  <li key={dose.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-mute">{fmt.time(dose.scheduledFor)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold"><Pill className="h-3.5 w-3.5 text-plum" /> {dose.medication}</span>
                      <span className="block truncate text-xs text-mute">{dose.dose} {dose.route}{dose.staff ? ` · ${dose.staff}` : ""}{dose.note ? ` · ${dose.note}` : ""}</span>
                    </span>
                    <Badge tone={doseTone[dose.status as keyof typeof doseTone] ?? "neutral"}>{label("medStatus", dose.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.appointments.length > 0 && (
            <Panel title="Appointments">
              <ul className="divide-y divide-line/60">
                {data.appointments.map(a => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <Link href={`/app/appointments/${a.id}`} className="flex items-center gap-2 font-semibold hover:text-brand"><Stethoscope className="h-4 w-4 text-brand" /> {a.type}</Link>
                    <p className="text-xs text-mute">{fmt.time(a.scheduledAt)}{a.provider ? ` · ${a.provider}` : ""} · {a.status}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {data.incidents.length > 0 && (
            <Panel title="Incidents">
              <ul className="divide-y divide-line/60">
                {data.incidents.map(incident => (
                  <li key={incident.id} className="px-5 py-3 text-sm">
                    <Link href={`/app/incidents/${incident.id}`} className="flex items-center gap-2 font-semibold hover:text-brand"><AlertTriangle className="h-4 w-4 text-flag" /> {label("incidentCategory", incident.category)}</Link>
                    <p className="flex items-center gap-1.5 text-xs text-mute"><Clock className="h-3 w-3" /> {fmt.time(incident.occurredAt)} · {label("incidentSeverity", incident.severity)} · {label("incidentStatus", incident.status)}</p>
                    <p className="mt-1 line-clamp-2 text-xs">{incident.description}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
