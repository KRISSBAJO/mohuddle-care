"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Mail, MessageSquare, RefreshCw } from "lucide-react";
import type { LinkResult } from "@/server/actions/documents";

/* Shows a private link once, with copy, text and email buttons. The text and email open on this device. */
export function ShareLink({ link, expires, first, agency, emailed, onDone }: { link: string; expires?: string; first?: string; agency?: string; emailed?: string; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const message = `Hi${first ? ` ${first}` : ""}, please upload your documents${agency ? ` for ${agency}` : ""} here: ${link}${expires ? ` (works until ${expires})` : ""}`;
  return (
    <div className="rounded-xl border border-sage/40 bg-sage-soft/60 p-4" role="status">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-sage"><Link2 className="h-4 w-4" /> Private link ready</p>
      <p className="mt-1 text-xs text-mute">
        Anyone with this link can upload the requested documents, but nobody can see any file through it.{expires ? ` It works until ${expires}.` : ""} It is not shown again. If it gets lost, send a fresh link: the old one then stops working.
      </p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={link} className="field font-mono text-xs" aria-label="Private upload link" onFocus={event => event.currentTarget.select()} />
        <button
          type="button"
          className="btn-brand btn-sm shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {emailed && <p className="mt-3 text-xs font-medium text-ink">{emailed}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`sms:?&body=${encodeURIComponent(message)}`} className="btn-ghost btn-sm"><MessageSquare className="h-3.5 w-3.5" /> Text it</a>
        <a href={`mailto:?subject=${encodeURIComponent(agency ? `Documents for ${agency}` : "Documents to send")}&body=${encodeURIComponent(message)}`} className="btn-ghost btn-sm"><Mail className="h-3.5 w-3.5" /> Email it</a>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            onDone?.();
            router.refresh();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* A button that replaces a request's link with a new one and shows it. */
export function FreshLinkButton({ action }: { action: (previous: LinkResult) => Promise<LinkResult> }) {
  const [state, run, pending] = useActionState<LinkResult, FormData>(previous => action(previous), {});
  if (state.link) return <ShareLink link={state.link} expires={state.expires} agency={state.agency} />;
  return (
    <form action={run} className="inline">
      <button className="btn-ghost btn-sm" disabled={pending}><RefreshCw className="h-3.5 w-3.5" /> {pending ? "Making…" : "Send a fresh link"}</button>
      {state.error && <p className="mt-1 text-xs text-flag">{state.error}</p>}
    </form>
  );
}
