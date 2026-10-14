"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, MessageSquareText, Pencil, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { documentLink } from "@/lib/note-library";
import type { NoteItem } from "@/lib/note-requirements";

/*
 * A yes or no question on the daily note. Choosing the answer that needs more opens a pop-up: staff
 * explain it and tick the documents it needs. The other answer needs nothing more. Everything stays
 * inside the note's form, so it saves with the note.
 */
export function FollowUpQuestion({ item, chip, individualId }: { item: NoteItem; chip: string; individualId: string | null }) {
  const name = `extra.${item.id}`;
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const needsFollowUp = Boolean(item.followUpOn) && answer === item.followUpOn;
  const docs = item.followUpDocs ?? [];
  const explained = note.trim().length >= 3;

  // Switching to the other answer closes the pop-up; nothing more is needed then.
  useEffect(() => {
    if (!needsFollowUp) dialog.current?.close();
  }, [needsFollowUp]);

  const choose = (value: string) => {
    setAnswer(value);
    if (item.followUpOn && value === item.followUpOn) setTimeout(() => dialog.current?.showModal());
  };

  return (
    <div>
      <div className="flex gap-2">
        {["Yes", "No"].map(value => (
          <label key={value} className={cn(chip, "py-1.5")}>
            <input type="radio" name={name} value={value} required={item.required} checked={answer === value} onChange={() => choose(value)} className="sr-only" /> {value}
          </label>
        ))}
      </div>

      {needsFollowUp && (
        <div className={cn("mt-3 rounded-xl border px-4 py-3 text-sm", explained ? "border-line bg-panel/40" : "border-accent bg-accent-soft")}>
          {explained ? (
            <>
              <p className="flex items-start gap-2">
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 whitespace-pre-line">{note}</span>
                <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
                  <Pencil className="h-3 w-3" /> Change
                </button>
              </p>
              {docs.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {docs.map(doc => (
                    <span key={doc} className={cn("chip px-2 py-0.5 text-[11px]", done.includes(doc) ? "bg-sage-soft text-sage" : "bg-accent-soft text-[#8a5a10]")}>
                      {done.includes(doc) ? "Done" : "To do"}: {doc}
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <p className="flex flex-wrap items-center gap-2 font-semibold text-[#8a5a10]">
              <AlertTriangle className="h-4 w-4" /> You answered {answer}. Explain it before you save.
              <button type="button" onClick={() => dialog.current?.showModal()} className="btn-ghost btn-sm ml-auto">Explain</button>
            </p>
          )}
        </div>
      )}

      {/* Kept in the form even when closed, so the explanation and ticks save with the note. */}
      <input type="hidden" name={`${name}.followUp`} value={needsFollowUp ? note : ""} />
      {needsFollowUp && done.filter(doc => docs.includes(doc)).map(doc => <input key={doc} type="hidden" name={`${name}.doc`} value={doc} />)}

      <dialog
        ref={dialog}
        className="hub-dialog"
        aria-labelledby={`${item.id}-followup-title`}
        onClick={event => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="hub-dialog-body">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">You answered {answer}</p>
              <h2 id={`${item.id}-followup-title`} className="text-lg font-bold">{item.label}</h2>
            </div>
            <button type="button" className="rounded-lg p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="Close" onClick={() => dialog.current?.close()}>
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="grid gap-4 px-6 py-5">
            <div>
              <label htmlFor={`${item.id}-followup-note`} className="label">{item.followUpPrompt || "Explain your answer"}</label>
              <textarea
                id={`${item.id}-followup-note`}
                rows={4}
                maxLength={2000}
                className="field"
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Write what happened in plain words, using their name."
                autoFocus
              />
            </div>
            {docs.length > 0 && (
              <div>
                <p className="label">Documents this needs</p>
                <ul className="space-y-2">
                  {docs.map(doc => {
                    const href = documentLink(doc, individualId);
                    return (
                      <li key={doc} className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm", done.includes(doc) ? "border-sage/40 bg-sage-soft/40" : "border-line")}>
                        <FileText className="h-4 w-4 shrink-0 text-mute" />
                        <span className="min-w-0 flex-1 font-semibold">{doc}</span>
                        {href && (
                          <Link href={href} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                            Open <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                        <label className="flex items-center gap-1.5 text-xs font-semibold">
                          <input type="checkbox" checked={done.includes(doc)} onChange={event => setDone(event.target.checked ? [...done, doc] : done.filter(item => item !== doc))} /> Done
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-mute">Anything not ticked shows as still to do on the note, and your manager sees it.</p>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setAnswer("");
                  setNote("");
                  setDone([]);
                  dialog.current?.close();
                }}
              >
                Change my answer
              </button>
              <button type="button" disabled={!explained} className="btn-brand btn-sm disabled:opacity-50" onClick={() => dialog.current?.close()}>
                <CheckCircle2 className="h-4 w-4" /> Save follow-up
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
