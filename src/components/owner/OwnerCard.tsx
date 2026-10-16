import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/* A titled card for the owner console, with an icon and an optional link or button on the right. */
export function OwnerCard({ title, icon: Icon, action, children, className }: { title: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-brand" /> {title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();
