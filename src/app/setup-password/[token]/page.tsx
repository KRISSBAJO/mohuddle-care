import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { PasswordForm } from "@/components/app/PasswordForm";
import { completePasswordSetup } from "@/server/actions/accounts";
import { findValidLink } from "@/server/accounts";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Choose your password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SetupPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link, settings] = await Promise.all([findValidLink(token), getSettings()]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="font-display text-xl font-bold">Milestone</span>
        </Link>
        {link ? (
          <>
            <p className="eyebrow">Mohuddle</p>
            <h1 className="mt-2 text-3xl font-bold">{link.purpose === "invite" ? `Welcome, ${link.name.split(" ")[0]}` : "Choose a new password"}</h1>
            <p className="mb-6 mt-2 text-sm text-mute">
              You will sign in as <span className="font-semibold text-ink">{link.email}</span>. This link works once.
            </p>
            <PasswordForm action={completePasswordSetup.bind(null, token)} minLength={settings.password_min_length} submitLabel={link.purpose === "invite" ? "Set password and sign in" : "Save and sign in"} />
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">This link no longer works</h1>
            <p className="mt-3 text-sm text-mute">
              It may have expired, or it was already used. Ask your coordinator for a new link. If you already set your
              password, <Link href="/login" className="font-semibold text-brand">sign in here</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
