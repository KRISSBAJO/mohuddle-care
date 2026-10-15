"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Mic, Send, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { transcribeBlob } from "@/lib/audio";
import type { AssistantConfirm, AssistantReply } from "@/lib/assistant";
import { cn } from "@/lib/cn";
import { clockIn, endBreak, startBreak } from "@/server/actions/timeclock";

type Turn = { id: number; who: "you" | "mohuddle"; text?: string; reply?: AssistantReply; done?: string };

const CHIPS = ["Clock me in", "Start my meal break", "I'm back", "Clock me out", "When is my next shift?", "What's due?", "How many hours this week?", "Who's on?"];
const SPEAK_KEY = "mohuddle-speak-replies";

/* Where the phone is now, for the clock-in location check. Null when it cannot be read; that is flagged, never blocking. */
function currentPosition(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      at => resolve({ latitude: at.coords.latitude, longitude: at.coords.longitude, accuracy: at.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

/* A card that asks before anything happens. The clock actions themselves enforce every rule. */
function ConfirmCard({ confirm, onDone }: { confirm: AssistantConfirm; onDone: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(false);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value]);

  async function run(action: () => Promise<{ error?: string } | void>, success: string) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (result && result.error) {
        setError(result.error);
        if (/meters from/.test(result.error)) setAskReason(true);
      } else {
        onDone(success);
        router.refresh();
      }
    } catch (problem) {
      // A successful clock-in moves to the clock page by redirecting; that arrives here as a thrown signal.
      if (String((problem as { digest?: string } | null)?.digest ?? "").startsWith("NEXT_REDIRECT")) {
        onDone(success);
        return;
      }
      setError("That did not work. Try again, or use the button on My time clock.");
    } finally {
      setBusy(false);
    }
  }

  if (confirm.action === "break_start") {
    return (
      <div className="mt-2 grid gap-2">
        {confirm.options.map(option => (
          <button key={option.kind} type="button" disabled={busy} onClick={() => run(() => startBreak(option.kind), `${option.kind === "meal" ? "Meal" : "Rest"} break started. I will remind you before it ends.`)} className="btn-brand btn-sm justify-center disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Start {option.label.toLowerCase()}
          </button>
        ))}
        {error && <p role="alert" className="text-xs font-medium text-flag">{error}</p>}
      </div>
    );
  }
  if (confirm.action === "break_end") {
    return (
      <div className="mt-2">
        <button type="button" disabled={busy} onClick={() => run(() => endBreak(), "Welcome back. Your break has ended.")} className="btn-brand btn-sm w-full justify-center disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} End break
        </button>
        {error && <p role="alert" className="mt-1.5 text-xs font-medium text-flag">{error}</p>}
      </div>
    );
  }

  const ready = confirm.statements.every(item => ticked.includes(item)) && confirm.handovers.every(item => read.includes(item.id)) && (!askReason || reason.trim().length >= 5);
  return (
    <div className="mt-2 grid gap-2.5 rounded-2xl border border-line bg-white p-3">
      <div>
        <p className="font-semibold">{confirm.title}</p>
        <p className="text-xs text-mute">{confirm.detail}</p>
      </div>
      {confirm.handovers.map(handover => (
        <div key={handover.id} className="rounded-xl bg-panel p-2.5 text-xs">
          <p className="font-semibold">Handover from {handover.from} · {handover.at}</p>
          <p className="mt-1 whitespace-pre-line text-ink">{handover.note || "No note written."}</p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" checked={read.includes(handover.id)} onChange={() => setRead(toggle(read, handover.id))} className="h-4 w-4 accent-brand" /> I have read this
          </label>
        </div>
      ))}
      {confirm.statements.map(statement => (
        <label key={statement} className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={ticked.includes(statement)} onChange={() => setTicked(toggle(ticked, statement))} className="mt-0.5 h-4 w-4 accent-brand" /> {statement}
        </label>
      ))}
      {askReason && (
        <label className="grid gap-1 text-xs font-medium">
          Why are you away from the home?
          <input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="field py-2 text-sm" placeholder="Picking Sam up from day program" />
        </label>
      )}
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() =>
          run(async () => {
            const position = await currentPosition();
            const data = new FormData();
            data.set("payload", JSON.stringify({ shiftId: confirm.shiftId, homeId: null, position, reason: reason.trim(), statements: ticked, handoversRead: read }));
            return clockIn({}, data);
          }, "You are clocked in.")
        }
        className="btn-brand btn-sm justify-center disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Clock in now
      </button>
      <p className="text-[11px] text-dim">Your location is read once, now, to check you are at the home.</p>
      {error && <p role="alert" className="text-xs font-medium text-flag">{error}</p>}
    </div>
  );
}

