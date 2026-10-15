"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { requestPasswordReset, type ResetState } from "@/server/actions/password-reset";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestPasswordReset, {});
  if (state.done) {
    return (
      <div className="mt-6 rounded-xl border border-sage/40 bg-sage-soft/60 p-4 text-sm" role="status">
        <p className="flex items-center gap-2 font-semibold text-sage"><MailCheck className="h-4 w-4" /> Check your email</p>
        <p className="mt-1 text-mute">If that email has a Mohuddle login, a link to choose a new password is on its way. It can take a few minutes. Check your spam folder too.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium">
        Email
        <input name="email" type="email" required maxLength={200} autoComplete="email" className="field" />
      </label>
      {state.error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-brand justify-center disabled:opacity-60">{pending ? "Sending…" : "Email me a link"}</button>
    </form>
  );
}
