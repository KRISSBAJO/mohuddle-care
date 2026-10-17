"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FolderLock,
  FolderOpen,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  Radio,
  Settings,
  Stethoscope,
  Timer,
  UserRound,
  Users,
  MessagesSquare,
  X,
} from "lucide-react";
import { ChatBadge } from "@/components/chat/ChatBadge";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/marketing/Logo";

type Item = { href: string; label: string; icon: typeof Home; exact?: boolean; manager?: boolean; chat?: boolean };

/* The menu in groups, so 17 links read as five short lists. */
const groups: { title: string; items: Item[] }[] = [
  {
    title: "",
    items: [
      { href: "/app", label: "Today", icon: LayoutDashboard, exact: true },
      { href: "/app/chat", label: "Chat", icon: MessagesSquare, chat: true },
    ],
  },
  {
    title: "Care",
    items: [
      { href: "/app/individuals", label: "People we support", icon: Users },
      { href: "/app/daily-logs", label: "Daily notes", icon: ClipboardList },
      { href: "/app/medications", label: "Medications", icon: Pill },
      { href: "/app/appointments", label: "Appointments", icon: Stethoscope },
      { href: "/app/incidents", label: "Incidents", icon: AlertTriangle },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/app/clock", label: "My time clock", icon: Timer },
      { href: "/app/time", label: "Time & attendance", icon: Radio, manager: true },
      { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/app/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/app/homes", label: "Homes", icon: Home },
      { href: "/app/staff", label: "Staff", icon: UserRound },
    ],
  },
  {
    title: "Files",
    items: [
      { href: "/app/documents", label: "Document center", icon: FolderOpen, manager: true },
      { href: "/app/my-documents", label: "My documents", icon: FolderLock },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/app/enquiries", label: "Website messages", icon: Inbox, manager: true },
      { href: "/app/settings", label: "Settings", icon: Settings, manager: true },
    ],
  },
];

export function Sidebar({ user, manager, signOut, chatUnread }: { user: { name: string; role: string }; manager: boolean; signOut: () => Promise<void>; chatUnread: number | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = groups.map(group => ({ ...group, items: group.items.filter(item => (!item.manager || manager) && (!item.chat || chatUnread !== null)) })).filter(group => group.items.length);

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
    <nav className="hub-nav flex flex-1 flex-col gap-4 overflow-y-auto pr-1" aria-label="Hub">
      {visible.map(group => (
        <div key={group.title || "home"}>
          {group.title && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{group.title}</p>}
          <ul className="space-y-0.5">
            {group.items.map(item => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
                      active ? "bg-white/[0.09] text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={cn("absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition", active ? "bg-accent" : "bg-transparent")} aria-hidden="true" />
                    <item.icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-accent" : "text-white/45 group-hover:text-white/80")} aria-hidden="true" />
                    {item.label}
                    {item.chat && chatUnread !== null ? <ChatBadge initial={chatUnread} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const initials = user.name
    .split(" ")
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const account = (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5">
      <Link href="/app/account" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-bold text-ink" aria-label="My account">
        {initials}
      </Link>
      <Link href="/app/account" onClick={() => setOpen(false)} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
        <span className="block text-[11px] capitalize text-white/45">{user.role}</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );

  return (
    <>
      <aside className="hub-sidebar hidden shrink-0 flex-col text-white lg:flex">
        <Link href="/app" className="mb-7 flex items-center gap-2.5 px-2">
          <Logo className="h-8 w-8" />
          <span><span className="block font-display text-lg font-semibold leading-none">Mohuddle</span><span className="mt-1 block text-[9px] uppercase tracking-[0.22em] text-white/40">Care operations</span></span>
        </Link>
        {nav}
        {account}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-display font-bold">Mohuddle</span>
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
          aria-label="Main menu"
          inert={!open}
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col overflow-y-auto bg-ink p-4 text-white shadow-[var(--shadow-float)] transition-transform duration-200 ease-[var(--ease-soft)] motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Link href="/app" onClick={() => setOpen(false)} className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              <span className="font-display font-bold">Mohuddle</span>
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
