"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, CheckCheck, Copy, CornerUpLeft, Download, FileText, Forward, Info, Lock, MessageCircle, MoreHorizontal, Pause, Pencil, Pin, Play, SmilePlus, Star, Trash2, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/format";
import { colorFor, durationText, QUICK_REACTIONS, sizeText, type Message } from "./client";

export type BubbleActions = {
  reply: (message: Message) => void;
  react: (message: Message, emoji: string | null) => void;
  forward: (message: Message) => void;
  star: (message: Message) => void;
  pin: (message: Message) => void;
  edit: (message: Message) => void;
  remove: (message: Message) => void;
  info: (message: Message) => void;
  jump: (messageId: string) => void;
  replyPrivately: (message: Message) => void;
  profile: (userId: string) => void;
  openQuoted: (chatId: string, messageId: string) => void;
  vote: (message: Message, optionIds: string[]) => void;
  closePoll: (message: Message) => void;
};

const fileUrl = (id: string) => `/api/chat/messages/${id}/file`;

/* A poll: tap a choice to vote, tap it again to take the vote back. Results show as bars with who chose what. */
function PollCard({ message, mine, canClose, actions }: { message: Message; mine: boolean; canClose: boolean; actions: BubbleActions }) {
  const poll = message.poll!;
  const top = Math.max(1, ...poll.options.map(option => option.votes));
  const choose = (id: string) => {
    if (poll.closed) return;
    const current = poll.options.filter(option => option.mine).map(option => option.id);
    const next = current.includes(id) ? current.filter(item => item !== id) : poll.multiple ? [...current, id] : [id];
    actions.vote(message, next);
  };
  return (
    <div className="w-[min(18rem,70vw)] py-1">
      <p className={cn("flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider", mine ? "text-white/70" : "text-mute")}>
        <BarChart3 className="h-3.5 w-3.5" /> Poll{poll.closed ? " · closed" : poll.multiple ? " · choose any" : ""}
      </p>
      <p className="mt-1 font-semibold leading-snug">{message.body}</p>
      <div className="mt-2 space-y-1.5">
        {poll.options.map(option => (
          <button key={option.id} type="button" disabled={poll.closed} onClick={() => choose(option.id)} title={option.voters.join(", ") || "No votes yet"} aria-pressed={option.mine} className={cn("relative block w-full overflow-hidden rounded-xl px-3 py-2 text-left text-[13.5px] transition disabled:cursor-default", mine ? "bg-white/12 hover:bg-white/20" : "bg-panel/80 hover:bg-panel", option.mine && (mine ? "ring-2 ring-accent" : "ring-2 ring-brand/50"))}>
            <span className={cn("absolute inset-y-0 left-0 rounded-xl", mine ? "bg-white/20" : "bg-[#dcebc9]")} style={{ width: `${(option.votes / top) * 100}%` }} aria-hidden="true" />
            <span className="relative flex items-center gap-2">
              <span className={cn("grid h-4 w-4 shrink-0 place-items-center border-2", poll.multiple ? "rounded" : "rounded-full", option.mine ? (mine ? "border-accent bg-accent text-brand-deep" : "border-brand bg-brand text-white") : mine ? "border-white/60" : "border-dim")}>{option.mine && <Check className="h-2.5 w-2.5" />}</span>
              <span className="flex-1">{option.text}</span>
              <span className={cn("text-[12px] font-semibold tabular-nums", mine ? "text-white/80" : "text-mute")}>{option.votes}</span>
            </span>
            {option.voters.length > 0 && <span className={cn("relative mt-0.5 block truncate pl-6 text-[11px]", mine ? "text-white/65" : "text-dim")}>{option.voters.slice(0, 3).join(", ")}{option.voters.length > 3 ? ` and ${option.voters.length - 3} more` : ""}</span>}
          </button>
        ))}
      </div>
      <p className={cn("mt-2 flex items-center justify-between text-[11.5px]", mine ? "text-white/70" : "text-mute")}>
        <span>{poll.voters === 1 ? "1 person voted" : `${poll.voters} people voted`}</span>
        {canClose && !poll.closed && (
          <button type="button" onClick={() => actions.closePoll(message)} className={cn("flex items-center gap-1 font-semibold", mine ? "text-accent" : "text-brand")}>
            <Lock className="h-3 w-3" /> Close poll
          </button>
        )}
      </p>
    </div>
  );
}

