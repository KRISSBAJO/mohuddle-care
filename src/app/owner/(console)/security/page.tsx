import { CheckCircle2, MonitorSmartphone, ShieldAlert } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { PageHeader, Panel } from "@/components/app/ui";
import { NewBackupCodes, OwnerSetupForm } from "@/components/owner/OwnerAuthForms";
import { fmt } from "@/lib/format";
import { groupSecret, otpauthUrl } from "@/lib/totp";
import { signOutOthersAction } from "@/server/actions/owner-auth";
import { saveSignInLimitsAction } from "@/server/actions/owner";
import { signInLimits } from "@/server/sign-in-guard";
import { ownerSessionsFor, ownSetupSecret, requireOwner } from "@/server/owner-auth";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

/* The owner's own sign-in: the authenticator app, backup codes and where they are signed in. */
export default async function SecurityPage() {
  const owner = await requireOwner();
  const [sessions, setup, limits] = await Promise.all([ownerSessionsFor(owner.loginId), owner.twoFactor ? null : ownSetupSecret(owner.loginId), signInLimits()]);
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader eyebrow="You" title="Security" description="Your owner sign-in can reach every agency, so it is protected more than any other." />

      <Panel title="Authenticator app">
        <div className="space-y-4 p-5 text-sm">
          {owner.twoFactor ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-sage"><CheckCircle2 className="h-4 w-4" /> On: every sign-in asks for a code from your phone.</p>
              <p className="text-mute">{owner.backupCodesLeft} unused backup {owner.backupCodesLeft === 1 ? "code" : "codes"} left. Each works once if you lose your phone.</p>
              <NewBackupCodes />
              <p className="text-xs text-mute">
                Lost your phone and your backup codes? Someone with access to the server can switch it off for you with <code>pnpm tsx scripts/make-owner.ts your@email --reset-two-factor</code>. You then add the app again at your next sign-in.
              </p>
            </>
          ) : setup ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-flag"><ShieldAlert className="h-4 w-4" /> Off: anyone with your password can open every agency.</p>
              <OwnerSetupForm secret={setup.secret} grouped={groupSecret(setup.secret)} url={otpauthUrl(setup.secret, setup.email)} signedIn />
            </>
          ) : null}
        </div>
      </Panel>

      <Panel title={`Signed in on ${sessions.length} ${sessions.length === 1 ? "browser" : "browsers"}`}>
        <ul className="divide-y divide-line/60">
          {sessions.map(session => (
            <li key={session.createdAt.toISOString()} className="flex items-start gap-3 px-5 py-3 text-sm">
              <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
              <span className="min-w-0">
                <span className="block truncate">{session.userAgent || "Unknown browser"}</span>
                <span className="block text-xs text-mute">
                  Signed in {fmt.dateTime(session.createdAt)} · last used {fmt.dateTime(session.lastSeenAt)}
                  {session.ip ? ` · ${session.ip}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <div className="border-t border-line p-5">
            <ConfirmAction action={signOutOthersAction} label="Sign out every other browser" confirm="Sign out of the owner console everywhere except here?" tone="danger" />
          </div>
        )}
      </Panel>

      <Panel title="Wrong passwords">
        <div className="space-y-4 p-5 text-sm">
          <p className="text-mute">
            For everyone: every agency&apos;s website and phone app, and this console. After too many wrong passwords, signing in with that email pauses, and the person is told to wait or reset their password. It counts the same whether or not the email has a login, so nobody learns which emails exist.
          </p>
          <ActionForm action={saveSignInLimitsAction} submitLabel="Save">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5 font-medium">Wrong tries allowed<span className="flex items-center gap-2"><input name="tries" type="number" min={3} max={20} required defaultValue={limits.tries} className="field" /> <span className="shrink-0 text-mute">per email</span></span></label>
              <label className="grid gap-1.5 font-medium">Then pause for<span className="flex items-center gap-2"><input name="minutes" type="number" min={1} max={240} required defaultValue={limits.minutes} className="field" /> <span className="shrink-0 text-mute">minutes</span></span></label>
              <label className="grid gap-1.5 font-medium">From one place<span className="flex items-center gap-2"><input name="perPlace" type="number" min={10} max={500} required defaultValue={limits.perPlace} className="field" /> <span className="shrink-0 text-mute">tries, any email</span></span></label>
            </div>
            <p className="text-xs text-mute">The tries count from one phone or computer. From many places at once, an email pauses after four times as many, so someone guessing cannot easily lock a real person out. Codes from the authenticator app count the same way.</p>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
