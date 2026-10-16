import Link from "next/link";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { addDays, dateKey, fmt, initials, label } from "@/lib/format";
import { ActionForm } from "@/components/app/ActionForm";
import { prnSummary } from "@/lib/medicines";
import { DoseButtons } from "@/components/app/DoseButtons";
import { givePrnAction, recordEffectAction } from "@/server/actions/hub";
import { db, schema } from "@/server/db";
import { prnFor } from "@/server/medication-round";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/server/guard";
import { openEntry } from "@/server/queries/timeclock";
import { AutoSubmitForm } from "@/components/app/AutoSubmitForm";
import { Select } from "@/components/app/Select";
import { medicationRecordForDay } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";
import { requestTime } from "@/server/clock";

export const metadata = { title: "Medications" };
const statusTone = { due: "neutral", given: "good", refused: "warn", missed: "bad", held: "plum" } as const;

export default async function MedicationsPage({ searchParams }: { searchParams: Promise<{ day?: string; home?: string }> }) {
  const user = await requireUser();
  const { day, home: asked } = await searchParams;
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dateKey();
  // One home at a time, so a large agency's day is not thousands of rows: the home asked for, else
  // where you are clocked in, else your own home, else the first home. "all" shows every home.
  const homes = await db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true)).orderBy(asc(schema.homes.name));
  const own = user.staffId ? ((await openEntry(user.staffId))?.entry.homeId ?? (await db.select({ homeId: schema.staff.homeId }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1))[0]?.homeId ?? null) : null;
  const homeId = asked === "all" ? null : homes.some(home => home.id === asked) ? asked! : ((homes.find(home => home.id === own) ?? homes[0])?.id ?? null);
  const homeParam = asked === "all" ? "all" : homeId ?? "";
  const keep = (extra: string) => `/app/medications?${[extra, homeParam ? `home=${homeParam}` : ""].filter(Boolean).join("&")}`;
  const [rows, settings] = await Promise.all([medicationRecordForDay(selected, homeId), getSettings()]);
  const now = await requestTime();
  const lateBefore = now - settings.med_late_minutes * 60_000;
  // As-needed doses are listed with their medicine below, not in the day's schedule.
  const scheduled = rows.filter(row => !row.prn);
  const given = scheduled.filter(row => row.status === "given").length;
  const people = await db.select({ id: schema.individuals.id, first: schema.individuals.firstName, last: schema.individuals.lastName, home: schema.homes.name }).from(schema.individuals).leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId)).where(and(eq(schema.individuals.active, true), homeId ? eq(schema.individuals.homeId, homeId) : undefined));
  const prn = await prnFor(people.map(person => person.id), now);

  return (
    <>
      <PageHeader
        eyebrow="Medication administration record"
        title={fmt.dayLong(selected)}
        description={`${given} of ${scheduled.length} doses recorded as given. A dose is late ${settings.med_late_minutes} minutes after its time.`}
        action={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <AutoSubmitForm className="w-56">
              {day && <input type="hidden" name="day" value={selected} />}
              <Select name="home" defaultValue={homeParam || "all"} aria-label="Home" searchable options={[{ value: "all", label: "All homes" }, ...homes.map(home => ({ value: home.id, label: home.name }))]} />
            </AutoSubmitForm>
            <Link href={keep(`day=${addDays(selected, -1)}`)} className="btn-ghost btn-sm">Previous day</Link>
            <Link href={keep("")} className="btn-ghost btn-sm">Today</Link>
            <Link href={keep(`day=${addDays(selected, 1)}`)} className="btn-ghost btn-sm">Next day</Link>
          </div>
        }
      />
      <Panel>
        {scheduled.length === 0 ? <Empty>No medications scheduled. Add medications from a person&apos;s page.</Empty> : (
          <table className="table">
            <thead><tr><th>Time</th><th>Person</th><th>Medication</th><th>Status</th><th className="w-[340px]">Record</th></tr></thead>
            <tbody>
              {scheduled.map(row => {
                const due = row.status === "due";
                const late = due && row.scheduledFor.getTime() < lateBefore;
                const upcoming = due && row.scheduledFor.getTime() > now;
                return (
                  <tr key={row.id} className={late ? "bg-flag-soft/40" : ""}>
                    <td className="whitespace-nowrap font-semibold">{fmt.time(row.scheduledFor)}{late && <Badge tone="bad" className="ml-2">Late</Badge>}</td>
                    <td>
                      <Link href={`/app/individuals/${row.individualId}`} className="flex items-center gap-2 font-semibold hover:text-brand">
                        <Avatar initials={initials(row.first, row.last)} size="sm" /> {row.first} {row.last}
                      </Link>
                      <p className="pl-9 text-xs text-mute">{row.home ?? ""}</p>
                    </td>
                    <td>
                      <p className="font-semibold">{row.medication} <span className="font-normal text-mute">{row.dose}, {row.route}</span></p>
                      {row.instructions && <p className="text-xs text-mute">{row.instructions}</p>}
                    </td>
                    <td>
                      <Badge tone={statusTone[row.status]}>{label("medStatus", row.status)}</Badge>
                      {row.recordedAt && <p className="mt-1 text-xs text-mute">{fmt.time(row.recordedAt)} · {row.staff ?? "staff"}</p>}
                      {row.note && <p className="text-xs text-mute">{row.note}</p>}
                    </td>
                    <td>
                      {due ? (
                        <DoseButtons adminId={row.id} notYet={upcoming} noteLabel={`Note for ${row.first}'s ${row.medication}`} noteClassName="w-28" />
                      ) : <span className="text-xs text-dim">Recorded</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      {prn.length > 0 && (
        <Panel title="As needed">
          <ul className="divide-y divide-line/60">
            {prn.map(med => {
              const person = people.find(item => item.id === med.individualId);
              const effectDue = (at: Date) => now - at.getTime() >= settings.prn_effect_minutes * 60_000;
              return (
                <li key={med.id} className="grid gap-4 px-5 py-4 text-sm lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="space-y-2">
                    <p>
                      <Link href={`/app/individuals/${med.individualId}`} className="font-semibold hover:text-brand">{person ? `${person.first} ${person.last}` : "Person"}</Link>
                      <span className="text-xs text-mute">{person?.home ? ` · ${person.home}` : ""}</span>
                    </p>
                    <p className="font-semibold">{med.name} <span className="font-normal text-mute">{med.dose}, {med.route}</span>{med.controlled && <Badge tone="bad" className="ml-2">Controlled</Badge>}</p>
                    <p className="text-xs font-semibold text-plum">{prnSummary(med)}</p>
                    <p className="text-xs text-mute">
                      Given {med.givenToday} {med.givenToday === 1 ? "time" : "times"} in the last 24 hours.
                      {med.nextAllowedAt ? ` Next dose allowed from ${fmt.time(med.nextAllowedAt)}.` : ""}
                    </p>
                    {med.recent.map(dose => (
                      <div key={dose.id} className="rounded-xl bg-panel/60 px-3 py-2 text-xs">
                        <p><span className="font-semibold">{fmt.time(dose.at)}</span> · {dose.by ?? "staff"} · {dose.reason}</p>
                        {dose.effect ? (
                          <p className="mt-1 text-sage">Effect: {dose.effect}</p>
                        ) : effectDue(dose.at) ? (
                          <div className="mt-2">
                            <ActionForm action={recordEffectAction.bind(null, dose.id)} submitLabel="Save effect">
                              <input name="effect" required minLength={3} maxLength={500} className="field py-1.5 text-xs" placeholder="How did it work? Pain down to 2 out of 10" aria-label="How it worked" />
                            </ActionForm>
                          </div>
                        ) : (
                          <p className="mt-1 text-mute">Ask how it worked from {fmt.time(new Date(dose.at.getTime() + settings.prn_effect_minutes * 60_000))}.</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div>
                    {med.nextAllowedAt ? (
                      <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold text-[#8a5a10]">Not allowed again until {fmt.time(med.nextAllowedAt)}.</p>
                    ) : (
                      <ActionForm action={givePrnAction.bind(null, med.id)} submitLabel="Give now">
                        <input name="reason" required minLength={3} maxLength={500} className="field" placeholder={`Why: ${med.prnUse}`} aria-label="Why it is being given" />
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
