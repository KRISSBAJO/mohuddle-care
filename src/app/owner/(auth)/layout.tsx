import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";

export const metadata: Metadata = { title: { absolute: "Mohuddle admin" }, robots: { index: false, follow: false } };

/* Signing in to the owner console: a quiet page, apart from any agency's. */
export default function OwnerAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="hidden flex-col justify-between bg-gradient-to-b from-[#153a32] to-[#0e2a24] p-12 text-white lg:flex">
        <span className="flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span>
            <span className="block font-display text-xl font-bold leading-none">Mohuddle</span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-white/45">Admin</span>
          </span>
        </span>
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[#dcef98]"><ShieldCheck className="h-4 w-4" /> Owners only</p>
          <h1 className="mt-4 max-w-md text-4xl font-bold leading-tight">Every agency, plan and payment, in one place.</h1>
          <p className="mt-4 max-w-md text-white/65">Sign-in needs your password and a code from your authenticator app, every time.</p>
        </div>
        <p className="text-xs text-white/35">Every action here is recorded.</p>
      </section>
      <section className="flex items-center justify-center bg-[#f7f6f1] p-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
