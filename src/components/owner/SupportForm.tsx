"use client";

import { useActionState, useEffect } from "react";
import { LifeBuoy } from "lucide-react";
import type { SupportState } from "@/server/actions/owner";

/* Asks why, then opens the agency for a support visit. */
export function SupportForm({ action }: { action: (previous: SupportState, formData: FormData) => Promise<SupportState> }) {
  const [state, formAction, pending] = useActionState<SupportState, FormData>(action, {});
  // The visit opens at the agency's own address.
  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state.url]);
  return (
    <form action={formAction} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium">
        Why are you opening it?
        <textarea name="reason" required minLength={5} maxLength={300} rows={2} className="field" placeholder="Their administrator asked for help with the schedule" />
      </label>
      {state.error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending || Boolean(state.url)} className="btn-brand btn-sm disabled:opacity-60">
          <LifeBuoy className="h-3.5 w-3.5" /> {pending || state.url ? "Opening…" : "Open as support for an hour"}
        </button>
      </div>
    </form>
  );
}
