"use client";

import { startTransition, useActionState, useRef } from "react";
import type { FormState } from "@/server/actions/auth";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
};

/* A form bound to a server action that returns { error } or redirects. Shows the error inline. */
export function ActionForm({ action, children, submitLabel, className = "" }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<FormState & { saved?: boolean }, FormData>(async (previous, data) => {
    const result = await action(previous, data);
    if (!result.error) form.current?.reset();
    return { ...result, saved: !result.error };
  }, {});
  return (
    <form ref={form} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => formAction(data));
    }} className={`grid gap-4 ${className}`}>
      {children}
      {state.error && (
        <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && <p className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm font-medium text-sage" role="status">Saved successfully.</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-brand disabled:opacity-60">
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
