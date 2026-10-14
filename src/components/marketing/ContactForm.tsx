"use client";

import { startTransition, useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Select } from "@/components/app/Select";
import { services } from "@/lib/site";
import { submitEnquiry, type EnquiryState } from "@/server/actions/public";

export function ContactForm({ kind = "contact", interests }: { kind?: "contact" | "careers" | "foster"; interests?: string[] }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiry, { ok: false });
  const options = interests ?? services.map(service => service.name);

  if (state.ok) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-sage" aria-hidden="true" />
        <h3 className="text-2xl font-bold">Thank you. We have your message.</h3>
        <p className="max-w-sm text-mute">
          Your message is saved for our team to review. If this is urgent, please call us.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      if (kind === "careers" && data.get("interest") === "Foster parenting") data.set("kind", "foster");
      startTransition(() => action(data));
    }} className="card grid gap-4 p-6 sm:p-8">
      <input type="hidden" name="kind" value={kind} />
      <div className="hidden" aria-hidden="true">
        <label>
          Leave this empty <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">Your name</label>
          <input id="name" name="name" required autoComplete="name" className="field" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className="field" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="field" />
        </div>
        <div>
          <label htmlFor="interest" className="label">{kind === "contact" ? "I am asking about" : "Role or interest"}</label>
          <Select id="interest" name="interest" defaultValue="" emptyLabel="Choose one" options={options.map(option => ({ value: option, label: option }))} />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="label">How can we help?</label>
        <textarea id="message" name="message" rows={4} className="field" placeholder="Tell us a little about the person and the support you are looking for." />
      </div>
      {state.error && <p className="text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-mute">We keep what you share private and never sell it.</p>
        <button type="submit" disabled={pending} className="btn-brand disabled:opacity-60">
          <Send className="h-4 w-4" /> {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
