"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-display font-bold">Milestone Hub</span>
        </Link>
        <button type="button" onClick={() => setOpen(v => !v)} aria-label={open ? "Close menu" : "Open menu"} className="rounded-lg p-2 hover:bg-white/10">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="flex flex-col bg-ink p-4 text-white lg:hidden">
          {nav}
          {account}
        </div>
      )}
    </>
  );
}
