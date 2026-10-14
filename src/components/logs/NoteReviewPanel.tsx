import Link from "next/link";
import { AlertTriangle, CheckCircle2, History, PencilLine, Undo2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Field } from "@/components/app/ui";
import { fmt } from "@/lib/format";
import { FLAG_WORDS, REVIEW_TONE, REVIEW_WORDS, type NoteKind } from "@/lib/note-review";
import { approveNote, reopenNote, returnNote } from "@/server/actions/note-review";
import type { noteReview } from "@/server/queries/note-review";

type Review = NonNullable<Awaited<ReturnType<typeof noteReview>>>;

const actionWords = { edited: "Edited", returned: "Sent back", resubmitted: "Fixed and resubmitted", approved: "Approved", reopened: "Reopened" } as const;

/* Where a note stands in review, what flagged it, what the viewer may do, and everything that happened since signing. */
export function NoteReviewPanel({ kind, id, review, edited }: { kind: NoteKind; id: string; review: Review; edited?: boolean }) {
  const { note, rights, events, reviewedBy } = review;
  const editHref = kind === "daily" ? `/app/daily-logs/${id}/edit` : `/app/community-notes/${id}/edit`;

  return (
    <section className="no-print mb-5 space-y-3">
      {edited && <p className="rounded-2xl border border-sage/30 bg-sage-soft px-5 py-3 text-sm font-semibold text-sage">Changes saved.{rights.writer ? " The note is back with the reviewers." : " The writer has been told."}</p>}
      {note.status === "returned" && (
        <div className="rounded-2xl border border-flag/30 bg-flag-soft px-5 py-4 text-sm">
          <p className="font-semibold text-flag">{rights.writer ? "Sent back to you to fix" : "Sent back to the writer"}</p>
          <p className="mt-1 whitespace-pre-line">{note.returnReason}</p>
          {rights.writer && rights.edit && (
            <Link href={editHref} className="btn-brand btn-sm mt-3"><PencilLine className="h-3.5 w-3.5" /> Fix and resubmit</Link>
          )}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 px-5 py-3.5">
        <Badge tone={REVIEW_TONE[note.status]}>{REVIEW_WORDS[note.status]}</Badge>
        {note.status === "approved" && reviewedBy && <span className="text-xs text-mute">by {reviewedBy.name}{reviewedBy.at ? ` on ${fmt.dateTime(reviewedBy.at)}` : ""}</span>}
        {note.flags.map(flag => (
          <span key={flag} className="chip bg-[#fdf3e1] text-[#8a5a10]"><AlertTriangle className="h-3 w-3" /> {FLAG_WORDS[flag]}</span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {rights.edit && !(rights.writer && note.status === "returned") && (
            <Link href={editHref} className="btn-ghost btn-sm"><PencilLine className="h-3.5 w-3.5" /> Edit</Link>
          )}
          {rights.returnIt && (
            <ModalForm action={returnNote.bind(null, kind, id)} title="Send back to the writer" description="They are told and can fix the note, then resubmit it." triggerLabel="Send back" triggerIcon="none" triggerTone="ghost" submitLabel="Send back">
              <Field label="What should they fix?" htmlFor="return-reason">
                <textarea id="return-reason" name="reason" rows={4} required minLength={5} maxLength={1000} className="field" placeholder="The times do not match your clock punch. Please check the finish time." />
              </Field>
            </ModalForm>
          )}
          {rights.approve && (
            <ConfirmAction action={approveNote.bind(null, kind, id)} label="Approve" tone="brand" confirm={note.flags.length ? `This note is flagged: ${note.flags.map(flag => FLAG_WORDS[flag]).join(", ")}. Approve it anyway?` : undefined} />
          )}
          {rights.reopen && <ConfirmAction action={reopenNote.bind(null, kind, id)} label="Reopen" confirm="Reopen this approved note so it can be corrected?" />}
        </div>
      </div>

      {events.length > 0 && (
        <details className="card px-5 py-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-mute"><History className="h-4 w-4" /> History ({events.length})</summary>
          <ol className="mt-3 space-y-3">
            {events.map(event => (
              <li key={event.id} className="border-l-2 border-line pl-3">
                <p className="flex flex-wrap items-center gap-1.5">
                  {event.action === "approved" ? <CheckCircle2 className="h-3.5 w-3.5 text-sage" /> : event.action === "returned" ? <Undo2 className="h-3.5 w-3.5 text-flag" /> : <PencilLine className="h-3.5 w-3.5 text-mute" />}
                  <span className="font-semibold">{actionWords[event.action]}</span>
                  <span className="text-xs text-mute">by {event.by ?? "a former user"} · {fmt.dateTime(event.at)}</span>
                </p>
                {event.note && <p className="mt-0.5 whitespace-pre-line text-mute">{event.note}</p>}
                {event.changes.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {event.changes.map((change, index) => (
                      <li key={index} className="rounded-lg bg-panel px-2.5 py-1.5">
                        <span className="font-semibold">{change.field}: </span>
                        <span className="text-flag line-through">{change.before || "(empty)"}</span> <span aria-hidden>→</span> <span className="text-sage">{change.after || "(empty)"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
