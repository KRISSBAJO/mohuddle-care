"use client";

import { startTransition, useActionState, useEffect, useId, useRef } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { FormState } from "@/server/actions/auth";
import { cn } from "@/lib/cn";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  title: string;
  description?: string;
  triggerLabel: string;
  triggerIcon?: "plus" | "pencil" | "none";
  triggerTone?: "brand" | "ghost";
  submitLabel: string;
  /* Opens the pop-up as soon as the page loads, for example after following an "add" link. */
  startOpen?: boolean;
  children: React.ReactNode;
};

/*
 * A button that opens a form in a pop-up. Errors show inside the pop-up and what was typed is kept.
 * On success the pop-up closes, unless the action moves to another page, which it then follows.
 */
export function ModalForm({ action, title, description, triggerLabel, triggerIcon = "plus", triggerTone = "brand", submitLabel, startOpen = false, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const [state, formAction, pending] = useActionState<FormState & { at?: number }, FormData>(async (previous, data) => {
    const result = await action(previous, data);
    if (!result.error) {
      form.current?.reset();
      dialog.current?.close();
    }
    return { ...result, at: Date.now() };
  }, {});

  useEffect(() => {
    if (startOpen) dialog.current?.showModal();
  }, [startOpen]);

  const Icon = triggerIcon === "none" ? null : triggerIcon === "pencil" ? Pencil : Plus;

  return (
    <>
      <button
        type="button"
        className={cn(triggerTone === "brand" ? "btn-brand" : "btn-ghost", "btn-sm")}
        onClick={() => dialog.current?.showModal()}
      >
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />} {triggerLabel}
      </button>
      <dialog
        ref={dialog}
        className="hub-dialog"
        aria-labelledby={titleId}
        onClick={event => {
          // A click on the dimmed backdrop lands on the dialog element itself.
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="hub-dialog-body">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-bold">{title}</h2>
              {description && <p className="mt-1 text-xs text-mute">{description}</p>}
            </div>
            <button type="button" className="rounded-lg p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="Close" onClick={() => dialog.current?.close()}>
              <X className="h-4 w-4" />
            </button>
          </header>
          <form
            ref={form}
            className="grid gap-4 px-6 py-5"
            onSubmit={event => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              startTransition(() => formAction(data));
            }}
          >
            {children}
            {state.error && (
              <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" className="btn-ghost btn-sm" onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" disabled={pending} className="btn-brand btn-sm disabled:opacity-60">{pending ? "Saving…" : submitLabel}</button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
