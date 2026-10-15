"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import type { LinkState } from "@/server/actions/accounts";

type Props = {
  action: (previous: LinkState, formData: FormData) => Promise<LinkState>;
  label: string;
  children?: React.ReactNode;
};

/* Runs an action that returns a one-time link, then shows it once with a copy button. */
export function LinkIssuer({ action, label, children }: Props) {
  const [state, formAction, pending] = useActionState<LinkState, FormData>(action, {});
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  if (state.note) {
    return (
      <div className="rounded-xl border border-sage/40 bg-sage-soft/60 p-4" role="status">
        <p className="text-sm font-semibold text-sage">Login added</p>
        <p className="mt-1 text-xs text-mute">{state.note}</p>
        <button type="button" className="mt-3 text-xs font-semibold text-brand" onClick={() => router.refresh()}>
          Done
        </button>
      </div>
    );
  }

  if (state.link) {
    return (
      <div className="rounded-xl border border-sage/40 bg-sage-soft/60 p-4" role="status">
        <p className="text-sm font-semibold text-sage">Link ready. Give it to this person privately.</p>
        <p className="mt-1 text-xs text-mute">
          It works once, until {state.expires} Central time. It is not shown again, so copy it now. Send it by text or
          hand it over in person, not in a group chat.
        </p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={state.link} className="field font-mono text-xs" aria-label="One-time setup link" onFocus={event => event.currentTarget.select()} />
          <button
            type="button"
            className="btn-brand btn-sm shrink-0"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button type="button" className="mt-3 text-xs font-semibold text-brand" onClick={() => router.refresh()}>
          Done, I have given them the link
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-3">
      {children}
      {state.error && (
        <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>
      )}
      <div>
        <button type="submit" disabled={pending} className="btn-brand btn-sm disabled:opacity-60">
          <KeyRound className="h-3.5 w-3.5" /> {pending ? "Working…" : label}
        </button>
      </div>
    </form>
  );
}