/* A voice note: play and pause, a progress line and the length. */
function VoiceNote({ message, mine }: { message: Message; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    if (!audio.current) {
      audio.current = new Audio(fileUrl(message.id));
      audio.current.ontimeupdate = () => audio.current && setProgress(audio.current.currentTime / (audio.current.duration || (message.attachment?.durationMs ?? 1) / 1000));
      audio.current.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
    }
    if (playing) audio.current.pause();
    else void audio.current.play();
    setPlaying(!playing);
  };
  return (
    <div className="flex w-56 items-center gap-3 py-1">
      <button type="button" onClick={toggle} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", mine ? "bg-white/20 text-white" : "bg-brand text-white")} aria-label={playing ? "Pause voice note" : "Play voice note"}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="flex-1">
        <div className={cn("h-1.5 overflow-hidden rounded-full", mine ? "bg-white/25" : "bg-panel")}>
          <div className={cn("h-full rounded-full", mine ? "bg-accent" : "bg-brand")} style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
        <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-mute")}>{durationText(message.attachment?.durationMs)}</p>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  mine,
  showSender,
  group,
  canEdit,
  canDeleteForAll,
  canPin,
  canClosePoll,
  actions,
  highlighted,
}: {
  message: Message;
  mine: boolean;
  showSender: boolean;
  group: boolean;
  canEdit: boolean;
  canDeleteForAll: boolean;
  canPin: boolean;
  canClosePoll: boolean;
  actions: BubbleActions;
  highlighted: boolean;
}) {
  const [menu, setMenu] = useState<"" | "react" | "more">("");
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // On a touch screen, holding a message opens its menu, as in a phone chat app.
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = {
    onTouchStart: () => {
      clearTimeout(hold.current);
      hold.current = setTimeout(() => {
        if (!message.deleted) {
          navigator.vibrate?.(15);
          setMenu("more");
        }
      }, 450);
    },
    onTouchEnd: () => clearTimeout(hold.current),
    onTouchMove: () => clearTimeout(hold.current),
    onContextMenu: (event: React.MouseEvent) => {
      if (window.matchMedia("(pointer: coarse)").matches && !message.deleted) {
        event.preventDefault();
        setMenu("more");
      }
    },
  };
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => box.current && !box.current.contains(event.target as Node) && setMenu("");
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (message.kind === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-white/80 px-3 py-1 text-[11.5px] text-mute shadow-sm">{message.body}</span>
      </div>
    );
  }

  const time = fmt.time(new Date(message.at));
  const ticks =
    mine && !message.deleted ? (
      message.status === "read" ? <CheckCheck className="h-3.5 w-3.5 text-accent" aria-label="Read" /> : message.status === "delivered" ? <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Delivered" /> : <Check className="h-3.5 w-3.5 opacity-70" aria-label="Sent" />
    ) : null;
  const image = message.attachment && message.kind === "image";
  const doClose = (run: () => void) => () => {
    setMenu("");
    run();
  };

  return (
    <div id={`message-${message.id}`} className={cn("group flex px-1", mine ? "justify-end" : "justify-start", highlighted && "chat-flash")}>
      <div ref={box} {...touch} className={cn("relative max-w-[84%] select-none sm:max-w-[68%] sm:select-auto", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative rounded-2xl px-3 py-2 text-[14.5px] leading-relaxed shadow-[0_1px_1px_rgba(11,34,57,0.06)]",
            mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white text-ink",
            image && !message.body && "p-1",
          )}
        >
          {showSender && group && !mine && (
            <button type="button" onClick={() => message.sender && actions.profile(message.sender.id)} className="mb-0.5 block text-left text-[12px] font-bold hover:underline" style={{ color: colorFor(message.sender?.id ?? "") }}>
              {message.sender?.name ?? "Former colleague"}
            </button>
          )}
          {message.forwarded && !message.deleted && (
            <p className={cn("mb-1 flex items-center gap-1 text-[11.5px] italic", mine ? "text-white/70" : "text-mute")}>
              <Forward className="h-3 w-3" /> Forwarded
            </p>
          )}
          {message.replyTo && !message.deleted && (
            <button type="button" onClick={() => (message.replyTo!.chat ? actions.openQuoted(message.replyTo!.chat.id, message.replyTo!.id) : actions.jump(message.replyTo!.id))} className={cn("mb-1.5 block w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[12.5px]", mine ? "border-accent bg-white/12" : "border-brand bg-panel/70")}>
              <span className={cn("flex items-center gap-1 font-semibold", mine ? "text-accent" : "text-brand")}>
                {message.replyTo.senderName ?? "Message"}
                {message.replyTo.chat && (
                  <span className={cn("flex min-w-0 items-center gap-1 font-normal", mine ? "text-white/70" : "text-mute")}>
                    · <Users className="h-3 w-3 shrink-0" /> <span className="truncate">{message.replyTo.chat.title || "Group"}</span>
                  </span>
                )}
              </span>
              <span className={cn("line-clamp-2", mine ? "text-white/80" : "text-mute")}>{message.replyTo.deleted ? "Deleted message" : message.replyTo.body || (message.replyTo.kind === "image" ? "Photo" : message.replyTo.kind === "voice" ? "Voice note" : message.replyTo.kind === "file" ? "File" : "")}</span>
            </button>
          )}

          {message.deleted ? (
            <p className={cn("italic", mine ? "text-white/70" : "text-mute")}>
              This message was deleted
              <span className={cn("inline-block", mine ? "w-[66px]" : "w-[50px]", message.editedAt && "ml-9", (message.starred || message.pinned) && "ml-4")} aria-hidden="true" />
            </p>
          ) : (
            <>
              {image && (
                <a href={fileUrl(message.id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private file served with the sign-in, not an optimisable public image */}
                  <img src={fileUrl(message.id)} alt={message.attachment?.name ?? "Photo"} className="max-h-80 w-full max-w-xs object-cover" loading="lazy" />
                </a>
              )}
              {message.attachment && message.kind === "file" && (
                <a href={fileUrl(message.id)} target="_blank" rel="noreferrer" className={cn("mb-1 flex items-center gap-3 rounded-xl p-2.5", mine ? "bg-white/12" : "bg-panel/70")}>
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", mine ? "bg-white/20" : "bg-white")}>
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{message.attachment.name}</span>
                    <span className={cn("text-[11.5px]", mine ? "text-white/70" : "text-mute")}>{sizeText(message.attachment.size)}</span>
                  </span>
                  <Download className="h-4 w-4 opacity-70" />
                </a>
              )}
              {message.attachment && message.kind === "voice" && <VoiceNote message={message} mine={mine} />}
              {message.poll && <PollCard message={message} mine={mine} canClose={canClosePoll} actions={actions} />}
              {message.person && (
                <Link href={`/app/individuals/${message.person.id}`} className={cn("mb-1 mr-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold", mine ? "bg-white/18 text-white" : "bg-sky text-brand-deep")}>
                  <UserRound className="h-3 w-3" /> {message.person.name}
                </Link>
              )}
              {message.body && !message.poll && (
                <p className={cn("whitespace-pre-wrap break-words", image && "px-2 pb-1 pt-1.5")}>
                  {message.body}
                  <span className={cn("inline-block", mine ? "w-[66px]" : "w-[50px]", message.editedAt && "ml-9", (message.starred || message.pinned) && "ml-4")} aria-hidden="true" />
                </p>
              )}
            </>
          )}

          {(!message.body || message.poll) && !message.deleted && !image && <div className="h-3.5" aria-hidden="true" />}
          <span className={cn("absolute bottom-1 right-2.5 flex select-none items-center gap-1 text-[10.5px]", mine ? "text-white/70" : "text-dim", image && !message.body && "bottom-2 right-2 rounded-full bg-black/40 px-1.5 py-0.5 text-white")}>
            {message.starred && <Star className="h-3 w-3 fill-current" aria-label="Starred" />}
            {message.pinned && <Pin className="h-3 w-3" aria-label="Pinned" />}
            {message.editedAt && !message.deleted && <span>edited</span>}
            {time}
            {ticks}
          </span>
        </div>

        {message.reactions.length > 0 && (
          <div className={cn("relative z-[1] -mt-1.5 flex flex-wrap gap-1", mine ? "justify-end pr-2" : "pl-2")}>
            {message.reactions.map(reaction => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => actions.react(message, reaction.mine ? null : reaction.emoji)}
                title={reaction.names.join(", ")}
                className={cn("flex items-center gap-1 rounded-full border bg-white px-1.5 py-0.5 text-[12px] shadow-sm", reaction.mine ? "border-brand/40" : "border-line")}
              >
                <span>{reaction.emoji}</span>
                {reaction.count > 1 && <span className="text-[11px] text-mute">{reaction.count}</span>}
              </button>
            ))}
          </div>
        )}

        {!message.deleted && (
          <div className={cn("absolute z-10 flex items-center gap-0.5 rounded-full border border-line bg-white p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100 focus-within:opacity-100 max-md:pointer-events-none max-md:-top-9 max-md:group-hover:pointer-events-auto md:top-1", menu && "opacity-100 max-md:pointer-events-auto", mine ? "max-md:right-0 md:right-full md:mr-1.5" : "max-md:left-0 md:left-full md:ml-1.5")}>
            <button type="button" onClick={() => setMenu(menu === "react" ? "" : "react")} className="rounded-full p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="React">
              <SmilePlus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => actions.reply(message)} className="rounded-full p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="Reply">
              <CornerUpLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setMenu(menu === "more" ? "" : "more")} className="rounded-full p-1.5 text-mute hover:bg-panel hover:text-ink" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        )}

        {menu === "react" && (
          <div className={cn("absolute -top-11 z-20 flex gap-1 rounded-full border border-line bg-white px-2 py-1.5 shadow-lg", mine ? "right-0" : "left-0")}>
            {QUICK_REACTIONS.map(emoji => (
              <button key={emoji} type="button" onClick={doClose(() => actions.react(message, message.reactions.find(item => item.mine)?.emoji === emoji ? null : emoji))} className="rounded-full p-1 text-xl transition hover:scale-125">
                {emoji}
              </button>
            ))}
          </div>
        )}

        {menu === "more" && (
          <div className={cn("absolute top-9 z-20 w-52 overflow-hidden rounded-xl border border-line bg-white py-1 text-[13.5px] shadow-xl", mine ? "right-0" : "left-0")} role="menu">
            {message.body && (
              <button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(message.body); setCopied(true); setTimeout(() => { setCopied(false); setMenu(""); }, 700); }} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <Copy className="h-4 w-4 text-mute" /> {copied ? "Copied" : "Copy"}
              </button>
            )}
            {group && !mine && message.sender && (
              <button type="button" role="menuitem" onClick={doClose(() => actions.replyPrivately(message))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <MessageCircle className="h-4 w-4 text-mute" /> Reply privately
              </button>
            )}
            {group && !mine && message.sender && (
              <button type="button" role="menuitem" onClick={doClose(() => actions.profile(message.sender!.id))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <UserRound className="h-4 w-4 text-mute" /> Message {message.sender.name.split(" ")[0]}
              </button>
            )}
            {!message.poll && (
              <button type="button" role="menuitem" onClick={doClose(() => actions.forward(message))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <Forward className="h-4 w-4 text-mute" /> Forward
              </button>
            )}
            <button type="button" role="menuitem" onClick={doClose(() => actions.star(message))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
              <Star className="h-4 w-4 text-mute" /> {message.starred ? "Unstar" : "Star"}
            </button>
            {canPin && (
              <button type="button" role="menuitem" onClick={doClose(() => actions.pin(message))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <Pin className="h-4 w-4 text-mute" /> {message.pinned ? "Unpin" : "Pin"}
              </button>
            )}
            {mine && (
              <button type="button" role="menuitem" onClick={doClose(() => actions.info(message))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <Info className="h-4 w-4 text-mute" /> Message info
              </button>
            )}
            {canEdit && (
              <button type="button" role="menuitem" onClick={doClose(() => actions.edit(message))} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-panel">
                <Pencil className="h-4 w-4 text-mute" /> Edit
              </button>
            )}
            <button type="button" role="menuitem" onClick={doClose(() => actions.remove(message))} className="flex w-full items-center gap-2.5 px-3 py-2 text-flag hover:bg-flag-soft/50">
              <Trash2 className="h-4 w-4" /> {canDeleteForAll ? "Delete" : "Delete for me"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
