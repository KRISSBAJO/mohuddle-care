"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/actions/auth";
import { PasswordInput } from "./PasswordInput";

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
          <PasswordInput id="current" name="current" autoComplete="current-password" required />
        </div>
      )}
      <div>
        <label htmlFor="password" className="label">New password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={minLength} />
        <p className="mt-1 text-xs text-mute">At least {minLength} characters. A short sentence you will remember works well.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">Type it again</label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={minLength} />
      </div>
      {state.error && <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{state.error}</p>}
      {state.done && askCurrent && <p className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm font-medium text-sage" role="status">Password changed. Other devices have been signed out.</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
