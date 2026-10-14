import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Secure documents", robots: { index: false, follow: false } };

/* Pages reached by a private link: just the agency's name, the task, and a note that it is secure. */
export default function SecureDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-canvas,#fbfaf6)]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="font-display text-base font-bold">{site.legalName}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage"><Lock className="h-3.5 w-3.5" /> Secure upload</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-mute">
        This page only lets you send and sign the documents listed. It never shows anything already on file. If you were not expecting it, close this page and contact {site.legalName}.
      </footer>
    </div>
  );
}
