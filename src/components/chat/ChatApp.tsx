"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, BellOff, Check, ChevronDown, Download, Info, Loader2, LogOut, Megaphone, MessageSquarePlus, Pin, Search, Star, UserPlus, Users, Wifi, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dateKey, fmt } from "@/lib/format";
import { chatApi, colorFor, initialsOf, useLiveChat, type ChatDetail, type ChatItem, type LiveEvent, type Message, type Person } from "./client";
import { Composer, type Draft } from "./Composer";
import { MessageBubble, type BubbleActions } from "./MessageBubble";

type Me = { id: string; name: string; role: string };
type Filter = "all" | "unread" | "groups" | "archived";
type SearchResult = { id: string; chatId: string; body: string; at: string; sender: string | null; chatTitle: string; chatKind: string };

/* The avatar for a chat or a person: initials in a colour, or an icon for home groups and Announcements. */
function Avatar({ chat, size = 44, online }: { chat: { id: string; kind: string; title: string }; size?: number; online?: boolean }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="grid h-full w-full place-items-center rounded-full font-semibold text-white" style={{ background: chat.kind === "announcements" ? "#c27c0e" : colorFor(chat.id), fontSize: size * 0.36 }}>
        {chat.kind === "announcements" ? <Megaphone className="h-[45%] w-[45%]" /> : chat.kind === "home" ? <Users className="h-[45%] w-[45%]" /> : initialsOf(chat.title)}
      </span>
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#2bb673]" aria-label="Online" />}
    </span>
  );
}

const dayLabel = (iso: string, now: number) => {
  const day = dateKey(new Date(iso));
  return day === dateKey(new Date(now)) ? "Today" : day === dateKey(new Date(now - 86_400_000)) ? "Yesterday" : fmt.dayLong(day);
};

