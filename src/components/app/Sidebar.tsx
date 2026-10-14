"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/marketing/Logo";

const items = [
  { href: "/app", label: "Today", icon: LayoutDashboard, exact: true },
  { href: "/app/individuals", label: "People we support", icon: Users },
  { href: "/app/daily-logs", label: "Daily logs", icon: ClipboardList },
  { href: "/app/medications", label: "Medications", icon: Pill },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/app/homes", label: "Homes", icon: Home },
  { href: "/app/staff", label: "Staff", icon: UserRound },
  { href: "/app/enquiries", label: "Website messages", icon: Inbox, manager: true },
  { href: "/app/settings", label: "Settings", icon: Settings, manager: true },
];

export function Sidebar({ user, manager, signOut }: { user: { name: string; role: string }; manager: boolean; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = items.filter(item => !item.manager || manager);

  // The phone menu is a drawer over the page: Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Hub">
      {visible.map(item => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active ? "hub-nav-active bg-accent text-ink" : "text-white/65 hover:bg-white/8 hover:text-white",
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="mt-auto border-t border-white/10 pt-4">
      <Link href="/app/account" onClick={() => setOpen(false)} className="block truncate text-sm font-semibold text-white hover:underline">{user.name}</Link>
      <p className="text-xs capitalize text-white/50">{user.role} · <Link href="/app/account" onClick={() => setOpen(false)} className="hover:text-white">My account</Link></p>
      <form action={signOut} className="mt-3">
        <button type="submit" className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white">
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      <aside className="hub-sidebar hidden shrink-0 flex-col text-white lg:flex">
        <Link href="/app" className="mb-6 flex items-center gap-2.5 px-2">
          <Logo className="h-8 w-8" />
          <span><span className="block font-display text-xl font-semibold">Milestone</span><span className="mt-1 block text-[9px] uppercase tracking-[0.22em] text-white/50">Care operations</span></span>
        </Link>
        <p className="hub-nav-label">YOUR WORKSPACE</p>
        {nav}
        <div className="my-5 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-medium text-accent">Every detail is care.</p><p className="mt-2 text-[11px] leading-relaxed text-white/55">The small things you do today make someone’s tomorrow better.</p></div>
        {account}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-display font-bold">Milestone Hub</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="hub-drawer" className="rounded-lg p-2 hover:bg-white/10">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className={cn("absolute inset-0 bg-ink/50 backdrop-blur-[2px] transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        />
        <div
          id="hub-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Hub menu"
          inert={!open}
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col overflow-y-auto bg-ink p-4 text-white shadow-[var(--shadow-float)] transition-transform duration-200 ease-[var(--ease-soft)] motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Link href="/app" onClick={() => setOpen(false)} className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              <span className="font-display font-bold">Milestone Hub</span>
            </Link>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          {nav}
          <div className="mt-4">{account}</div>
        </div>
      </div>
    </>
  );
}
