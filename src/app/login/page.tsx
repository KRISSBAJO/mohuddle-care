import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Logo } from "@/components/marketing/Logo";
import { LoginForm } from "@/components/app/LoginForm";
import { getSessionUser } from "@/server/auth";
import { hostAgency } from "@/server/host";

export const metadata: Metadata = { title: { absolute: "Sign in to Mohuddle" } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/app");
  const { next, reason } = await searchParams;
  const notice =
    reason === "idle"
      ? "You were signed out after a while without using the app. Sign in again to carry on."
      : reason === "shared"
        ? "You clocked out on a shared device, so you were signed out."
        : reason === "handoff"
          ? "That sign-in link has expired or was already used. Sign in here instead."
          : "";
  // On an agency's own address, the page names the agency.
  const agency = await hostAgency();
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/mohuddle" className="flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="font-display text-xl font-bold">Mohuddle</span>
        </Link>
        <div>
          <p className="eyebrow text-accent">Mohuddle</p>
          <h1 className="mt-4 max-w-md text-5xl font-bold">One place for every shift, log and plan.</h1>
          <p className="mt-5 max-w-md text-white/70">
            Daily routines, medications, incidents and schedules for every home, with the rules set by the office and
            followed everywhere.
          </p>
          <div className="hub-login-photo"><Image src="/images/care-garden.png" alt="People sharing a garden activity at home" fill sizes="50vw" className="object-cover" /></div>
        </div>
        <p className="text-xs text-white/40">Protected health information. Authorised staff only.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/mohuddle" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-9 w-9" />
            <span className="font-display text-xl font-bold">Mohuddle</span>
          </Link>
          {notice && <p className="mb-6 rounded-xl bg-sky px-4 py-3 text-sm text-brand-deep" role="status">{notice}</p>}
          {agency === "missing" ? (
            <>
              <h2 className="text-3xl font-bold">No agency here</h2>
              <p className="mt-2 text-sm text-mute">No agency on Mohuddle uses this address. Check the link you were given, or ask your office for it.</p>
            </>
          ) : (
            <>
              {agency && <p className="eyebrow">{agency.name}</p>}
              <h2 className="mt-1 text-3xl font-bold">Sign in</h2>
              <p className="mt-2 text-sm text-mute">Use the email and password the office gave you.</p>
              <LoginForm next={next} />
            </>
          )}
          <p className="mt-6 text-xs text-mute">
            <Link href="/forgot-password" className="font-semibold text-brand hover:underline">Forgot your password?</Link> New here? Your office sends you a link to set one.
          </p>
        </div>
      </section>
    </main>
  );
}
