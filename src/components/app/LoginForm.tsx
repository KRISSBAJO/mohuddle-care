"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/server/actions/auth";
import { PasswordInput } from "./PasswordInput";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="mt-8 grid gap-4">
      <input type="hidden" name="next" value={next ?? "/app"} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <label className="flex items-start gap-2.5 text-sm text-mute">
        <input type="checkbox" name="shared" className="mt-0.5 h-4 w-4 accent-brand" />
        <span>This is a shared device, such as a home&apos;s tablet. Sign me out when I clock out.</span>
      </label>
      {state.error && <p className="text-sm font-medium text-flag" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary mt-2 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
