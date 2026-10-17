"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Paperclip, Pencil, SendHorizontal, Smile, Trash2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { durationText, EMOJIS, type ChatDetail, type Message } from "./client";

export type Draft = { body: string; mentions: string[]; personId: string | null };

/*
 * Writing a message: text with @mentions, emoji, tagging a person supported, a photo or file, or a
 * voice note recorded right here. Enter sends; Shift+Enter starts a new line.
 */
export function Composer({
  detail,
  replyTo,
  editing,
  persons,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
  onAttach,
  onVoice,
  onTyping,
}: {
  detail: ChatDetail;
  replyTo: Message | null;
  editing: Message | null;
  persons: { id: string; name: string; home: string | null }[];
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (draft: Draft) => Promise<void>;
  onSaveEdit: (body: string) => Promise<void>;
  onAttach: (file: File, caption: string) => Promise<void>;
  onVoice: (audio: Blob, durationMs: number) => Promise<void>;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [panel, setPanel] = useState<"" | "emoji" | "person">("");
  const [personQuery, setPersonQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<{ started: number; elapsed: number } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelRecording = useRef(false);
  const recordingStart = useRef(0);
  // Where the cursor is, for offering @mentions as you type.
  const [cursor, setCursor] = useState(0);

  // Editing fills the box with the message; finishing or cancelling empties it.
  const [editingId, setEditingId] = useState<string | null>(null);
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null);
    if (editing) setText(editing.body);
  }
  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);
  useEffect(() => {
    const box = area.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [text]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecording(current => (current ? { ...current, elapsed: Date.now() - current.started } : current)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  // "@" followed by letters at the cursor offers the chat's members.
  const atMatch = /(^|\s)@([\p{L}]*)$/u.exec(text.slice(0, cursor));
  const mentionOptions = atMatch ? detail.members.filter(member => member.name.toLowerCase().includes(atMatch[2].toLowerCase())).slice(0, 6) : [];
  const chooseMention = (member: ChatDetail["members"][number]) => {
    const before = text.slice(0, cursor).replace(/@[\p{L}]*$/u, `@${member.name.split(" ")[0]} `);
    setText(before + text.slice(cursor));
    setCursor(before.length);
    setMentions(current => [...new Set([...current, member.id])]);
    area.current?.focus();
  };

  async function submit() {
    const body = text.trim();
    if (busy) return;
    if (editing) {
      if (!body) return;
      setBusy(true);
      try {
        await onSaveEdit(body);
        setText("");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!body && !person) return;
    setBusy(true);
    try {
      await onSend({ body, mentions: mentions.filter(id => detail.members.some(member => member.id === id && body.includes(`@${member.name.split(" ")[0]}`))), personId: person?.id ?? null });
      setText("");
      setMentions([]);
      setPerson(null);
      setPanel("");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      alert("The microphone is blocked. Allow it for this site to record a voice note.");
      return;
    }
    chunks.current = [];
    cancelRecording.current = false;
    const media = new MediaRecorder(stream);
    recorder.current = media;
    media.ondataavailable = event => event.data.size && chunks.current.push(event.data);
    media.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const started = recordingStart.current;
      setRecording(null);
      if (cancelRecording.current || !chunks.current.length) return;
      setBusy(true);
      try {
        await onVoice(new Blob(chunks.current, { type: media.mimeType.split(";")[0] || "audio/webm" }), Date.now() - started);
      } finally {
        setBusy(false);
      }
    };
    recordingStart.current = Date.now();
    media.start(250);
    setRecording({ started: Date.now(), elapsed: 0 });
  }
  const stopRecording = (cancel: boolean) => {
    cancelRecording.current = cancel;
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  if (!detail.can.post) {
    return <div className="border-t border-line bg-white/70 px-5 py-4 text-center text-sm text-mute">Only coordinators and administrators post in Announcements.</div>;
  }

  const filteredPersons = persons.filter(item => item.name.toLowerCase().includes(personQuery.toLowerCase())).slice(0, 8);
  return (
    <div className="relative border-t border-line bg-[#f6f7f2] px-3 pb-3 pt-2 sm:px-4">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-start gap-3 rounded-xl border-l-4 border-brand bg-white px-3 py-2">
          {editing ? <Pencil className="mt-0.5 h-4 w-4 text-brand" /> : null}
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold text-brand">{editing ? "Editing message" : `Replying to ${replyTo?.sender?.name ?? "message"}`}</p>
            <p className="truncate text-mute">{(editing ?? replyTo)?.body || ((editing ?? replyTo)?.kind === "image" ? "Photo" : (editing ?? replyTo)?.kind === "voice" ? "Voice note" : "File")}</p>
          </div>
          <button type="button" onClick={() => { if (editing) { onCancelEdit(); setText(""); } else onCancelReply(); }} className="rounded-full p-1 text-mute hover:bg-panel" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {person && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky px-3 py-1 text-[12.5px] font-semibold text-brand-deep">
          <UserRound className="h-3.5 w-3.5" /> About {person.name}
          <button type="button" onClick={() => setPerson(null)} aria-label="Remove the person" className="ml-1 rounded-full p-0.5 hover:bg-white/60">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {mentionOptions.length > 0 && (
        <div className="absolute bottom-full left-4 mb-1 w-64 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
          {mentionOptions.map(member => (
            <button key={member.id} type="button" onMouseDown={event => { event.preventDefault(); chooseMention(member); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-panel">
              <span className="font-semibold">{member.name}</span>
              <span className="text-xs capitalize text-mute">{member.role}</span>
            </button>
          ))}
        </div>
      )}
      {panel === "emoji" && (
        <div className="absolute bottom-full left-3 mb-1 grid w-[300px] grid-cols-8 gap-1 rounded-2xl border border-line bg-white p-2 shadow-xl">
          {EMOJIS.map(emoji => (
            <button key={emoji} type="button" onClick={() => { setText(current => current + emoji); area.current?.focus(); }} className="rounded-lg p-1 text-xl hover:bg-panel">
              {emoji}
            </button>
          ))}
        </div>
      )}
      {panel === "person" && (
        <div className="absolute bottom-full left-3 mb-1 w-72 rounded-2xl border border-line bg-white p-2 shadow-xl">
          <input autoFocus value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="Who is this about?" className="field mb-1 py-2 text-sm" aria-label="Search people supported" />
          <div className="max-h-56 overflow-y-auto">
            {filteredPersons.map(item => (
              <button key={item.id} type="button" onClick={() => { setPerson(item); setPanel(""); setPersonQuery(""); }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-panel">
                <span className="font-semibold">{item.name}</span>
                <span className="text-xs text-mute">{item.home ?? ""}</span>
              </button>
            ))}
            {!filteredPersons.length && <p className="px-2.5 py-2 text-sm text-mute">No one by that name.</p>}
          </div>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 rounded-full bg-white px-3 py-2 shadow-sm">
          <button type="button" onClick={() => stopRecording(true)} className="rounded-full p-2 text-flag hover:bg-flag-soft" aria-label="Cancel the recording">
            <Trash2 className="h-5 w-5" />
          </button>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-flag" />
          <span className="flex-1 text-sm font-semibold tabular-nums">{durationText(recording.elapsed)}</span>
          <span className="hidden text-xs text-mute sm:inline">Recording a voice note</span>
          <button type="button" onClick={() => stopRecording(false)} className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white" aria-label="Send the voice note">
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 items-end gap-1 rounded-[22px] bg-white px-2 py-1.5 shadow-sm ring-1 ring-line focus-within:ring-brand/40">
            <button type="button" onClick={() => setPanel(panel === "emoji" ? "" : "emoji")} className={cn("rounded-full p-2 text-mute hover:text-ink", panel === "emoji" && "text-brand")} aria-label="Emoji">
              <Smile className="h-5 w-5" />
            </button>
            <textarea
              ref={area}
              rows={1}
              value={text}
              onChange={event => {
                setText(event.target.value);
                setCursor(event.target.selectionStart);
                onTyping();
              }}
              onSelect={event => setCursor(event.currentTarget.selectionStart)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (mentionOptions.length) chooseMention(mentionOptions[0]);
                  else void submit();
                }
                if (event.key === "Escape") {
                  if (editing) onCancelEdit();
                  else if (replyTo) onCancelReply();
                  setPanel("");
                }
              }}
              placeholder={editing ? "Edit your message" : "Message"}
              aria-label="Message"
              maxLength={4000}
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-snug outline-none placeholder:text-dim"
            />
            {!editing && (
              <>
                <button type="button" onClick={() => setPanel(panel === "person" ? "" : "person")} className={cn("rounded-full p-2 text-mute hover:text-ink", panel === "person" && "text-brand")} aria-label="Tag a person supported" title="Tag a person supported">
                  <UserRound className="h-5 w-5" />
                </button>
                {detail.can.attach && (
                  <button type="button" onClick={() => fileInput.current?.click()} className="rounded-full p-2 text-mute hover:text-ink" aria-label="Attach a photo or file">
                    <Paperclip className="h-5 w-5" />
                  </button>
                )}
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
              onChange={async event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                try {
                  await onAttach(file, text.trim());
                  setText("");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
          {text.trim() || person || editing || !detail.can.attach ? (
            <button type="button" onClick={() => void submit()} disabled={busy || (!text.trim() && !person)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-md transition hover:bg-brand-deep disabled:opacity-50" aria-label={editing ? "Save" : "Send"}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
            </button>
          ) : (
            <button type="button" onClick={() => void startRecording()} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-md transition hover:bg-brand-deep disabled:opacity-50" aria-label="Record a voice note">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
