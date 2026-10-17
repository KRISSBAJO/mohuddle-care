import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useSession } from "./session";

/* Chat on the phone: the same API as the website (/api/v1/chat/...), and one live connection for the app. */

export type ChatKind = "direct" | "group" | "home" | "announcements";
export type ChatItem = {
  id: string;
  kind: ChatKind;
  title: string;
  other: { id: string; name: string; online: boolean; lastSeenAt: string | null } | null;
  members: number;
  lastMessage: { id: string; kind: string; body: string; senderId: string | null; senderName: string | null; deleted: boolean; at: string } | null;
  unread: number;
  mentioned: boolean;
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  lastMessageAt: string | null;
};
export type Message = {
  id: string;
  chatId: string;
  kind: string;
  body: string;
  sender: { id: string; name: string } | null;
  at: string;
  editedAt: string | null;
  deleted: boolean;
  forwarded: boolean;
  pinned: boolean;
  starred: boolean;
  mentions: string[];
  person: { id: string; name: string } | null;
  attachment: { name: string; contentType: string; size: number; durationMs?: number } | null;
  // chat: the group a privately answered message came from.
  replyTo: { id: string; kind: string; body: string; senderName: string | null; deleted: boolean; chat: { id: string; title: string } | null } | null;
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  status: "sent" | "delivered" | "read" | null;
  poll: Poll | null;
};
export type Poll = { options: { id: string; text: string; votes: number; mine: boolean; voters: string[] }[]; multiple: boolean; closed: boolean; voters: number };
export type ChatDetail = {
  id: string;
  kind: ChatKind;
  title: string;
  about: string;
  members: Member[];
  pinned: { id: string; body: string; kind: string; at: string }[];
  me: { muted: boolean; mutedUntil: string | null; archived: boolean; pinned: boolean; admin: boolean; readUpTo: string };
  can: { post: boolean; manageMembers: boolean; rename: boolean; leave: boolean; export: boolean; attach: boolean; moderate: boolean; mentionAll: boolean; poll: boolean };
  rules: { editMinutes: number; deleteHours: number };
};
export type Member = { id: string; name: string; role: string; home: string | null; admin: boolean; auto: boolean; online: boolean; lastSeenAt: string | null };
export type Person = { id: string; name: string; role: string; home: string | null; online: boolean };
export type LiveEvent = { t: string; c?: string; m?: string; u?: string; n?: string; online?: boolean };

type Live = { live: boolean; unread: number; subscribe: (handler: (event: LiveEvent) => void) => () => void; typing: (chatId: string) => void; refreshUnread: () => void };
const ChatContext = createContext<Live | null>(null);

/*
 * Keeps one WebSocket open to the chat gateway while someone is signed in, reconnecting by itself and
 * after the app comes back to the front. Screens listen with useChatEvents; the tab badge reads unread.
 */
export function ChatLiveProvider({ children }: { children: React.ReactNode }) {
  const { call, me, status } = useSession();
  const enabled = status === "ready" && Boolean(me?.user);
  const [live, setLive] = useState(false);
  const [unread, setUnread] = useState(0);
  const handlers = useRef(new Set<(event: LiveEvent) => void>());
  const socket = useRef<WebSocket | null>(null);

  const refreshUnread = useCallback(() => {
    call<{ unread: number }>("/chat/unread").then(
      data => setUnread(data.unread),
      () => undefined,
    );
  }, [call]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const connect = async () => {
      if (stopped || socket.current) return;
      try {
        const pass = await call<{ ticket: string; url: string }>("/chat/ticket");
        const ws = new WebSocket(`${pass.url}?ticket=${encodeURIComponent(pass.ticket)}`);
        socket.current = ws;
        ws.onopen = () => {
          attempt = 0;
          setLive(true);
          ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "ping" })), 25_000);
        };
        ws.onmessage = message => {
          let event: LiveEvent;
          try {
            event = JSON.parse(String(message.data));
          } catch {
            return;
          }
          if (event.t === "message" || event.t === "hello" || event.t === "chats" || event.t === "members") refreshUnread();
          handlers.current.forEach(handler => handler(event));
        };
        ws.onclose = () => {
          setLive(false);
          clearInterval(ping);
          socket.current = null;
          if (!stopped) retry();
        };
      } catch {
        socket.current = null;
        retry();
      }
    };
    const retry = () => {
      attempt += 1;
      clearTimeout(timer);
      timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    };
    void connect();
    refreshUnread();
    // Phones close connections in the background; coming back reconnects at once.
    const watcher = AppState.addEventListener("change", state => {
      if (state === "active") {
        attempt = 0;
        void connect();
        refreshUnread();
      }
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      watcher.remove();
      socket.current?.close();
      socket.current = null;
    };
  }, [enabled, call, refreshUnread]);

  const subscribe = useCallback((handler: (event: LiveEvent) => void) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);
  const typing = useCallback((chatId: string) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ t: "typing", c: chatId }));
  }, []);

  return <ChatContext.Provider value={{ live, unread, subscribe, typing, refreshUnread }}>{children}</ChatContext.Provider>;
}

export function useChatLive() {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChatLive outside ChatLiveProvider");
  return value;
}

/* Runs the handler for every live event while the screen is mounted. */
export function useChatEvents(handler: (event: LiveEvent) => void) {
  const { subscribe } = useChatLive();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);
  useEffect(() => subscribe(event => latest.current(event)), [subscribe]);
}

/* The chat the person is looking at, so a notification for it is not shown on top of it. */
export const activeChat = { id: null as string | null };

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const AVATAR_COLORS = ["#286b55", "#6b5b95", "#b4612a", "#1f6f8b", "#8a4d76", "#4f7a28", "#a33d55", "#3d5a99"];
export const colorFor = (id: string) => AVATAR_COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_COLORS.length];
export const durationText = (ms = 0) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;
export const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];
export const previewOf = (kind: string, body: string) => (kind === "poll" ? `📊 ${body}` : body || (kind === "image" ? "📷 Photo" : kind === "voice" ? "🎤 Voice note" : kind === "file" ? "📄 File" : ""));

/* A group message being answered privately, handed to the one-to-one chat as it opens. */
export const carriedReply = { chatId: null as string | null, message: null as Message | null };

export const ROLE_NAMES: Record<string, string> = { admin: "Administrator", coordinator: "Coordinator", nurse: "Nurse", dsp: "Direct support" };
