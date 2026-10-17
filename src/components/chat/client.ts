"use client";

import { useEffect, useRef, useState } from "react";

/* What the chat API answers (src/server/chat/service.ts), as the browser sees it. */
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
  replyTo: { id: string; kind: string; body: string; senderName: string | null; deleted: boolean } | null;
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  status: "sent" | "delivered" | "read" | null;
};
export type ChatDetail = {
  id: string;
  kind: ChatKind;
  title: string;
  about: string;
  members: { id: string; name: string; role: string; admin: boolean; auto: boolean; online: boolean; lastSeenAt: string | null }[];
  pinned: { id: string; body: string; kind: string; at: string }[];
  me: { muted: boolean; mutedUntil: string | null; archived: boolean; pinned: boolean; admin: boolean };
  can: { post: boolean; manageMembers: boolean; rename: boolean; leave: boolean; export: boolean; attach: boolean; moderate: boolean };
  rules: { editMinutes: number; deleteHours: number };
};
export type Person = { id: string; name: string; role: string; home: string | null; online: boolean };

export class ChatError extends Error {}

/* Calls the website's chat API. Changes carry the header that only this site can add. */
export async function chatApi<T>(path: string, options: { body?: unknown; raw?: Blob; type?: string } = {}): Promise<T> {
  const post = options.body !== undefined || options.raw !== undefined;
  let response: Response;
  try {
    response = await fetch(`/api/chat/${path}`, {
      method: post ? "POST" : "GET",
      headers: { ...(post ? { "x-mohuddle-chat": "1" } : {}), ...(options.raw ? { "content-type": options.type ?? options.raw.type } : post ? { "content-type": "application/json" } : {}) },
      body: options.raw ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ChatError("No connection. Check your internet and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ChatError(data.error ?? "Something went wrong. Try again.");
  return data as T;
}

export type LiveEvent = { t: "hello" | "message" | "update" | "receipt" | "typing" | "chat" | "members" | "chats" | "presence" | "pong"; c?: string; m?: string; u?: string; n?: string; online?: boolean };

/*
 * The live connection to the chat gateway. It reconnects by itself, waiting a little longer each time,
 * and says whether it is live; when it is not, the page checks for news every few seconds instead.
 */
export function useLiveChat(onEvent: (event: LiveEvent) => void) {
  const [live, setLive] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const connect = async () => {
      if (stopped) return;
      try {
        const pass = await chatApi<{ ticket: string; url: string }>("ticket");
        const ws = new WebSocket(`${pass.url}?ticket=${encodeURIComponent(pass.ticket)}`);
        socket.current = ws;
        ws.onopen = () => {
          attempt = 0;
          setLive(true);
          ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "ping" })), 25_000);
        };
        ws.onmessage = message => {
          try {
            handler.current(JSON.parse(String(message.data)) as LiveEvent);
          } catch {
            // Ignore anything that is not an event.
          }
        };
        ws.onclose = () => {
          setLive(false);
          clearInterval(ping);
          socket.current = null;
          retry();
        };
      } catch {
        retry();
      }
    };
    const retry = () => {
      if (stopped) return;
      attempt += 1;
      timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    };
    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      socket.current?.close();
    };
  }, []);

  const typing = (chatId: string) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ t: "typing", c: chatId }));
  };
  return { live, typing };
}

/* Small helpers for the chat screens. */
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

export const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
export const durationText = (ms = 0) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];
export const EMOJIS = ["😀", "😁", "😂", "🙂", "😊", "😍", "🥰", "😘", "😉", "😎", "🤔", "😮", "😢", "😭", "😡", "🙏", "👍", "👎", "👏", "🙌", "💪", "👋", "🤝", "❤️", "💚", "💙", "🔥", "✨", "🎉", "✅", "❌", "⚠️", "⏰", "📅", "💊", "🏠", "🚗", "☕", "🍽️", "📞"];

export const ROLE_NAMES: Record<string, string> = { admin: "Administrator", coordinator: "Coordinator", nurse: "Nurse", dsp: "Direct support" };
