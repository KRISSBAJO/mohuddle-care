import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, ShieldAlert } from "lucide-react";
import { PrintButton } from "@/components/app/PrintButton";
import { Avatar } from "@/components/app/ui";
import { LogNoteView } from "@/components/logs/LogNoteView";
import { initials } from "@/lib/format";
import { requireUser } from "@/server/guard";
import { logRecord } from "@/server/queries/logs";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Daily log" };

export default async function DailyLogPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [record, settings] = await Promise.all([logRecord(id), getSettings()]);
  if (!record) notFound();
  const { log } = record;
  const personHref = `/app/individuals/${log.individualId}`;

  return (
    <div className="max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`${personHref}?tab=logs`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> {record.first}&apos;s daily logs
        </Link>
        <div className="flex gap-2">
          <Link href="/app/daily-logs" className="btn-ghost btn-sm">All logs</Link>
          <PrintButton />
        </div>
      </div>

      {saved && (
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/30 bg-sage-soft px-5 py-4 text-sm text-sage">
          <p className="font-semibold">Log signed and saved. Thank you.</p>
          <div className="flex gap-2">
            <Link href={`/app/daily-logs/new?individual=${log.individualId}`} className="btn-ghost btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Another log for {record.first}</Link>
            <Link href="/app/daily-logs/new" className="btn-ghost btn-sm">Log for someone else</Link>
          </div>
        </div>
      )}

      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-4 border-b border-line pb-5">
          <Avatar initials={initials(record.first, record.last)} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Daily shift note</p>
            <h1 className="text-2xl font-bold">
              <Link href={personHref} className="hover:text-brand">{record.first} {record.last}</Link>
            </h1>
            {record.home && <p className="text-sm text-mute">{record.home}</p>}
          </div>
          {record.allergies && <p className="hidden items-center gap-1.5 rounded-lg bg-flag-soft px-3 py-1.5 text-xs font-semibold text-flag sm:flex"><ShieldAlert className="h-3.5 w-3.5" /> Allergies: {record.allergies}</p>}
        </div>
        <LogNoteView log={log} goals={record.goals} staff={record.staff} adlOrder={settings.adl_items} />
      </div>
    </div>
  );
}
