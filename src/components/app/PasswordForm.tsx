"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/actions/auth";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  minLength: number;
  askCurrent?: boolean;
  submitLabel: string;
};

/* New-password form for first sign-in, resets and changing your own password. */
export function PasswordForm({ action, minLength, askCurrent = false, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<FormState & { done?: boolean }, FormData>(async (previous, data) => {
    const result = await action(previous, data);
    return { ...result, done: !result.error };
  }, {});
  return (
    <form action={formAction} className="grid gap-4">
      {askCurrent && (
        <div>
          <label htmlFor="current" className="label">Current password</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required className="field" />
        </div>
      )}
      <div>
        <label htmlFor="password" className="label">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={minLength} className="field" />
        <p className="mt-1 text-xs text-mute">At least {minLength} characters. A short sentence you will remember works well.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={minLength} className="field" />
      </div>
      {state.error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      {state.done && askCurrent && <p className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm font-medium text-sage" role="status">Password changed. Other devices have been signed out.</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
