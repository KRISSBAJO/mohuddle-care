import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PenLine, Users } from "lucide-react";
import { PrintButton } from "@/components/app/PrintButton";
import { Avatar } from "@/components/app/ui";
import { NoteReviewPanel } from "@/components/logs/NoteReviewPanel";
import { durationWords } from "@/lib/community-note";
import { fmt, initials } from "@/lib/format";
import { clockLabel } from "@/lib/log-note";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { noteReview } from "@/server/queries/note-review";
import { getSettings } from "@/server/settings";
import { communityNoteRecord } from "@/server/queries/community-notes";

export const metadata = { title: "Community Participation note" };

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line/60 py-3 sm:grid-cols-[13rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wider text-mute">{title}</dt>
      <dd className="whitespace-pre-line text-sm">{children}</dd>
    </div>
  );
}

/* One signed Community Participation note, laid out for review and printing. */
export default async function CommunityNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; edited?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { saved, edited } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [record, settings, now] = await Promise.all([communityNoteRecord(id), getSettings(), requestTime()]);
  if (!record) notFound();
  const review = await noteReview("community", id, user, settings, now);
  const { note } = record;

  return (
    <div className="max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/app/individuals/${note.individualId}?tab=logs`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> {record.first}&apos;s notes
        </Link>
        <PrintButton />
      </div>

      {saved && (
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/30 bg-sage-soft px-5 py-4 text-sm text-sage">
          <p className="font-semibold">Note signed and saved. Thank you.</p>
          <Link href={`/app/community-notes/new?individual=${note.individualId}`} className="btn-ghost btn-sm">Another for {record.first}</Link>
        </div>
      )}

      {review && <NoteReviewPanel kind="community" id={id} review={review} edited={Boolean(edited)} />}

      <div className="card p-6 sm:p-8">
        <div className="mb-4 flex items-center gap-4 border-b border-line pb-5">
          <Avatar initials={initials(record.first, record.last)} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">CP · Community Participation</p>
            <h1 className="text-2xl font-bold">
              <Link href={`/app/individuals/${note.individualId}`} className="hover:text-brand">{record.first} {record.last}</Link>
            </h1>
            {record.home && <p className="text-sm text-mute">{record.home}</p>}
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold tabular-nums">{durationWords(note.minutes)}</p>
            <p className="text-xs text-mute">billable</p>
          </div>
        </div>
        <dl>
          <Row title="Date and time">{fmt.dayLong(note.noteDate)}, {clockLabel(note.startTime)} to {clockLabel(note.endTime)}</Row>
          {note.trips !== null && <Row title="Number of trips">{note.trips}</Row>}
          {note.costCenter && <Row title="Cost center">{note.costCenter}</Row>}
          {note.otherParty && <Row title="Other responsible party">{note.otherParty}</Row>}
          {note.selection && <Row title="How the activity was selected">{note.selection}</Row>}
          <Row title="Location">{note.location}</Row>
          <Row title="Activity or action">{note.activity}</Row>
          <Row title="Note">{note.note}</Row>
          {note.learning && <Row title="Learning opportunities">{note.learning}</Row>}
        </dl>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-mute">
          <p className="flex items-center gap-1.5">
            <PenLine className="h-3.5 w-3.5" /> Electronically signed by <span className="font-semibold text-ink">{note.signedName || record.staff}</span>
            {note.signedAt ? ` on ${fmt.dateTime(note.signedAt)}` : ""}
          </p>
          {record.withStaff && <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> With {record.withStaff}</p>}
        </div>
      </div>
    </div>
  );
}
