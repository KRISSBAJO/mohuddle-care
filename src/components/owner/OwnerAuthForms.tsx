"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Smartphone } from "lucide-react";
import { finishOwnSetupAction, finishSetupAction, newBackupCodesAction, ownerCodeAction, ownerSignInAction, type OwnerSignInState, type SetupState } from "@/server/actions/owner-auth";
import { PasswordInput } from "@/components/app/PasswordInput";

const FormError = ({ text }: { text?: string }) => (text ? <p className="rounded-xl bg-flag-soft px-3.5 py-2.5 text-sm font-medium text-flag" role="alert">{text}</p> : null);

/* Email and password. */
export function OwnerPasswordForm() {
  const [state, action, pending] = useActionState<OwnerSignInState, FormData>(ownerSignInAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium">Email<input name="email" type="email" required autoComplete="username" className="field" /></label>
      <div className="grid gap-1.5 text-sm font-medium"><label htmlFor="owner-password">Password</label><PasswordInput id="owner-password" name="password" required autoComplete="current-password" /></div>
      <FormError text={state.error} />
      <button type="submit" disabled={pending} className="btn-brand justify-center disabled:opacity-60">{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}

/* The six digits from the app, or a backup code. */
export function OwnerCodeForm() {
  const [state, action, pending] = useActionState<OwnerSignInState, FormData>(ownerCodeAction, {});
  const [backup, setBackup] = useState(false);
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium">
        {backup ? "Backup code" : "6-digit code"}
        <input
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          maxLength={backup ? 20 : 7}
          placeholder={backup ? "xxxxx-xxxxx" : "123 456"}
          className="field text-center font-mono text-lg tracking-[0.3em]"
        />
      </label>
      <FormError text={state.error} />
      <button type="submit" disabled={pending} className="btn-brand justify-center disabled:opacity-60">{pending ? "Checking…" : "Sign in"}</button>
      <button type="button" onClick={() => setBackup(value => !value)} className="text-xs font-semibold text-brand">{backup ? "Use the code from my app" : "I do not have my phone: use a backup code"}</button>
    </form>
  );
}

/* Adding Mohuddle to the app: the key (or the link on a phone), then the first code, then the backup codes. */
export function OwnerSetupForm({ secret, grouped, url, signedIn = false, finished = false }: { secret: string; grouped: string; url: string; signedIn?: boolean; finished?: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(signedIn ? finishOwnSetupAction : finishSetupAction, {});
  const [copied, setCopied] = useState(false);
  if (state.backupCodes) return <BackupCodes codes={state.backupCodes} />;
  // Opened again after setup was finished: nothing more to do here.
  if (finished) return <Link href="/owner" className="btn-brand mt-6 flex justify-center">Your authenticator app is on: open the console</Link>;
  return (
    <div className="mt-6 space-y-5">
      <ol className="space-y-4 text-sm">
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#173e35] text-xs font-bold text-white">1</span>
          <span>Open an authenticator app on your phone: Google Authenticator, Microsoft Authenticator, 1Password or similar.</span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#173e35] text-xs font-bold text-white">2</span>
          <span className="min-w-0 flex-1">
            Add an account and type this key (time-based):
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
              <code className="min-w-0 flex-1 break-all font-mono text-[13px] font-semibold tracking-wider">{grouped}</code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="shrink-0 rounded-lg p-1.5 text-mute hover:bg-panel"
                aria-label="Copy the key"
              >
                {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
              </button>
            </span>
            <a href={url} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand"><Smartphone className="h-3.5 w-3.5" /> On this phone? Open it in the app instead</a>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#173e35] text-xs font-bold text-white">3</span>
          <span>Type the 6-digit code the app now shows for Mohuddle.</span>
        </li>
      </ol>
      <form action={action} className="grid gap-4">
        <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" aria-label="6-digit code" className="field text-center font-mono text-lg tracking-[0.3em]" />
        <FormError text={state.error} />
        <button type="submit" disabled={pending} className="btn-brand justify-center disabled:opacity-60">{pending ? "Checking…" : "Switch it on"}</button>
      </form>
    </div>
  );
}

/* Shown once: codes that work instead of the app, one time each. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-6 space-y-4" role="status">
      <p className="flex items-center gap-2 text-sm font-semibold text-sage"><KeyRound className="h-4 w-4" /> Keep these backup codes somewhere safe</p>
      <p className="text-sm text-mute">Each one signs you in once if you lose your phone. They are not shown again.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-white p-4 font-mono text-sm">
        {codes.map(code => <li key={code}>{code}</li>)}
      </ul>
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy all"}
      </button>
      <Link href="/owner" className="btn-brand flex justify-center">I have saved them: open the console</Link>
    </div>
  );
}

/* New backup codes, replacing the old ones; shown once. */
export function NewBackupCodes() {
  const [state, action, pending] = useActionState<SetupState, FormData>(newBackupCodesAction, {});
  if (state.backupCodes) return <BackupCodes codes={state.backupCodes} />;
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="btn-ghost btn-sm disabled:opacity-60"><KeyRound className="h-3.5 w-3.5" /> {pending ? "Making…" : "Make new backup codes"}</button>
    </form>
  );
}
