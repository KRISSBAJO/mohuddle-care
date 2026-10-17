"use client";

import { Megaphone, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { colorFor, initialsOf } from "./client";

/*
 * The avatar for a chat or a person: initials on a soft gradient of their colour, or an icon for home
 * groups and Announcements. A green dot when they are online; a ring when the chat has unread messages.
 */
export function Avatar({ chat, size = 44, online, ring }: { chat: { id: string; kind: string; title: string }; size?: number; online?: boolean; ring?: boolean }) {
  const base = chat.kind === "announcements" ? "#c27c0e" : colorFor(chat.id);
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className={cn("grid h-full w-full place-items-center rounded-full font-semibold tracking-wide text-white shadow-[inset_0_-2px_6px_rgba(0,0,0,0.12)]", ring && "ring-2 ring-brand/30 ring-offset-2 ring-offset-white")}
        style={{ background: `linear-gradient(140deg, ${base}d9 0%, ${base} 55%, ${base} 100%)`, fontSize: size * 0.36 }}
      >
        {chat.kind === "announcements" ? <Megaphone className="h-[44%] w-[44%]" /> : chat.kind === "home" ? <Users className="h-[44%] w-[44%]" /> : initialsOf(chat.title)}
      </span>
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#22b26b]" aria-label="Online" />}
    </span>
  );
}
