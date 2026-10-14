import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { Field, PageHeader, Panel } from "@/components/app/ui";
import { fmt, label } from "@/lib/format";
import { MOODS, hourLabel, shiftHours } from "@/lib/log-note";
import { editDailyLog } from "@/server/actions/note-review";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { logRecord } from "@/server/queries/logs";
import { noteReview } from "@/server/queries/note-review";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Edit daily log" };

/* Editing a signed shift note: the times, place, mood and every written part. Each change is recorded. */
export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [record, settings, now] = await Promise.all([logRecord(id), getSettings(), requestTime()]);
  if (!record) notFound();
  const review = await noteReview("daily", id, user, settings, now);
  if (!review?.rights.edit) redirect(`/app/daily-logs/${id}`);
  const { log } = record;
  const writer = review.rights.writer;
  const locations = settings.log_locations.includes(log.location) || !log.location ? settings.log_locations : [log.location, ...settings.log_locations];
  const text = (name: keyof typeof log, title: string, rows = 3, hint?: string) => (
    <Field label={title} htmlFor={`edit-${name}`} hint={hint}>
      <textarea id={`edit-${name}`} name={name} rows={rows} maxLength={name === "notes" ? 5000 : 3000} defaultValue={String(log[name] ?? "")} className="field" />
    </Field>
  );

  return (
    <div className="max-w-4xl">
      <Link href={`/app/daily-logs/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the note
      </Link>
      <PageHeader
        eyebrow={`${record.first} ${record.last} · ${fmt.dayLong(log.logDate)}`}
        title={writer ? "Fix and resubmit" : "Edit shift note"}
        description={writer ? `What to fix: ${log.returnReason}` : "Every change is recorded with your name and the reason, and the writer is told. Personal care levels and goal data stay as written."}
      />
      <Panel>
        <div className="p-5 sm:p-6">
          <ActionForm action={editDailyLog.bind(null, id)} submitLabel={writer ? "Save and resubmit" : "Save changes"}>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Start time" htmlFor="edit-timeIn"><input id="edit-timeIn" name="timeIn" type="time" required={Boolean(log.timeIn)} defaultValue={log.timeIn} className="field" /></Field>
              <Field label="Finish time" htmlFor="edit-timeOut"><input id="edit-timeOut" name="timeOut" type="time" required={Boolean(log.timeOut)} defaultValue={log.timeOut} className="field" /></Field>
              <Field label="Where" htmlFor="edit-location"><Select id="edit-location" name="location" required defaultValue={log.location} options={locations.map(value => ({ value, label: value }))} /></Field>
              <Field label="Mood" htmlFor="edit-mood"><Select id="edit-mood" name="mood" required defaultValue={log.mood} options={MOODS.map(value => ({ value, label: label("mood", value) }))} /></Field>
            </div>
            {text("presentation", "Presentation", 2)}
            {log.sections.includes("meals") && text("meals", "Meals", 2)}
            {text("health", "Health", 2)}
            {log.sections.includes("activities") && text("activities", "Activities", 2)}
            {log.behaviourOccurred && (
              <div className="grid gap-4 rounded-xl border border-line p-4">
                <p className="text-sm font-semibold">Behaviour</p>
                {text("antecedent", "Before", 2)}
                {text("behaviours", "During", 3)}
                {text("intervention", "Staff response", 2)}
                {text("behaviourOutcome", "After", 2)}
              </div>
            )}
            {log.sections.includes("contacts") && (
              <div className="grid gap-4 sm:grid-cols-2">
                {text("familyContact", "Family or guardian contact", 2)}
                {text("appointments", "Appointments", 2)}
              </div>
            )}
            {text("goalProgress", "Goal progress", 2)}
            {log.sections.includes("timeline") && (
              <div className="rounded-xl border border-line">
                <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">Hourly timeline</p>
                <ol className="divide-y divide-line/60">
                  {shiftHours(log.timeIn, log.timeOut).map(hour => {
                    const entry = log.timeline.find(item => item.hour === hour);
                    return (
                      <li key={hour} className="grid gap-2 px-4 py-2 sm:grid-cols-[4.5rem_1fr] sm:items-center">
                        <label htmlFor={`edit-tl-${hour}`} className="text-sm font-semibold text-mute">{hourLabel(hour)}</label>
                        <div className="grid gap-1">
                          {entry?.meds.map(dose => <span key={dose} className="w-fit rounded-full bg-sky px-2.5 py-0.5 text-xs text-brand-deep">{dose}</span>)}
                          <input id={`edit-tl-${hour}`} name={`timeline.${hour}`} maxLength={500} defaultValue={entry?.note ?? ""} className="field py-2" />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {text("notes", "Shift summary", 5, settings.daily_log_summary_min_chars ? `At least ${settings.daily_log_summary_min_chars} characters.` : undefined)}
            <Field label={writer ? "Note for the reviewer (optional)" : "Reason for the edit"} htmlFor="edit-reason" hint={writer ? undefined : "The writer sees this."}>
              <input id="edit-reason" name="reason" required={!writer} minLength={writer ? undefined : 5} maxLength={1000} className="field" placeholder={writer ? "Corrected the finish time." : "Finish time corrected to match the clock punch."} />
            </Field>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