const whenShort = (iso: string | null, now: number) => {
  if (!iso) return "";
  const at = new Date(iso);
  const age = now - at.getTime();
  if (age < 86_400_000 && new Date(now).getDate() === at.getDate()) return fmt.time(at);
  if (age < 6 * 86_400_000) return at.toLocaleDateString("en-US", { weekday: "short" });
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const lastSeenText = (iso: string | null, now: number) => (iso ? `last seen ${whenShort(iso, now) === fmt.time(new Date(iso)) ? `today at ${fmt.time(new Date(iso))}` : whenShort(iso, now)}` : "not on chat yet");

export function ChatApp({ me, initialChats, initialChat }: { me: Me; initialChats: ChatItem[]; initialChat: string | null }) {
  const [chats, setChats] = useState(initialChats);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialChat);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dialog, setDialog] = useState<"" | "new" | "info" | "forward" | "msginfo" | "starred" | "delete">("");
  const [focus, setFocus] = useState<Message | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [persons, setPersons] = useState<{ id: string; name: string; home: string | null }[]>([]);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const activeRef = useRef(activeId);
  const typedAt = useRef(0);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);
  const fail = (problem: unknown) => setError(problem instanceof Error ? problem.message : "Something went wrong. Try again.");

  /* ---------- Loading ---------- */

  const loadChats = useCallback(async () => {
    try {
      const data = await chatApi<{ chats: ChatItem[] }>("chats");
      setChats(data.chats);
      void chatApi("delivered", { body: {} }).catch(() => undefined);
    } catch (problem) {
      fail(problem);
    }
  }, []);

  const refreshMessages = useCallback(async (chatId: string) => {
    const data = await chatApi<{ messages: Message[]; hasMore: boolean }>(`chats/${chatId}/messages?limit=40`);
    if (activeRef.current !== chatId) return;
    setMessages(current => {
      const latest = new Map(data.messages.map(item => [item.id, item]));
      const older = current.filter(item => !latest.has(item.id) && data.messages.length && item.at < data.messages[0].at);
      return [...older, ...data.messages];
    });
    setHasMore(current => (data.messages.length ? current || data.hasMore : data.hasMore));
  }, []);

  const loadDetail = useCallback(async (chatId: string) => {
    const data = await chatApi<ChatDetail>(`chats/${chatId}`);
    if (activeRef.current === chatId) setDetail(data);
  }, []);

  const markRead = useCallback((chatId: string) => {
    if (document.visibilityState !== "visible") return;
    void chatApi(`chats/${chatId}/read`, { body: {} }).catch(() => undefined);
    setChats(current => current.map(item => (item.id === chatId ? { ...item, unread: 0, mentioned: false } : item)));
  }, []);

  // Opening another chat starts from a clean view; the effect below loads it.
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (activeId !== shownFor) {
    setShownFor(activeId);
    setMessages([]);
    setDetail(null);
    setReplyTo(null);
    setEditing(null);
    setLoading(Boolean(activeId));
  }
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    atBottom.current = true;
    Promise.all([loadDetail(activeId), refreshMessages(activeId)])
      .then(() => !cancelled && markRead(activeId))
      .catch(fail)
      .finally(() => !cancelled && setLoading(false));
    const url = new URL(window.location.href);
    url.searchParams.set("c", activeId);
    window.history.replaceState(null, "", url);
    return () => {
      cancelled = true;
    };
  }, [activeId, loadDetail, refreshMessages, markRead]);

  useEffect(() => {
    void chatApi("delivered", { body: {} }).catch(() => undefined);
    void chatApi<{ persons: typeof persons }>("persons").then(data => setPersons(data.persons), () => undefined);
  }, []);

  // New messages keep the view at the bottom, unless you scrolled up to read.
  useEffect(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    if (!activeId || !messages.length) return;
    const box = scroller.current;
    const before = box?.scrollHeight ?? 0;
    const data = await chatApi<{ messages: Message[]; hasMore: boolean }>(`chats/${activeId}/messages?limit=40&before=${encodeURIComponent(messages[0].at)}`);
    setMessages(current => [...data.messages.filter(item => !current.some(existing => existing.id === item.id)), ...current]);
    setHasMore(data.hasMore);
    requestAnimationFrame(() => {
      if (box) box.scrollTop = box.scrollHeight - before;
    });
  }

  /* ---------- Live updates ---------- */

  const onEvent = useCallback(
    (event: LiveEvent) => {
      const active = activeRef.current;
      if (event.t === "typing" && event.c && event.n) {
        setTyping(current => ({ ...current, [event.c!]: { name: event.n!, until: Date.now() + 4000 } }));
        return;
      }
      if (event.t === "presence" && event.u) {
        setChats(current => current.map(item => (item.other?.id === event.u ? { ...item, other: { ...item.other!, online: Boolean(event.online), lastSeenAt: new Date().toISOString() } } : item)));
        setDetail(current => (current ? { ...current, members: current.members.map(member => (member.id === event.u ? { ...member, online: Boolean(event.online), lastSeenAt: new Date().toISOString() } : member)) } : current));
        return;
      }
      if (event.t === "message" || event.t === "chat" || event.t === "chats" || event.t === "members") void loadChats();
      if (event.c && event.c === active) {
        if (event.t === "message") {
          setTyping(current => ({ ...current, [event.c!]: { name: "", until: 0 } }));
          void refreshMessages(event.c).then(() => markRead(event.c!));
        }
        if (event.t === "update" || event.t === "receipt") void refreshMessages(event.c);
        if (event.t === "chat" || event.t === "members") {
          void loadDetail(event.c);
          void refreshMessages(event.c);
        }
      }
      if (event.t === "hello") {
        void loadChats();
        if (active) void refreshMessages(active);
      }
    },
    [loadChats, refreshMessages, loadDetail, markRead],
  );
  const { live, typing: sendTyping } = useLiveChat(onEvent);

  // Without a live connection, check for news every few seconds instead.
  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => {
      void loadChats();
      if (activeRef.current) void refreshMessages(activeRef.current);
    }, 6000);
    return () => clearInterval(timer);
  }, [live, loadChats, refreshMessages]);

  useEffect(() => {
    const onFocus = () => activeRef.current && markRead(activeRef.current);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  // Message search across all your chats, as you type.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      chatApi<{ results: SearchResult[] }>(`search?q=${encodeURIComponent(query.trim())}`).then(data => setResults(data.results), () => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  /* ---------- Actions ---------- */

  const active = chats.find(item => item.id === activeId) ?? null;
  const group = detail ? detail.kind !== "direct" : false;
  const jump = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(messageId);
    setTimeout(() => setHighlight(null), 1600);
  };

  async function send(draft: Draft) {
    if (!activeId) return;
    try {
      atBottom.current = true;
      const result = await chatApi<{ message: Message }>(`chats/${activeId}/messages`, { body: { ...draft, replyToId: replyTo?.id ?? null } });
      setMessages(current => (current.some(item => item.id === result.message.id) ? current : [...current, result.message]));
      setReplyTo(null);
      void loadChats();
    } catch (problem) {
      fail(problem);
      throw problem;
    }
  }

  async function upload(blob: Blob, params: Record<string, string>) {
    if (!activeId) return;
    try {
      atBottom.current = true;
      const query = new URLSearchParams({ ...params, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      const result = await chatApi<{ message: Message }>(`chats/${activeId}/attachments?${query}`, { raw: blob, type: blob.type || "application/octet-stream" });
      setMessages(current => [...current.filter(item => item.id !== result.message.id), result.message]);
      setReplyTo(null);
      void loadChats();
    } catch (problem) {
      fail(problem);
    }
  }

  const reload = async (withDetail = false) => {
    if (!activeId) return;
    await Promise.all([refreshMessages(activeId), withDetail ? loadDetail(activeId) : undefined]);
  };

  const actions: BubbleActions = {
    reply: message => {
      setEditing(null);
      setReplyTo(message);
    },
    react: (message, emoji) => void chatApi(`messages/${message.id}/react`, { body: { emoji } }).then(() => reload(), fail),
    forward: message => {
      setFocus(message);
      setDialog("forward");
    },
    star: message => void chatApi(`messages/${message.id}/star`, { body: { starred: !message.starred } }).then(() => reload(), fail),
    pin: message => void chatApi(`messages/${message.id}/pin`, { body: { pinned: !message.pinned } }).then(() => reload(true), fail),
    edit: message => {
      setReplyTo(null);
      setEditing(message);
    },
    remove: message => {
      setFocus(message);
      setDialog("delete");
    },
    info: message => {
      setFocus(message);
      setDialog("msginfo");
    },
    jump,
  };

  async function startDirect(person: Person) {
    try {
      const result = await chatApi<{ chatId: string }>("chats", { body: { kind: "direct", userId: person.id } });
      setDialog("");
      await loadChats();
      setActiveId(result.chatId);
    } catch (problem) {
      fail(problem);
    }
  }

  async function preferences(body: object) {
    if (!activeId) return;
    try {
      await chatApi(`chats/${activeId}/preferences`, { body });
      await Promise.all([loadChats(), loadDetail(activeId)]);
    } catch (problem) {
      fail(problem);
    }
  }

  const openPeople = async () => {
    if (!people) setPeople((await chatApi<{ people: Person[] }>("people")).people);
  };

  /* ---------- What to show ---------- */

  const listed = useMemo(() => {
    const term = query.trim().toLowerCase();
    return chats.filter(item => {
      if (filter === "archived" ? !item.archived : item.archived) return false;
      if (filter === "unread" && !item.unread) return false;
      if (filter === "groups" && item.kind === "direct") return false;
      return !term || item.title.toLowerCase().includes(term);
    });
  }, [chats, filter, query]);
  const archivedCount = chats.filter(item => item.archived).length;
  const typingIn = (chatId: string) => (typing[chatId] && typing[chatId].until > now && typing[chatId].name ? typing[chatId].name : "");
  const headerLine = !detail
    ? ""
    : typingIn(detail.id)
      ? `${group ? `${typingIn(detail.id)} is ` : ""}typing…`
      : detail.kind === "direct"
        ? (() => {
            const other = detail.members.find(member => member.id !== me.id);
            return other?.online ? "online" : lastSeenText(other?.lastSeenAt ?? null, now);
          })()
        : detail.members.map(member => (member.id === me.id ? "You" : member.name.split(" ")[0])).slice(0, 8).join(", ") + (detail.members.length > 8 ? ` and ${detail.members.length - 8} more` : "");

  return (
    <div className="chat-shell flex h-[calc(100dvh-150px)] min-h-[520px] overflow-hidden rounded-3xl border border-line bg-white shadow-[0_20px_60px_-30px_rgba(23,62,53,0.35)]">
      {/* The list */}
      <aside className={cn("flex w-full flex-col border-r border-line md:w-[360px] md:shrink-0", activeId && "hidden md:flex")}>
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Chats</h1>
            <p className={cn("mt-0.5 flex items-center gap-1.5 text-[11.5px]", live ? "text-sage" : "text-mute")}>
              {live ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} {live ? "Live" : "Connecting…"}
            </p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setDialog("starred")} className="rounded-full p-2.5 text-mute hover:bg-panel hover:text-ink" aria-label="Starred messages" title="Starred messages">
              <Star className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => { void openPeople(); setDialog("new"); }} className="rounded-full bg-brand p-2.5 text-white shadow-md hover:bg-brand-deep" aria-label="New chat" title="New chat">
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="px-4">
          <label className="flex items-center gap-2 rounded-full bg-panel px-4 py-2.5">
            <Search className="h-4 w-4 text-mute" />
            <input value={query} onChange={event => { setQuery(event.target.value); if (event.target.value.trim().length < 2) setResults([]); }} placeholder="Search chats and messages" aria-label="Search chats and messages" className="flex-1 bg-transparent text-sm outline-none placeholder:text-dim" />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setResults([]); }} aria-label="Clear search">
                <X className="h-4 w-4 text-mute" />
              </button>
            )}
          </label>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ["all", "All"],
                ["unread", "Unread"],
                ["groups", "Groups"],
                ["archived", `Archived${archivedCount ? ` (${archivedCount})` : ""}`],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition", filter === value ? "bg-[#e3efd0] text-brand-deep" : "bg-panel text-mute hover:text-ink")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3">
          {listed.map(item => {
            const typer = typingIn(item.id);
            const last = item.lastMessage;
            const preview = typer
              ? `${item.kind === "direct" ? "" : `${typer} is `}typing…`
              : !last
                ? item.kind === "home"
                  ? "Your home's group"
                  : item.kind === "announcements"
                    ? "News from the office"
                    : "Say hello"
                : last.deleted
                  ? "This message was deleted"
                  : `${last.senderId === me.id ? "You: " : item.kind !== "direct" && last.senderName ? `${last.senderName.split(" ")[0]}: ` : ""}${last.body || (last.kind === "image" ? "📷 Photo" : last.kind === "voice" ? "🎤 Voice note" : last.kind === "file" ? "📄 File" : "")}`;
            return (
              <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition", item.id === activeId ? "bg-[#eef4e6]" : "hover:bg-panel/70")}>
                <Avatar chat={item} online={item.other?.online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">{item.title}</span>
                    <span className={cn("shrink-0 text-[11.5px]", item.unread ? "font-semibold text-brand" : "text-dim")}>{whenShort(item.lastMessageAt, now)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={cn("truncate text-[13px]", typer ? "font-semibold text-brand" : "text-mute")}>{preview}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.muted && <BellOff className="h-3.5 w-3.5 text-dim" aria-label="Muted" />}
                      {item.pinned && <Pin className="h-3.5 w-3.5 text-dim" aria-label="Pinned" />}
                      {item.mentioned && <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">@</span>}
                      {item.unread > 0 && <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white", item.muted ? "bg-dim" : "bg-brand")}>{item.unread > 99 ? "99+" : item.unread}</span>}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
          {!listed.length && <p className="px-4 py-8 text-center text-sm text-mute">{filter === "unread" ? "You're all caught up." : query ? "No chats by that name." : "No chats here yet."}</p>}
          {results.length > 0 && query.trim().length >= 2 && (
            <div className="mt-3">
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-dim">Messages</p>
              {results.map(result => (
                <button key={result.id} type="button" onClick={() => { setActiveId(result.chatId); setTimeout(() => jump(result.id), 700); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-panel/70">
                  <span className="flex justify-between text-[12px] text-mute">
                    <span className="truncate font-semibold text-ink">{result.chatKind === "direct" ? (result.sender ?? "") : result.chatTitle}</span>
                    <span>{whenShort(result.at, now)}</span>
                  </span>
                  <span className="line-clamp-2 text-[13px] text-mute">{result.body}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* The conversation */}
      <section className={cn("chat-wallpaper relative flex min-w-0 flex-1 flex-col", !activeId && "hidden md:flex")}>
        {!activeId || !active ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-brand text-accent shadow-lg">
              <MessageSquarePlus className="h-9 w-9" />
            </div>
            <h2 className="mt-5 font-display text-xl font-bold">Mohuddle chat</h2>
            <p className="mt-2 text-sm text-mute">Message anyone in your agency, your home&apos;s group, or the whole team. Messages are kept for your agency&apos;s records.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line bg-white/90 px-3 py-2.5 backdrop-blur sm:px-4">
              <button type="button" onClick={() => setActiveId(null)} className="rounded-full p-2 text-mute hover:bg-panel md:hidden" aria-label="Back to chats">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setDialog(dialog === "info" ? "" : "info")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar chat={active} size={40} online={active.other?.online} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{detail?.title ?? active.title}</span>
                  <span className={cn("block truncate text-[12.5px]", typingIn(active.id) ? "font-semibold text-brand" : "text-mute")}>{headerLine}</span>
                </span>
              </button>
              <button type="button" onClick={() => setDialog(dialog === "info" ? "" : "info")} className="rounded-full p-2.5 text-mute hover:bg-panel hover:text-ink" aria-label="Chat info">
                <Info className="h-5 w-5" />
              </button>
            </header>
            {detail && detail.pinned.length > 0 && (
              <button type="button" onClick={() => jump(detail.pinned[0].id)} className="flex items-center gap-3 border-b border-line bg-white/80 px-4 py-2 text-left text-[13px] backdrop-blur">
                <Pin className="h-4 w-4 shrink-0 text-brand" />
                <span className="truncate">{detail.pinned[0].body || (detail.pinned[0].kind === "image" ? "Photo" : "Pinned message")}</span>
                {detail.pinned.length > 1 && <span className="ml-auto shrink-0 text-xs text-mute">+{detail.pinned.length - 1}</span>}
              </button>
            )}
            <div
              ref={scroller}
              onScroll={event => {
                const box = event.currentTarget;
                atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
                setShowJump(!atBottom.current);
              }}
              className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6"
            >
              {hasMore && (
                <div className="flex justify-center pb-2">
                  <button type="button" onClick={() => void loadOlder()} className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-brand shadow-sm">
                    Earlier messages
                  </button>
                </div>
              )}
              {loading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              )}
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const newDay = !previous || dayLabel(previous.at, now) !== dayLabel(message.at, now);
                const mine = message.sender?.id === me.id;
                const age = now - new Date(message.at).getTime();
                return (
                  <div key={message.id}>
                    {newDay && (
                      <div className="sticky top-1 z-[5] my-3 flex justify-center">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[11.5px] font-semibold text-mute shadow-sm">{dayLabel(message.at, now)}</span>
                      </div>
                    )}
                    <MessageBubble
                      message={message}
                      mine={mine}
                      group={group}
                      showSender={!previous || previous.sender?.id !== message.sender?.id || newDay || previous.kind === "system"}
                      canEdit={mine && message.kind !== "system" && !message.deleted && Boolean(detail) && age <= (detail?.rules.editMinutes ?? 0) * 60_000}
                      canDeleteForAll={Boolean(detail) && ((mine && age <= (detail?.rules.deleteHours ?? 0) * 3_600_000) || Boolean(detail?.can.moderate))}
                      canPin={Boolean(detail) && (detail!.kind === "direct" || detail!.me.admin || detail!.can.moderate)}
                      actions={actions}
                      highlighted={highlight === message.id}
                    />
                  </div>
                );
              })}
              {typingIn(activeId) && (
                <div className="flex px-1">
                  <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm" aria-label={`${typingIn(activeId)} is typing`}>
                    <span className="chat-dot" />
                    <span className="chat-dot [animation-delay:150ms]" />
                    <span className="chat-dot [animation-delay:300ms]" />
                  </span>
                </div>
              )}
            </div>
            {showJump && messages.length > 0 && (
              <button type="button" onClick={() => { const box = scroller.current; if (box) box.scrollTop = box.scrollHeight; atBottom.current = true; setShowJump(false); }} className="absolute bottom-24 right-6 grid h-10 w-10 place-items-center rounded-full bg-white text-mute shadow-lg" aria-label="Jump to the latest">
                <ChevronDown className="h-5 w-5" />
              </button>
            )}
            {detail && (
              <Composer
                key={detail.id}
                detail={detail}
                replyTo={replyTo}
                editing={editing}
                persons={persons}
                onCancelReply={() => setReplyTo(null)}
                onCancelEdit={() => setEditing(null)}
                onSend={send}
                onSaveEdit={async body => {
                  if (!editing) return;
                  try {
                    await chatApi(`messages/${editing.id}/edit`, { body: { body } });
                    setEditing(null);
                    await refreshMessages(detail.id);
                  } catch (problem) {
                    fail(problem);
                    throw problem;
                  }
                }}
                onAttach={(file, caption) => upload(file, { name: file.name, ...(caption ? { caption } : {}) })}
                onVoice={(audio, durationMs) => upload(audio, { voice: "1", name: "Voice note", durationMs: String(durationMs) })}
                onTyping={() => {
                  if (Date.now() - typedAt.current > 2500) {
                    typedAt.current = Date.now();
                    sendTyping(detail.id);
                  }
                }}
              />
            )}
          </>
        )}
        {error && (
          <div className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-xl" role="alert">
            {error}
            <button type="button" onClick={() => setError("")} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      {/* Chat info */}
      {dialog === "info" && detail && (
        <ChatInfo
          detail={detail}
          me={me}
          onClose={() => setDialog("")}
          onPreferences={preferences}
          onChanged={async () => {
            await Promise.all([loadChats(), loadDetail(detail.id)]);
          }}
          onLeft={async () => {
            setDialog("");
            setActiveId(null);
            await loadChats();
          }}
          people={people}
          loadPeople={openPeople}
          fail={fail}
          now={now}
        />
      )}

      {dialog === "new" && <NewChat people={people} onClose={() => setDialog("")} onPerson={startDirect} onGroup={async (title, members) => {
        try {
          const result = await chatApi<{ chatId: string }>("chats", { body: { kind: "group", title, members } });
          setDialog("");
          await loadChats();
          setActiveId(result.chatId);
        } catch (problem) {
          fail(problem);
        }
      }} />}

      {dialog === "forward" && focus && (
        <Modal title="Forward to" onClose={() => setDialog("")}>
          <ForwardPicker
            chats={chats.filter(item => !item.archived)}
            onSend={async targets => {
              try {
                for (const target of targets) await chatApi(`chats/${target}/messages`, { body: { forwardOf: focus.id } });
                setDialog("");
                await loadChats();
              } catch (problem) {
                fail(problem);
              }
            }}
          />
        </Modal>
      )}

      {dialog === "delete" && focus && detail && (
        <Modal title="Delete message?" onClose={() => setDialog("")}>
          <div className="grid gap-2 p-5">
            {(focus.sender?.id === me.id && now - new Date(focus.at).getTime() <= detail.rules.deleteHours * 3_600_000) || detail.can.moderate ? (
              <button type="button" onClick={() => void chatApi(`messages/${focus.id}/delete`, { body: { scope: "everyone" } }).then(() => { setDialog(""); return refreshMessages(detail.id); }, fail)} className="btn-ghost justify-center text-flag">
                Delete for everyone
              </button>
            ) : null}
            <button type="button" onClick={() => void chatApi(`messages/${focus.id}/delete`, { body: { scope: "me" } }).then(() => { setDialog(""); setMessages(current => current.filter(item => item.id !== focus.id)); }, fail)} className="btn-ghost justify-center">
              Delete for me
            </button>
            <p className="pt-1 text-center text-xs text-mute">A copy is kept for your agency&apos;s records.</p>
          </div>
        </Modal>
      )}

      {dialog === "msginfo" && focus && <MessageInfo message={focus} onClose={() => setDialog("")} />}
      {dialog === "starred" && <Starred onClose={() => setDialog("")} onOpen={(chatId, messageId) => { setDialog(""); setActiveId(chatId); setTimeout(() => jump(messageId), 700); }} now={now} />}
    </div>
  );
}

/* ---------- Dialogs ---------- */

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className={cn("flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl", wide ? "max-w-lg" : "max-w-md")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-mute hover:bg-panel" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function PersonRow({ person, onClick, selected }: { person: Person; onClick: () => void; selected?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel/70", selected && "bg-[#eef4e6]")}>
      <Avatar chat={{ id: person.id, kind: "direct", title: person.name }} size={38} online={person.online} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{person.name}</span>
        <span className="block truncate text-xs capitalize text-mute">
          {person.role}
          {person.home ? ` · ${person.home}` : ""}
        </span>
      </span>
      {selected !== undefined && <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2", selected ? "border-brand bg-brand text-white" : "border-line")}>{selected && <Check className="h-3 w-3" />}</span>}
    </button>
  );
}

function NewChat({ people, onClose, onPerson, onGroup }: { people: Person[] | null; onClose: () => void; onPerson: (person: Person) => void; onGroup: (title: string, members: string[]) => Promise<void> }) {
  const [mode, setMode] = useState<"person" | "group">("person");
  const [term, setTerm] = useState("");
  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = (people ?? []).filter(person => person.name.toLowerCase().includes(term.toLowerCase()));
  return (
    <Modal title={mode === "person" ? "New chat" : "New group"} onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="flex gap-1 rounded-full bg-panel p-1">
          {(["person", "group"] as const).map(value => (
            <button key={value} type="button" onClick={() => setMode(value)} className={cn("flex-1 rounded-full py-1.5 text-sm font-semibold", mode === value ? "bg-white shadow-sm" : "text-mute")}>
              {value === "person" ? "One person" : "Group"}
            </button>
          ))}
        </div>
        {mode === "group" && <input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder="Group name" aria-label="Group name" className="field" />}
        <input value={term} onChange={event => setTerm(event.target.value)} placeholder="Search people" aria-label="Search people" className="field" />
        <div className="max-h-[45dvh] overflow-y-auto">
          {!people && <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-brand" />}
          {list.map(person => (
            <PersonRow key={person.id} person={person} selected={mode === "group" ? chosen.includes(person.id) : undefined} onClick={() => (mode === "person" ? onPerson(person) : setChosen(current => (current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])))} />
          ))}
        </div>
        {mode === "group" && (
          <button
            type="button"
            disabled={busy || title.trim().length < 2 || !chosen.length}
            onClick={async () => {
              setBusy(true);
              await onGroup(title, chosen);
              setBusy(false);
            }}
            className="btn-brand w-full justify-center disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Create group with {chosen.length} {chosen.length === 1 ? "person" : "people"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function ForwardPicker({ chats, onSend }: { chats: ChatItem[]; onSend: (targets: string[]) => Promise<void> }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="p-3">
      <div className="max-h-[50dvh] overflow-y-auto">
        {chats.map(chat => (
          <button key={chat.id} type="button" onClick={() => setChosen(current => (current.includes(chat.id) ? current.filter(id => id !== chat.id) : [...current, chat.id]))} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-panel/70", chosen.includes(chat.id) && "bg-[#eef4e6]")}>
            <Avatar chat={chat} size={36} />
            <span className="flex-1 truncate font-semibold">{chat.title}</span>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2", chosen.includes(chat.id) ? "border-brand bg-brand text-white" : "border-line")}>{chosen.includes(chat.id) && <Check className="h-3 w-3" />}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={!chosen.length || busy} onClick={async () => { setBusy(true); await onSend(chosen); setBusy(false); }} className="btn-brand mt-3 w-full justify-center disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Forward{chosen.length ? ` to ${chosen.length}` : ""}
      </button>
    </div>
  );
}

function MessageInfo({ message, onClose }: { message: Message; onClose: () => void }) {
  const [info, setInfo] = useState<{ readBy: { id: string; name: string; at: string }[]; deliveredTo: { id: string; name: string; at: string }[]; waiting: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    void chatApi<NonNullable<typeof info>>(`messages/${message.id}/info`).then(setInfo, () => undefined);
  }, [message.id]);
  const section = (title: string, rows: { id: string; name: string; at?: string }[], tone: string) =>
    rows.length > 0 && (
      <div className="px-5 py-3">
        <p className={cn("mb-1 text-[11px] font-bold uppercase tracking-wider", tone)}>{title}</p>
        {rows.map(row => (
          <p key={row.id} className="flex justify-between py-1 text-sm">
            <span>{row.name}</span>
            {row.at && <span className="text-mute">{fmt.dateTime(new Date(row.at))}</span>}
          </p>
        ))}
      </div>
    );
  return (
    <Modal title="Message info" onClose={onClose}>
      <p className="mx-5 mt-4 line-clamp-3 rounded-xl bg-panel px-3 py-2 text-sm">{message.body || message.attachment?.name || "Message"}</p>
      {!info ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-brand" /> : (
        <div className="pb-3">
          {section("Read by", info.readBy, "text-sage")}
          {section("Delivered to", info.deliveredTo, "text-mute")}
          {section("Not received yet", info.waiting, "text-dim")}
        </div>
      )}
    </Modal>
  );
}

function Starred({ onClose, onOpen, now }: { onClose: () => void; onOpen: (chatId: string, messageId: string) => void; now: number }) {
  const [rows, setRows] = useState<{ id: string; chatId: string; body: string; kind: string; at: string; sender: string | null; chatTitle: string }[] | null>(null);
  useEffect(() => {
    void chatApi<{ messages: NonNullable<typeof rows> }>("starred").then(data => setRows(data.messages), () => setRows([]));
  }, []);
  return (
    <Modal title="Starred messages" onClose={onClose} wide>
      {!rows ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-brand" /> : !rows.length ? <p className="p-6 text-center text-sm text-mute">Star a message to find it quickly here.</p> : (
        <div className="divide-y divide-line">
          {rows.map(row => (
            <button key={row.id} type="button" onClick={() => onOpen(row.chatId, row.id)} className="block w-full px-5 py-3 text-left hover:bg-panel/60">
              <span className="flex justify-between text-xs text-mute">
                <span className="font-semibold text-ink">{row.sender ?? "Former colleague"} · {row.chatTitle || "Direct chat"}</span>
                <span>{whenShort(row.at, now)}</span>
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm">{row.body || (row.kind === "image" ? "📷 Photo" : row.kind === "voice" ? "🎤 Voice note" : "📄 File")}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ChatInfo({
  detail,
  me,
  onClose,
  onPreferences,
  onChanged,
  onLeft,
  people,
  loadPeople,
  fail,
  now,
}: {
  detail: ChatDetail;
  me: Me;
  onClose: () => void;
  onPreferences: (body: object) => Promise<void>;
  onChanged: () => Promise<void>;
  onLeft: () => Promise<void>;
  people: Person[] | null;
  loadPeople: () => Promise<void>;
  fail: (problem: unknown) => void;
  now: number;
}) {
  const [title, setTitle] = useState(detail.title);
  const [about, setAbout] = useState(detail.about);
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const change = async (path: string, body: object) => {
    try {
      await chatApi(`chats/${detail.id}/${path}`, { body });
      await onChanged();
    } catch (problem) {
      fail(problem);
    }
  };
  const candidates = (people ?? []).filter(person => !detail.members.some(member => member.id === person.id) && person.name.toLowerCase().includes(term.toLowerCase()));
  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-white shadow-2xl sm:w-[360px] lg:static lg:shadow-none">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-mute hover:bg-panel" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-semibold">{detail.kind === "direct" ? "Contact info" : "Group info"}</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-5 py-6 text-center">
          <Avatar chat={detail} size={84} />
          {detail.can.rename ? (
            <>
              <input value={title} onChange={event => setTitle(event.target.value)} onBlur={() => title.trim() !== detail.title && void change("group", { title })} maxLength={80} aria-label="Group name" className="mt-4 w-full rounded-lg bg-transparent text-center font-display text-xl font-bold outline-none focus:bg-panel" />
              <textarea value={about} onChange={event => setAbout(event.target.value)} onBlur={() => about !== detail.about && void change("group", { about })} rows={2} maxLength={500} placeholder="Add a description" aria-label="Group description" className="mt-1 w-full resize-none rounded-lg bg-transparent text-center text-sm text-mute outline-none focus:bg-panel" />
            </>
          ) : (
            <>
              <p className="mt-4 font-display text-xl font-bold">{detail.title}</p>
              {detail.about && <p className="mt-1 text-sm text-mute">{detail.about}</p>}
            </>
          )}
          <p className="mt-1 text-xs text-dim">{detail.kind === "direct" ? "" : `${detail.members.length} members`}</p>
        </div>

        <div className="space-y-1 border-y border-line px-3 py-2">
          <p className="px-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-dim">Notifications</p>
          {detail.me.muted ? (
            <button type="button" onClick={() => void onPreferences({ mutedHours: null })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-panel/70">
              <BellOff className="h-4 w-4 text-mute" /> Unmute <span className="ml-auto text-xs text-mute">until {fmt.dateTime(new Date(detail.me.mutedUntil!))}</span>
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {(
                [
                  [8, "Mute 8 hours"],
                  [168, "1 week"],
                  [24 * 365 * 10, "Always"],
                ] as const
              ).map(([hours, label]) => (
                <button key={hours} type="button" onClick={() => void onPreferences({ mutedHours: hours })} className="rounded-full bg-panel px-3 py-1.5 text-xs font-semibold text-mute hover:text-ink">
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => void onPreferences({ pinned: !detail.me.pinned })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-panel/70">
            <Pin className="h-4 w-4 text-mute" /> {detail.me.pinned ? "Unpin chat" : "Pin chat to the top"}
          </button>
          <button type="button" onClick={() => void onPreferences({ archived: !detail.me.archived })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-panel/70">
            <Archive className="h-4 w-4 text-mute" /> {detail.me.archived ? "Unarchive chat" : "Archive chat"}
          </button>
          {detail.can.export && (
            <a href={`/api/chat/chats/${detail.id}/export`} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-panel/70">
              <Download className="h-4 w-4 text-mute" /> Export chat for records <span className="ml-auto text-[11px] text-dim">logged</span>
            </a>
          )}
        </div>

        {detail.kind !== "direct" && (
          <div className="px-3 py-3">
            <div className="flex items-center justify-between px-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-dim">{detail.members.length} members</p>
              {detail.can.manageMembers && (
                <button type="button" onClick={() => { void loadPeople(); setAdding(!adding); }} className="flex items-center gap-1 text-xs font-semibold text-brand">
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>
            {adding && (
              <div className="mt-2 rounded-2xl bg-panel/60 p-2">
                <input value={term} onChange={event => setTerm(event.target.value)} placeholder="Search people" aria-label="Search people to add" className="field mb-1 py-2 text-sm" />
                <div className="max-h-48 overflow-y-auto">
                  {candidates.map(person => (
                    <PersonRow key={person.id} person={person} onClick={() => void change("members", { add: [person.id] })} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-1">
              {detail.members.map(member => (
                <div key={member.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-panel/60">
                  <Avatar chat={{ id: member.id, kind: "direct", title: member.name }} size={36} online={member.online} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{member.id === me.id ? "You" : member.name}</span>
                    <span className="block truncate text-xs text-mute">{member.online ? "online" : lastSeenText(member.lastSeenAt, now)}</span>
                  </span>
                  {member.admin && <span className="rounded-full bg-sky px-2 py-0.5 text-[10.5px] font-semibold text-brand-deep">Admin</span>}
                  {detail.can.manageMembers && member.id !== me.id && !member.auto && (
                    <button type="button" onClick={() => void change("members", { remove: [member.id] })} className="hidden rounded-full p-1 text-mute hover:bg-flag-soft hover:text-flag group-hover:block" aria-label={`Remove ${member.name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {detail.can.leave && (
          <div className="border-t border-line p-3">
            <button type="button" onClick={async () => { try { await chatApi(`chats/${detail.id}/members`, { body: { leave: true } }); await onLeft(); } catch (problem) { fail(problem); } }} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-flag hover:bg-flag-soft/50">
              <LogOut className="h-4 w-4" /> Leave group
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
