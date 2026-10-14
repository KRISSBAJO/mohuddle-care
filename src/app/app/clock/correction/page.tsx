import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { Field, PageHeader } from "@/components/app/ui";
import { dateKey, fmt } from "@/lib/format";
import { requestCorrection } from "@/server/actions/timeclock";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import { staffTime } from "@/server/queries/timeclock";

export const metadata = { title: "Fix a punch" };

const clock = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

/* Asking a manager to fix a punch: a wrong time on an existing one, or a whole shift that was never clocked. */
export default async function CorrectionPage({ searchParams }: { searchParams: Promise<{ entry?: string }> }) {
  const user = await requireUser();
  if (!user.staffId) redirect("/app/clock");
  const { entry: entryParam } = await searchParams;
  const now = await requestTime();
  const [history, homes] = await Promise.all([staffTime(user.staffId, now), listHomes()]);
  const entry = history.rows.find(row => row.id === entryParam) ?? null;
  const today = dateKey(new Date(now));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/clock" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> My time clock
      </Link>
      <PageHeader eyebrow="Time clock" title="Fix a punch" description="Your manager checks the request against the schedule and notes, then approves or declines it. You are told either way." />

      {!entry && history.rows.length > 0 && (
        <div className="card mb-5 p-5">
          <p className="mb-2 text-sm font-semibold">Is it one of these?</p>
          <ul className="flex flex-wrap gap-2">
            {history.rows.slice(0, 10).map(row => (
              <li key={row.id}>
                <Link href={`/app/clock/correction?entry=${row.id}`} className="chip bg-panel text-mute hover:text-ink">
                  {fmt.day(row.clockInAt)} {fmt.time(row.clockInAt)}–{row.clockOutAt ? fmt.time(row.clockOutAt) : "now"}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mute">Or fill in the form below for a shift you did not clock at all.</p>
        </div>
      )}

      <ActionForm action={requestCorrection} submitLabel="Send to my manager" className="card space-y-4 p-6">
        {entry ? (
          <>
            <input type="hidden" name="entryId" value={entry.id} />
            <p className="rounded-xl bg-panel px-4 py-3 text-sm">
              Fixing your punch on <span className="font-semibold">{fmt.dayLong(dateKey(entry.clockInAt))}</span> at {entry.home ?? "no home"}: {fmt.time(entry.clockInAt)} to {entry.clockOutAt ? fmt.time(entry.clockOutAt) : "still open"}.{" "}
              <Link href="/app/clock/correction" className="font-semibold text-brand">Choose another</Link>
            </p>
          </>
        ) : (
          <Field label="Home" htmlFor="fix-home">
            <Select id="fix-home" name="homeId" required searchable defaultValue="" options={homes.map(home => ({ value: home.id, label: home.name }))} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Day you started" htmlFor="fix-day"><input id="fix-day" name="day" type="date" required max={today} className="field" defaultValue={entry ? dateKey(entry.clockInAt) : today} /></Field>
          <Field label="Actual start" htmlFor="fix-start"><input id="fix-start" name="start" type="time" required className="field" defaultValue={entry ? clock(entry.clockInAt) : ""} /></Field>
          <Field label="Actual end" htmlFor="fix-end" hint="Earlier than the start means the next day."><input id="fix-end" name="end" type="time" required className="field" defaultValue={entry?.clockOutAt ? clock(entry.clockOutAt) : ""} /></Field>
        </div>
        <Field label="What happened" htmlFor="fix-reason" hint="For example: my phone died at 3pm so I could not clock out. Jamal can confirm I left at 3:10.">
          <textarea id="fix-reason" name="reason" rows={4} required minLength={10} maxLength={1000} className="field" />
        </Field>
      </ActionForm>
    </div>
  );
}
