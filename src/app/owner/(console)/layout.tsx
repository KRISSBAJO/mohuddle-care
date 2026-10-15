import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ZoneSync } from "@/components/app/ZoneSync";
import { OwnerSidebar } from "@/components/owner/OwnerSidebar";
import { zone } from "@/lib/format";
import { ownerSignOutAction } from "@/server/actions/owner-auth";
import { schema, systemDb } from "@/server/db";
import { requireOwner } from "@/server/owner-auth";

export const metadata: Metadata = { title: { absolute: "Mohuddle admin", template: "%s | Mohuddle admin" }, robots: { index: false, follow: false } };

/* Mohuddle's own console, across every agency. Owners only, signed in on its own. */
export default async function OwnerConsoleLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const [waiting] = await systemDb.select({ n: count() }).from(schema.productEnquiries).where(eq(schema.productEnquiries.handled, false));
  return (
    <div className="hub-shell flex min-h-screen flex-col lg:flex-row">
      <ZoneSync zone={zone()} />
      <OwnerSidebar owner={{ name: owner.name, email: owner.email }} waiting={waiting.n} signOut={ownerSignOutAction} />
      <div className="min-w-0 flex-1">
        {!owner.twoFactor && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-flag-soft px-5 py-2.5 text-sm text-flag sm:px-8" role="status">
            <p className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Your sign-in has no authenticator app. Anyone with your password can open every agency.</p>
            <Link href="/owner/security" className="font-semibold underline">Add one</Link>
          </div>
        )}
        <main className="hub-main px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
