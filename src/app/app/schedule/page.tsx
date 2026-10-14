import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Badge, Field, PageHeader, Panel } from "@/components/app/ui";
import { addDays, dateKey, fmt, label, labels, weekStart } from "@/lib/format";
import { assignShift, createShift, setShiftStatus } from "@/server/actions/hub";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listHomes, listStaff, shiftsForWeek } from "@/server/queries/hub";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Schedule" };
const kindTone = { day: "brand", evening: "plum", overnight: "neutral" } as const;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const manager = canManage(user);
  const { week } = await searchParams;
  const today = dateKey();
  const start = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [homes, staff, shifts, settings] = await Promise.all([listHomes(), listStaff(), shiftsForWeek(start), getSettings()]);
  const open = shifts.filter(shift => !shift.staffId).length;

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title={`Week of ${fmt.day(start)}`}
        description={`${shifts.length} shifts across ${homes.length} homes. ${open ? `${open} still need someone.` : "Every shift is covered."} Minimum ${settings.shift_coverage_minimum} staff per home per shift.`}
        action={
          <div className="flex gap-2">
            <Link href={`/app/schedule?week=${addDays(start, -7)}`} className="btn-ghost btn-sm">Previous</Link>
            <Link href="/app/schedule" className="btn-ghost btn-sm">This week</Link>
            <Link href={`/app/schedule?week=${addDays(start, 7)}`} className="btn-ghost btn-sm">Next</Link>
          </div>
        }
      />

      <div className="space-y-6">
        {homes.map(home => (
          <Panel key={home.id} title={home.name}>
            <div className="grid grid-cols-1 divide-y divide-line/60 md:grid-cols-7 md:divide-x md:divide-y-0">
              {days.map(day => {
                const dayShifts = shifts.filter(shift => shift.homeId === home.id && dateKey(shift.startsAt) === day);
                const shortKinds = home.type === "day_program" ? ["day"] : ["day", "evening", "overnight"];
                const short = shortKinds.some(kind => dayShifts.filter(shift => shift.kind === kind && shift.staffId && shift.status !== "missed").length < settings.shift_coverage_minimum);
                return (
                  <div key={day} className={`min-h-[120px] p-3 ${day === today ? "bg-sky/30" : ""}`}>
                    <p className="flex items-center justify-between text-xs font-semibold text-mute">
                      <span>{fmt.weekday(day)} {fmt.day(day)}</span>
                      {short && <span className="text-flag" title="Below minimum coverage">!</span>}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {dayShifts.map(shift => (
                        <li key={shift.id} className={`rounded-lg border px-2 py-1.5 text-xs ${shift.staffId ? "border-line bg-white" : "border-flag/40 bg-flag-soft/50"}`}>
                          <div className="flex items-center justify-between gap-1">
                            <Badge tone={kindTone[shift.kind]} className="px-1.5 py-0.5 text-[10px]">{label("shiftKind", shift.kind)}</Badge>
                            {shift.status !== "scheduled" && <span className="text-[10px] text-mute">{label("shiftStatus", shift.status)}</span>}
                          </div>
                          {manager ? (
                            <form action={assignShift.bind(null, shift.id)} className="mt-1">
                              <select name="staffId" defaultValue={shift.staffId ?? ""} className="field w-full px-1.5 py-1 text-xs" aria-label="Assign staff">
                                <option value="">Open</option>
                                {staff.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName[0]}.</option>)}
                              </select>
                              <button className="mt-1 w-full rounded-md bg-panel py-1 text-[11px] font-semibold text-mute hover:bg-raise">Save</button>
                            </form>
                          ) : (
                            <p className="mt-1 font-semibold">{shift.staffFirst ? `${shift.staffFirst} ${shift.staffLast}` : "Open"}</p>
                          )}
                          {shift.staffId === user.staffId && shift.status === "scheduled" && (
                            <form action={setShiftStatus.bind(null, shift.id, "confirmed")} className="mt-1"><button className="w-full rounded-md bg-sage-soft py-1 text-[11px] font-semibold text-sage">Confirm I&apos;m on</button></form>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>

      {manager && (
        <Panel title="Add a shift" className="mt-6 max-w-2xl">
          <div className="p-5">
            <ActionForm action={createShift} submitLabel="Add shift">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Home" htmlFor="shift-home">
                  <select id="shift-home" name="homeId" required className="field">{homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}</select>
                </Field>
                <Field label="Day" htmlFor="shift-day"><input id="shift-day" name="day" type="date" required className="field" defaultValue={today} /></Field>
                <Field label="Shift" htmlFor="shift-kind">
                  <select id="shift-kind" name="kind" className="field">{Object.entries(labels.shiftKind).map(([value, text]) => <option key={value} value={value}>{text} ({value === "day" ? "7am to 3pm" : value === "evening" ? "3pm to 11pm" : "11pm to 7am"})</option>)}</select>
                </Field>
                <Field label="Staff" htmlFor="shift-staff">
                  <select id="shift-staff" name="staffId" className="field" defaultValue="">
                    <option value="">Leave open</option>
                    {staff.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Note" htmlFor="shift-note"><input id="shift-note" name="note" className="field" placeholder="Optional" /></Field>
            </ActionForm>
          </div>
        </Panel>
      )}
      {!manager && <p className="mt-6 text-xs text-mute"><CalendarPlus className="mr-1 inline h-3.5 w-3.5" /> Coordinators add and assign shifts. Confirm yours so the office knows you are on.</p>}
    </>
  );
}
