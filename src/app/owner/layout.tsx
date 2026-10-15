import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ZoneSync } from "@/components/app/ZoneSync";
import { zone } from "@/lib/format";
import { requireOwner } from "@/server/guard";

export const metadata: Metadata = { title: { absolute: "Owner console | Mohuddle", template: "%s | Mohuddle owner console" }, robots: { index: false, follow: false } };

/* Mohuddle's own console, across every agency. Only owners get in. */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div className="min-h-screen bg-[#f7f6f1]">
      <ZoneSync zone={zone()} />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-brand" /> Mohuddle owner console</p>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/owner" className="rounded-lg px-3 py-1.5 font-semibold text-mute hover:bg-panel hover:text-ink">Agencies</Link>
            <Link href="/owner/enquiries" className="rounded-lg px-3 py-1.5 font-semibold text-mute hover:bg-panel hover:text-ink">Demo requests</Link>
            <Link href="/owner/health" className="rounded-lg px-3 py-1.5 font-semibold text-mute hover:bg-panel hover:text-ink">Health</Link>
            <Link href="/owner/activity" className="rounded-lg px-3 py-1.5 font-semibold text-mute hover:bg-panel hover:text-ink">Activity</Link>
            <Link href="/owner/search" className="rounded-lg px-3 py-1.5 font-semibold text-mute hover:bg-panel hover:text-ink">Search</Link>
          </nav>
          <Link href="/app" className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to the app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
