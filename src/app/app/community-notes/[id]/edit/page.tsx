import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { Field, PageHeader, Panel } from "@/components/app/ui";
import { fmt } from "@/lib/format";
import { editCommunityNote } from "@/server/actions/note-review";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { communityNoteRecord } from "@/server/queries/community-notes";
import { noteReview } from "@/server/queries/note-review";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Edit Community Participation note" };

/* Editing a signed Community Participation note. Each change is recorded. */
export default async function EditCommunityNotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [record, settings, now] = await Promise.all([communityNoteRecord(id), getSettings(), requestTime()]);
  if (!record) notFound();
  const review = await noteReview("community", id, user, settings, now);
  if (!review?.rights.edit) redirect(`/app/community-notes/${id}`);
  const { note } = record;
  const writer = review.rights.writer;
  const centers = [...new Set([...settings.cp_cost_centers, note.costCenter].filter(Boolean))];
  const area = (name: "selection" | "location" | "activity" | "note" | "learning", title: string, rows: number, required = false) => (
    <Field label={title} htmlFor={`cpe-${name}`}>
      <textarea id={`cpe-${name}`} name={name} rows={rows} required={required} maxLength={name === "note" ? 5000 : 3000} defaultValue={note[name]} className="field" />
    </Field>
  );

  return (
    <div className="max-w-4xl">
      <Link href={`/app/community-notes/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the note
      </Link>
      <PageHeader
        eyebrow={`${record.first} ${record.last} · ${fmt.dayLong(note.noteDate)}`}
        title={writer ? "Fix and resubmit" : "Edit Community Participation note"}
        description={writer ? `What to fix: ${note.returnReason}` : "Every change is recorded with your name and the reason, and the writer is told."}
      />
      <Panel>
        <div className="p-5 sm:p-6">
          <ActionForm action={editCommunityNote.bind(null, id)} submitLabel={writer ? "Save and resubmit" : "Save changes"}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date" htmlFor="cpe-date"><input id="cpe-date" name="noteDate" type="date" required defaultValue={note.noteDate} className="field" /></Field>
              <Field label="Start time" htmlFor="cpe-start"><input id="cpe-start" name="startTime" type="time" required defaultValue={note.startTime} className="field" /></Field>
              <Field label="End time" htmlFor="cpe-end"><input id="cpe-end" name="endTime" type="time" required defaultValue={note.endTime} className="field" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Number of trips (optional)" htmlFor="cpe-trips"><input id="cpe-trips" name="trips" type="number" min={0} max={50} defaultValue={note.trips ?? ""} className="field" /></Field>
              {centers.length > 0 && (
                <Field label="Cost center (optional)" htmlFor="cpe-cost"><Select id="cpe-cost" name="costCenter" defaultValue={note.costCenter} options={centers.map(value => ({ value, label: value }))} emptyLabel="None" /></Field>
              )}
              <Field label="Other responsible party" htmlFor="cpe-other"><input id="cpe-other" name="otherParty" maxLength={200} defaultValue={note.otherParty} className="field" /></Field>
            </div>
            {area("selection", "How was the activity selected?", 2)}
            {area("location", "Location", 2, true)}
            {area("activity", "Activity or action", 2, true)}
            {area("note", "Note", 6, true)}
            {area("learning", "Learning opportunities", 4)}
            <Field label={writer ? "Note for the reviewer (optional)" : "Reason for the edit"} htmlFor="cpe-reason" hint={writer ? undefined : "The writer sees this."}>
              <input id="cpe-reason" name="reason" required={!writer} minLength={writer ? undefined : 5} maxLength={1000} className="field" />
            </Field>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
