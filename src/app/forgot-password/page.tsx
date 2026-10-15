import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { ForgotPasswordForm } from "@/components/app/ForgotPasswordForm";
import { hostAgency } from "@/server/host";

export const metadata: Metadata = { title: { absolute: "Reset your password | Mohuddle" }, robots: { index: false, follow: false } };

/* Asks for an email address and sends a link to choose a new password. */
export default async function ForgotPasswordPage() {
  const agency = await hostAgency();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f1] p-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-8 flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="font-display text-xl font-bold">Mohuddle</span>
        </Link>
        {agency && agency !== "missing" && <p className="eyebrow">{agency.name}</p>}
        <h1 className="mt-1 text-3xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm text-mute">Enter the email you sign in with. We will email you a link to choose a new password.</p>
        <ForgotPasswordForm />
        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to sign in</Link>
      </div>
    </main>
  );
}
