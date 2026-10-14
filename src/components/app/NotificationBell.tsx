"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { markAllRead } from "@/server/actions/notifications";

export type BellItem = { id: string; title: string; body: string; tone: "info" | "warn" | "bad" | "good"; createdAt: string; read: boolean };

const dot = { info: "bg-brand", warn: "bg-accent", bad: "bg-flag", good: "bg-sage" } as const;

function ago(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/* The bell in the top bar: unread count, and the latest messages in a dropdown that sits over the page. */
export function NotificationBell({ unread, items, now }: { unread: number; items: BellItem[]; now: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition hover:bg-panel"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-flag px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-float)]">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-bold">Notifications{unread ? ` · ${unread} new` : ""}</p>
            {unread > 0 && (
              <button type="button" disabled={pending} onClick={() => startTransition(() => markAllRead())} className="inline-flex items-center gap-1 text-xs font-semibold text-brand disabled:opacity-50">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-mute">Nothing yet. Reminders and alerts for you appear here.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line/60 overflow-y-auto">
              {items.map(item => (
                <li key={item.id}>
                  <a href={`/app/notifications/open/${item.id}`} className={cn("flex gap-3 px-4 py-3 hover:bg-panel/60", !item.read && "bg-sky/30")}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.read ? "bg-line" : dot[item.tone])} />
                    <span className="min-w-0">
                      <span className={cn("block text-sm", !item.read && "font-semibold")}>{item.title}</span>
                      {item.body && <span className="line-clamp-2 block text-xs text-mute">{item.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-dim">{ago(item.createdAt, now)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-semibold text-brand hover:bg-panel/60">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
