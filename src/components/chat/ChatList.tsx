"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, AtSign, BarChart3, BellOff, Camera, FileText, Inbox, Lock, MessageSquarePlus, Mic, Pin, Search, Star, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { Avatar } from "./Avatar";
import type { ChatItem } from "./client";

export type Filter = "all" | "unread" | "groups" | "archived";
export type SearchResult = { id: string; chatId: string; body: string; at: string; sender: string | null; chatTitle: string; chatKind: string };

/* "14:05" today, the weekday this week, else the date. */
export const whenShort = (iso: string | null, now: number) => {
  if (!iso) return "";
  const at = new Date(iso);
  const age = now - at.getTime();
  if (age < 86_400_000 && new Date(now).getDate() === at.getDate()) return fmt.time(at);
  if (age < 6 * 86_400_000) return at.toLocaleDateString("en-US", { weekday: "short" });
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* The last message in a chat, as one short line: who sent it, and an icon for a photo, voice note, file or poll. */
function Preview({ item, meId, typer }: { item: ChatItem; meId: string; typer: string }) {
  if (typer)
    return (
      <span className="flex items-center gap-1.5 font-semibold text-brand">
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="chat-dot !h-1 !w-1 !bg-brand" />
          <span className="chat-dot !h-1 !w-1 !bg-brand [animation-delay:150ms]" />
          <span className="chat-dot !h-1 !w-1 !bg-brand [animation-delay:300ms]" />
        </span>
        {item.kind === "direct" ? "typing" : `${typer} is typing`}
      </span>
    );
  const last = item.lastMessage;
  if (!last) return <span className="italic text-dim">{item.kind === "home" ? "Your home's group" : item.kind === "announcements" ? "News from the office" : "Say hello 👋"}</span>;
  if (last.deleted) return <span className="italic text-dim">This message was deleted</span>;
  const who = last.senderId === meId ? "You" : item.kind !== "direct" && last.senderName ? last.senderName.split(" ")[0] : "";
  const icon = { image: Camera, voice: Mic, file: FileText, poll: BarChart3 }[last.kind];
  const Icon = icon ?? null;
  const text = last.body || (last.kind === "image" ? "Photo" : last.kind === "voice" ? "Voice note" : last.kind === "file" ? "File" : "");
  return (
    <span className="flex min-w-0 items-center gap-1">
      {who && <span className="shrink-0 font-medium text-ink/70">{who}:</span>}
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      <span className="truncate">{text}</span>
    </span>
  );
}

function Row({ item, active, meId, typer, now, onOpen }: { item: ChatItem; active: boolean; meId: string; typer: string; now: number; onOpen: () => void }) {
  const unread = item.unread > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-150",
        active ? "bg-white shadow-[0_10px_28px_-14px_rgba(23,62,53,0.45)] ring-1 ring-brand/15" : "hover:bg-white hover:shadow-[0_6px_18px_-12px_rgba(23,62,53,0.35)]",
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" aria-hidden="true" />}
      <Avatar chat={item} size={46} online={item.other?.online} ring={unread && !item.muted} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-[14.5px] tracking-[-0.01em]", unread ? "font-bold text-ink" : "font-semibold text-ink/90")}>{item.title}</span>
          <span className={cn("shrink-0 text-[11px] tabular-nums", unread && !item.muted ? "font-semibold text-brand" : "text-dim")}>{whenShort(item.lastMessageAt ?? item.lastMessage?.at ?? null, now)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[12.75px]", unread ? "text-ink/75" : "text-mute")}>
            <Preview item={item} meId={meId} typer={typer} />
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {item.muted && <BellOff className="h-3.5 w-3.5 text-dim" aria-label="Muted" />}
            {item.pinned && <Pin className="h-3.5 w-3.5 rotate-45 text-dim" aria-label="Pinned" />}
            {item.mentioned && (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#e3efd0] text-brand-deep" aria-label="You were mentioned">
                <AtSign className="h-3 w-3" strokeWidth={2.75} />
              </span>
            )}
            {unread && (
              <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums text-white", item.muted ? "bg-dim/70" : "bg-brand shadow-[0_2px_6px_-1px_rgba(40,107,85,0.55)]")}>
                {item.unread > 99 ? "99+" : item.unread}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

/* Marks the words you searched for inside a message. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (!term || at < 0) return <>{text}</>;
  const start = Math.max(0, at - 40);
  return (
    <>
      {start > 0 ? "…" : ""}
      {text.slice(start, at)}
      <mark className="rounded bg-[#e3efd0] px-0.5 text-brand-deep">{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}

/*
 * The column of chats: search across chats and messages ("/" jumps to it), a filter, pinned chats
 * first, and the rest by their latest message.
 */
export function ChatList({
  chats,
  meId,
  activeId,
  live,
  now,
  query,
  results,
  filter,
  typingIn,
  onQuery,
  onFilter,
  onOpen,
  onOpenResult,
  onStarred,
  onNew,
  hidden,
}: {
  chats: ChatItem[];
  meId: string;
  activeId: string | null;
  live: boolean;
  now: number;
  query: string;
  results: SearchResult[];
  filter: Filter;
  typingIn: (chatId: string) => string;
  onQuery: (value: string) => void;
  onFilter: (value: Filter) => void;
  onOpen: (chatId: string) => void;
  onOpenResult: (result: SearchResult) => void;
  onStarred: () => void;
  onNew: () => void;
  hidden: boolean;
}) {
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = query.trim();
  const listed = useMemo(() => {
    const lower = term.toLowerCase();
    return chats.filter(item => {
      if (filter === "archived" ? !item.archived : item.archived) return false;
      if (filter === "unread" && !item.unread) return false;
      if (filter === "groups" && item.kind === "direct") return false;
      return !lower || item.title.toLowerCase().includes(lower);
    });
  }, [chats, filter, term]);
  const pinned = !term && filter !== "archived" ? listed.filter(item => item.pinned) : [];
  const rest = listed.filter(item => !pinned.includes(item));
  const totalUnread = chats.filter(item => !item.archived && !item.muted).reduce((sum, item) => sum + item.unread, 0);
  const counts: Record<Filter, number> = { all: 0, unread: chats.filter(item => !item.archived && item.unread).length, groups: 0, archived: chats.filter(item => item.archived).length };
  const row = (item: ChatItem) => <Row key={item.id} item={item} active={item.id === activeId} meId={meId} typer={typingIn(item.id)} now={now} onOpen={() => onOpen(item.id)} />;
  const label = (text: string) => <p className="px-3 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-dim">{text}</p>;

  return (
    <aside className={cn("flex w-full flex-col border-r border-line/80 bg-gradient-to-b from-[#f5f8f1] via-[#fafbf8] to-white md:w-[372px] md:shrink-0", hidden && "hidden md:flex")}>
      <div className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 md:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-1.5">
          <Link href="/app" className="-ml-1.5 mt-0.5 rounded-full p-1.5 text-ink hover:bg-white md:hidden" aria-label="Back to Mohuddle">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[26px] font-bold leading-none tracking-tight text-ink">Chats</h1>
              {totalUnread > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{totalUnread > 99 ? "99+" : totalUnread}</span>}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-mute">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22b26b] opacity-50" />}
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", live ? "bg-[#22b26b]" : "bg-[#e0a43a]")} />
              </span>
              {live ? "Live" : "Reconnecting…"}
            </p>
          </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onStarred} className="grid h-9 w-9 place-items-center rounded-full text-mute transition hover:bg-white hover:text-ink hover:shadow-sm" aria-label="Starred messages" title="Starred messages">
              <Star className="h-[18px] w-[18px]" />
            </button>
            <button type="button" onClick={onNew} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand pl-3 pr-3.5 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(40,107,85,0.8)] transition hover:bg-brand-deep active:scale-[0.97]" title="New chat or group">
              <MessageSquarePlus className="h-4 w-4" /> New
            </button>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2.5 rounded-2xl border border-line/80 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(16,40,32,0.05)] transition focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/10">
          <Search className="h-4 w-4 shrink-0 text-dim" />
          <input ref={search} value={query} onChange={event => onQuery(event.target.value)} onKeyDown={event => event.key === "Escape" && onQuery("")} placeholder="Search chats and messages" aria-label="Search chats and messages" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-dim md:text-[13.5px]" />
          {query ? (
            <button type="button" onClick={() => onQuery("")} className="rounded-full p-0.5 text-mute hover:bg-panel" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-line bg-panel/70 px-1.5 py-px font-sans text-[10.5px] font-semibold text-dim md:inline" title="Press / to search">
              /
            </kbd>
          )}
        </label>

        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-[#e9ede4] p-1" role="tablist" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["groups", "Groups"],
              ["archived", "Archived"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => onFilter(value)}
              className={cn("flex items-center justify-center gap-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition", filter === value ? "bg-white text-ink shadow-[0_1px_3px_rgba(16,40,32,0.14)]" : "text-mute hover:text-ink")}
            >
              {text}
              {counts[value] > 0 && <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", filter === value ? "bg-brand text-white" : "bg-white/70 text-mute")}>{counts[value]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        {pinned.length > 0 && (
          <>
            {label("Pinned")}
            {pinned.map(row)}
            {rest.length > 0 && label("Recent")}
          </>
        )}
        {rest.map(row)}

        {!listed.length && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-brand shadow-[0_8px_24px_-12px_rgba(23,62,53,0.4)]">
              {filter === "archived" ? <Archive className="h-6 w-6" /> : filter === "unread" ? <Inbox className="h-6 w-6" /> : <Search className="h-6 w-6" />}
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">{filter === "unread" ? "You're all caught up" : term ? "No chats by that name" : filter === "archived" ? "Nothing archived" : "No chats here yet"}</p>
            <p className="mt-1 text-[12.5px] text-mute">{filter === "unread" ? "New messages will show up here." : term ? "Messages that match are listed below." : "Start one with New."}</p>
          </div>
        )}

        {results.length > 0 && term.length >= 2 && (
          <div className="mt-2">
            {label(`Messages · ${results.length}`)}
            {results.map(result => (
              <button key={result.id} type="button" onClick={() => onOpenResult(result)} className="block w-full rounded-2xl px-3 py-2.5 text-left transition hover:bg-white hover:shadow-[0_6px_18px_-12px_rgba(23,62,53,0.35)]">
                <span className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate font-semibold text-ink">{result.chatKind === "direct" ? (result.sender ?? "") : result.chatTitle}</span>
                  <span className="shrink-0 tabular-nums text-dim">{whenShort(result.at, now)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-[12.75px] text-mute">
                  {result.chatKind !== "direct" && result.sender ? <span className="font-medium text-ink/70">{result.sender.split(" ")[0]}: </span> : null}
                  <Highlighted text={result.body} term={term} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 border-t border-line/70 px-5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 text-[11px] text-dim">
        <Lock className="h-3 w-3" /> Private to your agency · kept for its records
      </p>
    </aside>
  );
}
