"use client";

import { useActionState } from "react";
import { submitEnquiry, type EnquiryState } from "@/server/actions/public";

/* "Book a demo": goes to the website messages inbox like any other enquiry. */
export function DemoForm() {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiry, { ok: false });
  if (state.ok) {
    return (
      <div className="rounded-3xl bg-white/10 p-8 text-center">
        <p className="text-2xl font-bold">Thank you.</p>
        <p className="mt-2 text-white/70">We will be in touch within one working day to find a time.</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-3xl bg-white p-6 text-[#173e35] shadow-2xl sm:grid-cols-2 sm:p-8">
      <input type="hidden" name="kind" value="demo" />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="grid gap-1 text-sm font-medium">Your name<input name="name" required minLength={2} maxLength={120} autoComplete="name" className="field" /></label>
      <label className="grid gap-1 text-sm font-medium">Work email<input name="email" type="email" required maxLength={200} autoComplete="email" className="field" /></label>
      <label className="grid gap-1 text-sm font-medium">Agency<input name="interest" maxLength={120} autoComplete="organization" className="field" placeholder="Agency name and state" /></label>
      <label className="grid gap-1 text-sm font-medium">Phone (optional)<input name="phone" maxLength={40} autoComplete="tel" className="field" /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">What would you like to see?<textarea name="message" rows={3} maxLength={3000} className="field" placeholder="How many homes and staff, and what slows your team down today." /></label>
      {state.error && <p role="alert" className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag sm:col-span-2">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-brand justify-center sm:col-span-2 disabled:opacity-60">{pending ? "Sending…" : "Book a demo"}</button>
    </form>
  );
}
