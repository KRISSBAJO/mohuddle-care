import Link from "next/link";
import { cn } from "@/lib/cn";

const LINKS = [
  ["/app/settings", "Business rules"],
  ["/app/settings/shifts", "Shift patterns"],
  ["/app/settings/notes", "Daily notes"],
  ["/app/settings/differentials", "Pay differentials"],
] as const;

/* Tabs across the settings pages. */
export function SettingsNav({ current }: { current: (typeof LINKS)[number][0] }) {
  return (
    <nav className="mb-6 flex w-full gap-1 overflow-x-auto rounded-xl bg-panel p-1 sm:w-fit" aria-label="Settings sections">
      {LINKS.map(([href, text]) => (
        <Link key={href} href={href} aria-current={current === href ? "page" : undefined} className={cn("shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold", current === href ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}>
          {text}
        </Link>
      ))}
    </nav>
  );
}
