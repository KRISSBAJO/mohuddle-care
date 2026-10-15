"use client";

import { useActionState, useState } from "react";
import { FileSignature, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { REQUIREMENT_STATE, type RequirementState } from "@/lib/documents";
import type { LinkResult } from "@/server/actions/documents";
import { ShareLink } from "./ShareLink";

type TypeOption = { id: string; name: string; state: RequirementState | null; required: boolean };
type TemplateOption = { id: string; title: string };

/*
 * Choose what to ask a staff member for: anything missing, expired or returned is ticked already.
 * Sends it to their Hub and makes a private link to share by text or email.
 */
export function RequestDocumentsForm({ action, types, templates, first }: { action: (previous: LinkResult, formData: FormData) => Promise<LinkResult>; types: TypeOption[]; templates: TemplateOption[]; first: string }) {
  const [state, formAction, pending] = useActionState<LinkResult, FormData>(action, {});
  const [open, setOpen] = useState(false);
  const needed = (option: TypeOption) => option.required && (option.state === "missing" || option.state === "expired" || option.state === "rejected" || option.state === "expiring");

  if (state.link) return <ShareLink link={state.link} expires={state.expires} first={state.first} agency={state.agency} onDone={() => setOpen(false)} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-brand btn-sm">
        <Send className="h-4 w-4" /> Request documents
      </button>
    );
  }
  const box = "flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50";
  return (
    <form action={formAction} className="grid gap-4 rounded-2xl border border-line bg-panel/40 p-4">
      <p className="text-sm font-semibold">Ask {first} for documents</p>
      <fieldset>
        <legend className="label">Documents to upload</legend>
        <div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {types.map(option => (
            <label key={option.id} className={box}>
              <input type="checkbox" name="typeIds" value={option.id} defaultChecked={needed(option)} className="mt-0.5 h-4 w-4 accent-[#1b6fa8]" />
              <span className="min-w-0">
                {option.name}
                {option.state && <span className={cn("block text-[11px]", option.state === "valid" ? "text-sage" : option.state === "missing" || option.state === "expired" || option.state === "rejected" ? "text-flag" : "text-mute")}>{REQUIREMENT_STATE[option.state].text}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {templates.length > 0 && (
        <fieldset>
          <legend className="label">Documents to sign</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {templates.map(template => (
              <label key={template.id} className={box}>
                <input type="checkbox" name="templateIds" value={template.id} className="mt-0.5 h-4 w-4 accent-[#1b6fa8]" />
                <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-plum" /> {template.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="req-extra" className="label">Anything else (one per line)</label>
        <textarea id="req-extra" name="extra" rows={2} className="field" placeholder="Copy of your college diploma" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="req-message" className="label">Message</label>
          <input id="req-message" name="message" maxLength={1000} className="field" placeholder={`Welcome aboard, ${first}! Please send these before your first shift.`} />
        </div>
        <div>
          <label htmlFor="req-due" className="label">Needed by</label>
          <input id="req-due" name="dueOn" type="date" className="field" />
        </div>
      </div>
      <input type="hidden" name="title" value="Documents for your staff file" />
      {state.error && <p className="rounded-lg bg-flag-soft px-3 py-2 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">Cancel</button>
        <button className="btn-brand btn-sm" disabled={pending}><Send className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send request"}</button>
      </div>
    </form>
  );
}
