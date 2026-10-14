import Link from "next/link";
import { Avatar, Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { addDays, dateKey, fmt, initials, label } from "@/lib/format";
import { recordMedication } from "@/server/actions/hub";
import { requireUser } from "@/server/guard";
import { medicationRecordForDay } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";
import { requestTime } from "@/server/clock";

export const metadata = { title: "Medications" };
const statusTone = { due: "neutral", given: "good", refused: "warn", missed: "bad", held: "plum" } as const;

export default async function MedicationsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireUser();
  const { day } = await searchParams;
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dateKey();
  const [rows, settings] = await Promise.all([medicationRecordForDay(selected), getSettings()]);
  const now = await requestTime();
  const lateBefore = now - settings.med_late_minutes * 60_000;
  const given = rows.filter(row => row.status === "given").length;

  return (
    <>
      <PageHeader
        eyebrow="Medication administration record"
        title={fmt.dayLong(selected)}
        description={`${given} of ${rows.length} doses recorded as given. A dose is late ${settings.med_late_minutes} minutes after its time.`}
        action={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/app/medications?day=${addDays(selected, -1)}`} className="btn-ghost btn-sm">Previous day</Link>
            <Link href="/app/medications" className="btn-ghost btn-sm">Today</Link>
            <Link href={`/app/medications?day=${addDays(selected, 1)}`} className="btn-ghost btn-sm">Next day</Link>
          </div>
        }
      />
      <Panel>
        {rows.length === 0 ? <Empty>No medications scheduled. Add medications from a person&apos;s page.</Empty> : (
          <table className="table">
            <thead><tr><th>Time</th><th>Person</th><th>Medication</th><th>Status</th><th className="w-[340px]">Record</th></tr></thead>
            <tbody>
              {rows.map(row => {
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
                        <form className="flex flex-wrap items-center gap-1.5">
                          <input name="note" placeholder="Note" className="field w-28 py-1.5 text-xs" aria-label="Note" />
                          <button formAction={recordMedication.bind(null, row.id, "given")} className="btn-brand btn-sm" disabled={upcoming} title={upcoming ? "Not yet due" : undefined}>Given</button>
                          <button formAction={recordMedication.bind(null, row.id, "refused")} className="btn-ghost btn-sm">Refused</button>
                          <button formAction={recordMedication.bind(null, row.id, "held")} className="btn-ghost btn-sm">Held</button>
                          <button formAction={recordMedication.bind(null, row.id, "missed")} className="btn-ghost btn-sm text-flag">Missed</button>
                        </form>
                      ) : <span className="text-xs text-dim">Recorded</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
