"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, CreditCard, Gauge, Inbox, Layers, LogOut, Menu, PlusCircle, ScrollText, Search, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number };

/* The owner console's menu: the same dark sidebar as the app, with Mohuddle's own sections. */
export function OwnerSidebar({ owner, waiting, signOut }: { owner: { name: string; email: string }; waiting: number; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups: { title: string; items: Item[] }[] = [
    { title: "", items: [{ href: "/owner", label: "Overview", icon: Gauge, exact: true }] },
    { title: "Agencies", items: [{ href: "/owner/agencies", label: "All agencies", icon: Building2, exact: true }, { href: "/owner/agencies/new", label: "Add an agency", icon: PlusCircle }] },
    { title: "Money", items: [{ href: "/owner/billing", label: "Billing", icon: CreditCard }, { href: "/owner/plans", label: "Plans and prices", icon: Layers }] },
    { title: "Growth", items: [{ href: "/owner/enquiries", label: "Demo requests", icon: Inbox, badge: waiting }] },
    { title: "Running Mohuddle", items: [{ href: "/owner/health", label: "Health", icon: Activity }, { href: "/owner/activity", label: "Activity log", icon: ScrollText }, { href: "/owner/search", label: "Search", icon: Search }] },
    { title: "You", items: [{ href: "/owner/security", label: "Security", icon: ShieldCheck }] },
  ];
  const isActive = (item: Item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  // "All agencies" also covers an agency's own page, but not "Add an agency".
  const active = (item: Item) => isActive(item) || (item.href === "/owner/agencies" && pathname.startsWith("/owner/agencies/") && pathname !== "/owner/agencies/new");

  const nav = (
    <nav className="hub-nav flex flex-1 flex-col gap-4 overflow-y-auto pr-1" aria-label="Owner console">
      {groups.map(group => (
        <div key={group.title || "home"}>
          {group.title && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{group.title}</p>}
          <ul className="space-y-0.5">
            {group.items.map(item => {
              const on = active(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn("group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition", on ? "bg-white/[0.09] text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white")}
                  >
                    <span className={cn("absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full", on ? "bg-accent" : "bg-transparent")} aria-hidden="true" />
                    <item.icon className={cn("h-[17px] w-[17px] shrink-0", on ? "text-accent" : "text-white/45 group-hover:text-white/80")} aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-ink">{item.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const initials = owner.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  const account = (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-bold text-ink">{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{owner.name}</span>
        <span className="block truncate text-[11px] text-white/45">Owner · {owner.email}</span>
      </span>
      <form action={signOut}>
        <button type="submit" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/owner" className="flex items-center gap-2.5 px-2">
      <Logo className="h-8 w-8" />
      <span>
        <span className="block font-display text-lg font-semibold leading-none">Mohuddle</span>
        <span className="mt-1 block text-[9px] uppercase tracking-[0.22em] text-white/40">Admin</span>
      </span>
    </Link>
  );

  return (
    <>
      <aside className="hub-sidebar hidden shrink-0 flex-col text-white lg:flex">
        <div className="mb-7">{brand}</div>
        {nav}
        {account}
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="hub-sidebar relative flex h-full flex-col text-white">
            <div className="mb-6 flex items-center justify-between">{brand}<button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            {nav}
            {account}
          </aside>
        </div>
      )}
    </>
  );
}