/*
 * Ask Mohuddle: a button on every page that opens a panel. Type or tap the microphone and speak.
 * Questions are answered from the person's own data; actions show a card and wait for a yes.
 */
export function AskMohuddle({ voice }: { voice: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "listening" | "hearing" | "thinking">("");
  const [speak, setSpeak] = useState(false);
  const [level, setLevel] = useState(0);
  const counter = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const stopper = useRef<() => void>(() => undefined);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setSpeak(localStorage.getItem(SPEAK_KEY) === "on");
    } catch {
      // No storage: replies are not read aloud.
    }
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (open) {
      setTimeout(() => input.current?.focus(), 50);
      // Start the speech engine in the background, so the first spoken request is quick.
      void fetch("/api/scribe/warm?for=assistant", { method: "POST" }).catch(() => undefined);
    } else stopper.current();
  }, [open]);

  function say(reply: AssistantReply) {
    if (!speak || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const words = [reply.say, ...(reply.detail ?? []).slice(0, 3)].join(" ");
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(words));
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setText("");
    setTurns(current => [...current, { id: ++counter.current, who: "you", text: trimmed }]);
    setBusy("thinking");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: trimmed }) });
      const body = (await response.json()) as AssistantReply & { error?: string };
      const reply: AssistantReply = body.error ? { say: body.error, via: "none" } : body;
      setTurns(current => [...current, { id: ++counter.current, who: "mohuddle", reply }]);
      say(reply);
    } catch {
      setTurns(current => [...current, { id: ++counter.current, who: "mohuddle", reply: { say: "I could not reach the server. Check your connection and try again.", via: "none" } }]);
    } finally {
      setBusy("");
    }
  }

  async function listen() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setTurns(current => [...current, { id: ++counter.current, who: "mohuddle", reply: { say: "The microphone is blocked. Allow it for this site, or type instead.", via: "none" } }]);
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    const meter = new AudioContext();
    const analyser = meter.createAnalyser();
    meter.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let heard = false;
    let quietSince = 0;
    const started = Date.now();
    // Stops by itself after a pause once speech was heard, or after 20 seconds.
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128);
      setLevel(peak);
      const now = Date.now();
      if (peak > 0.08) {
        heard = true;
        quietSince = 0;
      } else if (heard) {
        quietSince ||= now;
        if (now - quietSince > 1400) return media.state === "recording" && media.stop();
      }
      if (now - started > 20_000) return media.state === "recording" && media.stop();
      frame = requestAnimationFrame(tick);
    };
    stopper.current = () => {
      if (media.state === "recording") media.stop();
    };
    media.ondataavailable = event => event.data.size && chunks.push(event.data);
    media.onstop = async () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach(track => track.stop());
      void meter.close();
      setLevel(0);
      stopper.current = () => undefined;
      if (!heard) {
        setBusy("");
        return;
      }
      setBusy("hearing");
      try {
        const words = await transcribeBlob(new Blob(chunks, { type: media.mimeType }), "mode=assistant");
        if (words.trim()) await ask(words);
        else setBusy("");
      } catch (problem) {
        setTurns(current => [...current, { id: ++counter.current, who: "mohuddle", reply: { say: problem instanceof Error ? problem.message : "I could not hear that. Try again, or type.", via: "none" } }]);
        setBusy("");
      }
    };
    media.start(250);
    setBusy("listening");
    tick();
  }

  function toggleSpeak() {
    const next = !speak;
    setSpeak(next);
    try {
      localStorage.setItem(SPEAK_KEY, next ? "on" : "off");
    } catch {
      // Not remembered in a private window; fine.
    }
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white pl-3 pr-3.5 text-sm font-semibold text-ink transition hover:bg-panel" aria-label="Ask Mohuddle" title="Ask Mohuddle (Ctrl+J)">
        <Sparkles className="h-4 w-4 text-brand" /> <span className="hidden sm:inline">Ask</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-ink/20 backdrop-blur-[1px]" onClick={event => event.target === event.currentTarget && setOpen(false)}>
          <section className="flex h-full w-full max-w-md flex-col bg-[#fbfcf9] shadow-2xl sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-3xl sm:border sm:border-line" role="dialog" aria-modal="true" aria-label="Ask Mohuddle">
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white"><Sparkles className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold">Ask Mohuddle</h2>
                <p className="text-xs text-mute">Your shifts, hours, what is due, and how things work.</p>
              </div>
              <button type="button" onClick={toggleSpeak} className="rounded-lg p-2 text-mute hover:bg-panel hover:text-ink" aria-pressed={speak} title={speak ? "Stop reading replies aloud" : "Read replies aloud"}>
                {speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-mute hover:bg-panel hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
            </header>

            <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {turns.length === 0 && (
                <div>
                  <p className="text-sm text-mute">Try one of these, or {voice ? "tap the microphone and speak" : "type your own"}:</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CHIPS.map(chip => (
                      <button key={chip} type="button" onClick={() => ask(chip)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-brand hover:text-brand">{chip}</button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map(turn =>
                turn.who === "you" ? (
                  <p key={turn.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-white">{turn.text}</p>
                ) : (
                  <div key={turn.id} className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-white px-3.5 py-3 text-sm">
                    {turn.done ? (
                      <p className="flex items-center gap-2 font-semibold text-sage"><Check className="h-4 w-4" /> {turn.done}</p>
                    ) : (
                      <>
                        <p className="font-semibold">{turn.reply?.say}</p>
                        {turn.reply?.detail && turn.reply.detail.length > 0 && (
                          <ul className="mt-1.5 space-y-1 text-[13px] text-ink/85">
                            {turn.reply.detail.map((line, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />{line}</li>)}
                          </ul>
                        )}
                        {turn.reply?.links && turn.reply.links.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {turn.reply.links.map(link => (
                              <button key={link.href + link.label} type="button" onClick={() => { setOpen(false); router.push(link.href); }} className="inline-flex items-center gap-1 rounded-full bg-sky px-3 py-1.5 text-xs font-semibold text-brand-deep hover:bg-[#d3e6da]">
                                {link.label} <ArrowRight className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        )}
                        {turn.reply?.confirm && (
                          <ConfirmCard
                            confirm={turn.reply.confirm}
                            onDone={message => {
                              setTurns(current => current.map(item => (item.id === turn.id ? { ...item, done: message } : item)));
                              if (speak && "speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                ),
              )}
              {busy && busy !== "listening" && (
                <p className="flex items-center gap-2 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" /> {busy === "hearing" ? "Listening back…" : "Thinking…"}</p>
              )}
            </div>

            <form
              onSubmit={event => {
                event.preventDefault();
                void ask(text);
              }}
              className="border-t border-line p-3"
            >
              {busy === "listening" && (
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-flag-soft px-3 py-2 text-xs font-semibold text-flag">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-flag" /> Listening. Stop talking and I will answer.
                  <span className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-flag" style={{ width: `${Math.min(100, level * 250)}%` }} /></span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {voice && (
                  busy === "listening" ? (
                    <button type="button" onClick={() => stopper.current()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-flag text-white" aria-label="Stop listening"><Square className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={listen} disabled={Boolean(busy)} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-50")} aria-label="Speak"><Mic className="h-5 w-5" /></button>
                  )
                )}
                <input ref={input} value={text} onChange={event => setText(event.target.value)} maxLength={500} placeholder="Ask or tell Mohuddle…" className="field flex-1 rounded-full py-2.5" aria-label="Your request" />
                <button type="submit" disabled={!text.trim() || Boolean(busy)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-white text-brand disabled:opacity-40" aria-label="Send"><Send className="h-4 w-4" /></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
