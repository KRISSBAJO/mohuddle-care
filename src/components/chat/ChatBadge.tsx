"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { chatApi, useLiveChat, type LiveEvent } from "./client";

export const UNREAD_EVENT = "mohuddle-chat-unread";

/*
 * The unread count beside Chat in the sidebar, kept live. On the chat page the open chat reports the
 * count; on other pages this listens on its own live connection and asks for the count when news comes.
 */
export function ChatBadge({ initial }: { initial: number }) {
  const pathname = usePathname();
  const onChatPage = pathname.startsWith("/app/chat");
  const [count, setCount] = useState(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setCount(initial);
  }

  const refresh = useCallback(() => {
    chatApi<{ unread: number }>("unread").then(data => setCount(data.unread), () => undefined);
  }, []);
  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (["hello", "message", "receipt", "chats", "members"].includes(event.t)) refresh();
    },
    [refresh],
  );
  useLiveChat(onEvent, !onChatPage);

  useEffect(() => {
    const listen = (event: Event) => setCount((event as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, listen);
    return () => window.removeEventListener(UNREAD_EVENT, listen);
  }, []);

  if (!count) return null;
  return <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-ink">{count > 99 ? "99+" : count}</span>;
}
