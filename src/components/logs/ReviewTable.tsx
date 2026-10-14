"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { clockLabel } from "@/lib/log-note";
import { FLAG_WORDS, KIND_WORDS, REVIEW_WORDS, type FlagKey, type NoteKind, type ReviewStatus } from "@/lib/note-review";
import { approveNotes, type BulkState } from "@/server/actions/note-review";

export type QueueRow = {
  kind: NoteKind;
  id: string;
  personId: string;
  person: string;
  home: string | null;
  day: string;
  startTime: string;
  endTime: string;
  writer: string | null;
  status: ReviewStatus;
  flags: FlagKey[];
};

const statusClass = { submitted: "bg-[#fdf3e1] text-[#8a5a10]", returned: "bg-flag-soft text-flag", approved: "bg-sage-soft text-sage" } as const;

/* The review list: tick notes, or tick all, and approve them together. Flagged notes may be held back by the agency setting. */
export function ReviewTable({ rows, skipFlagged }: { rows: QueueRow[]; skipFlagged: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<BulkState, FormData>(async (previous, data) => {
    const result = await approveNotes(previous, data);
    if (!result.error) setPicked(new Set());
    return result;
  }, {});
  const open = rows.filter(row => row.status === "submitted");
  const eligible = skipFlagged ? open.filter(row => row.flags.length === 0) : open;
  const key = (row: QueueRow) => `${row.kind}:${row.id}`;
  const allPicked = eligible.length > 0 && eligible.every(row => picked.has(key(row)));
  const toggle = (value: string) => setPicked(current => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={allPicked} disabled={!eligible.length} onChange={() => setPicked(allPicked ? new Set() : new Set(eligible.map(key)))} className="h-4 w-4 accent-brand" />
          Select all{eligible.length ? ` (${eligible.length})` : ""}
        </label>
        {skipFlagged && open.length > eligible.length && <span className="text-xs text-mute">{open.length - eligible.length} flagged notes are approved one by one.</span>}
        <button type="submit" disabled={!picked.size || pending} className="btn-brand btn-sm ml-auto disabled:opacity-50">
          <CheckCheck className="h-4 w-4" /> {pending ? "Approving…" : picked.size ? `Approve ${picked.size} selected` : "Approve selected"}
        </button>
      </div>
      {state.error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag">{state.error}</p>}
      {state.approved !== undefined && (
        <p role="status" className="mx-4 mt-3 rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm font-medium text-sage">
          Approved {state.approved} {state.approved === 1 ? "note" : "notes"}.{state.skipped ? ` ${state.skipped} left for one-by-one review.` : ""}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10"><span className="sr-only">Select</span></th>
              <th>Person</th>
              <th>Note</th>
              <th>When</th>
              <th className="hidden md:table-cell">Written by</th>
              <th>Checks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const value = key(row);
              const canPick = eligible.includes(row);
              return (
                <tr key={value} className={cn(picked.has(value) && "bg-sky/40")}>
                  <td>
                    {row.status === "submitted" && (
                      <input type="checkbox" name="note" value={value} checked={picked.has(value)} disabled={!canPick} onChange={() => toggle(value)} aria-label={`Select the note for ${row.person} on ${fmt.day(row.day)}`} className="h-4 w-4 accent-brand disabled:opacity-40" />
                    )}
                  </td>
                  <td className="font-semibold">
                    <Link href={row.kind === "daily" ? `/app/daily-logs/${row.id}` : `/app/community-notes/${row.id}`} className="hover:text-brand">{row.person}</Link>
                    {row.home && <span className="block text-xs font-normal text-mute">{row.home}</span>}
                  </td>
                  <td className="text-sm">{KIND_WORDS[row.kind]}</td>
                  <td className="whitespace-nowrap text-sm tabular-nums">
                    {fmt.weekday(row.day)} {fmt.day(row.day)}
                    {row.startTime && <span className="block text-xs text-mute">{clockLabel(row.startTime)} to {clockLabel(row.endTime)}</span>}
                  </td>
                  <td className="hidden text-sm md:table-cell">{row.writer ?? "—"}</td>
                  <td>
                    {row.flags.length === 0 ? (
                      <span className="text-xs text-sage">Clear</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.flags.map(flag => <span key={flag} className="chip bg-[#fdf3e1] px-2 py-0.5 text-[11px] text-[#8a5a10]"><AlertTriangle className="h-3 w-3" /> {FLAG_WORDS[flag]}</span>)}
                      </span>
                    )}
                  </td>
                  <td><span className={cn("chip px-2 py-0.5 text-[11px]", statusClass[row.status])}>{REVIEW_WORDS[row.status]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
