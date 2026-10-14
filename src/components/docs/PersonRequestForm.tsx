"use client";

import { useActionState, useState } from "react";
import { FileSignature, Send } from "lucide-react";
import type { LinkResult } from "@/server/actions/documents";
import { ShareLink } from "./ShareLink";

/* Ask a guardian or family member to sign or send documents about a person, by private link. */
export function PersonRequestForm({
  action,
  templates,
  types,
  defaultName,
  first,
}: {
  action: (previous: LinkResult, formData: FormData) => Promise<LinkResult>;
  templates: { id: string; title: string }[];
  types: { id: string; name: string }[];
  defaultName: string;
  first: string;
}) {
  const [state, formAction, pending] = useActionState<LinkResult, FormData>(action, {});
  const [open, setOpen] = useState(false);
  if (state.link) return <ShareLink link={state.link} expires={state.expires} first={state.first} onDone={() => setOpen(false)} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-brand btn-sm">
        <Send className="h-4 w-4" /> Ask a guardian to sign or send
      </button>
    );
  }
  const box = "flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50";
  return (
    <form action={formAction} className="grid w-full max-w-2xl gap-4 rounded-2xl border border-line bg-panel/40 p-4">
      <p className="text-sm font-semibold">Ask someone to sign or send documents for {first}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pr-name" className="label">Their name</label>
          <input id="pr-name" name="recipientName" required minLength={2} maxLength={120} defaultValue={defaultName} className="field" />
        </div>
        <div>
          <label htmlFor="pr-relation" className="label">Relationship</label>
          <input id="pr-relation" name="recipientRelation" maxLength={80} className="field" placeholder="Legal guardian" />
        </div>
      </div>
      {templates.length > 0 && (
        <fieldset>
          <legend className="label">To sign</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {templates.map(template => (
              <label key={template.id} className={box}>
                <input type="checkbox" name="templateIds" value={template.id} className="h-4 w-4 accent-[#1b6fa8]" /> <FileSignature className="h-3.5 w-3.5 text-plum" /> {template.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="label">To upload</legend>
        <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {types.map(type => (
            <label key={type.id} className={box}>
              <input type="checkbox" name="typeIds" value={type.id} className="h-4 w-4 accent-[#1b6fa8]" /> {type.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="pr-message" className="label">Message</label>
        <input id="pr-message" name="message" maxLength={1000} className="field" placeholder={`Please sign the consent form for ${first}'s services.`} />
      </div>
      {state.error && <p className="rounded-lg bg-flag-soft px-3 py-2 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">Cancel</button>
        <button className="btn-brand btn-sm" disabled={pending}><Send className="h-3.5 w-3.5" /> {pending ? "Making link…" : "Make private link"}</button>
      </div>
    </form>
  );
}
