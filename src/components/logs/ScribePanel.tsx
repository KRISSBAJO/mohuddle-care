"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Sparkles, Square, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScribeDraft, ScribeKind } from "@/lib/scribe";

const MAX_SECONDS = 600;

/* What to talk about, shown while recording so nothing is forgotten. */
const TOPICS: Record<ScribeKind, string[]> = {
  daily: ["Mood and how they seemed", "Meals and drinks", "Medications and health", "Plan goals worked on", "Activities and outings", "Any behaviour: before, during, what you did, after", "Sleep", "Family calls or appointments"],
  community: ["Where you went", "How the activity was chosen", "What they did and how they took part", "Skills practised or choices made", "Number of trips"],
};

/* The fields a note kind usually needs, for "Not mentioned: sleep, family". */
const EXPECTED: Record<ScribeKind, [string, string][]> = {
  daily: [["meals", "meals"], ["health", "medications and health"], ["goalProgress", "plan goals"], ["activities", "activities"], ["sleepNotes", "sleep"]],
  community: [["location", "where you went"], ["activity", "the activity"], ["learning", "learning opportunities"]],
};

type Stage = "idle" | "recording" | "hearing" | "ready" | "drafting" | "done";

/* Decodes a recording in the browser to 16 kHz mono 16-bit PCM, the only thing sent to the server. */
async function toPcm(blob: Blob): Promise<ArrayBuffer> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
    const source = offline.createBufferSource();
    source.buffer = audio;
    source.connect(offline.destination);
    source.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
    return pcm.buffer;
  } finally {
    void context.close();
  }
}

/*
 * Speak your note: record, see the words, then fill the note's parts with one tap. Everything runs on
 * the agency's own server; the recording is never saved. Staff check every part and sign it themselves.
 */
export function ScribePanel({ kind, personId, personName, onFill }: { kind: ScribeKind; personId: string; personName: string; onFill: (draft: ScribeDraft) => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [words, setWords] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ filled: number; missing: string[] } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stopAll = useRef<() => void>(() => undefined);

  useEffect(() => () => stopAll.current(), []);
  // Start loading the note model now, so it is ready by the time staff finish speaking.
  useEffect(() => {
    void fetch("/api/scribe/warm", { method: "POST" }).catch(() => undefined);
  }, []);

  async function start() {
    setError("");
    setResult(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("The microphone is blocked. Allow it for this site in the browser's address bar, then try again.");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    const meter = new AudioContext();
    const analyser = meter.createAnalyser();
    meter.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
      setLevel(peak / 128);
      frame = requestAnimationFrame(tick);
    };
    tick();
    const begun = Date.now();
    const clock = setInterval(() => {
      const elapsed = Math.round((Date.now() - begun) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) media.stop();
    }, 500);
    stopAll.current = () => {
      clearInterval(clock);
      cancelAnimationFrame(frame);
      stream.getTracks().forEach(track => track.stop());
      void meter.close();
    };
    media.ondataavailable = event => event.data.size && chunks.push(event.data);
    media.onstop = async () => {
      stopAll.current();
      setLevel(0);
      setStage("hearing");
      try {
        const pcm = await toPcm(new Blob(chunks, { type: media.mimeType }));
        const response = await fetch(`/api/scribe/transcribe?person=${encodeURIComponent(personId)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: pcm });
        const body = (await response.json()) as { text?: string; error?: string };
        if (!response.ok || body.error) throw new Error(body.error ?? "Could not turn the recording into words.");
        if (!body.text?.trim()) throw new Error("No speech was heard. Check the microphone and try again.");
        setWords(current => (current.trim() ? `${current.trim()} ${body.text}` : body.text ?? ""));
        setStage("ready");
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Could not turn the recording into words.");
        setStage(words.trim() ? "ready" : "idle");
      }
    };
    recorder.current = media;
    setSeconds(0);
    media.start(1000);
    setStage("recording");
  }

  async function fill() {
    setError("");
    setStage("drafting");
    try {
      const response = await fetch("/api/scribe/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text: words, person: personId }) });
      const body = (await response.json()) as { draft?: ScribeDraft; filled?: number; error?: string };
      if (!response.ok || !body.draft) throw new Error(body.error ?? "Could not draft the note.");
      onFill(body.draft);
      const draft = body.draft;
      setResult({ filled: body.filled ?? 0, missing: EXPECTED[kind].filter(([field]) => !draft[field]).map(([, text]) => text) });
      setStage("done");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not draft the note.");
      setStage("ready");
    }
  }

  const minutes = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const busy = stage === "hearing" || stage === "drafting";

  return (
    <section className="card overflow-hidden border-brand/20" aria-label="Speak your note">
      <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-sky to-white px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white"><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">Speak your note</h2>
          <p className="text-sm text-mute">Tell it like you would tell the next shift{personName ? ` about ${personName}` : ""}. It fills in the note for you to check and sign.</p>
        </div>
        {stage === "recording" ? (
          <button type="button" onClick={() => recorder.current?.stop()} className="btn-brand bg-flag hover:bg-flag/90"><Square className="h-4 w-4" /> Stop · {minutes}</button>
        ) : (
          <button type="button" onClick={start} disabled={busy || (kind === "daily" && !personId)} className="btn-brand disabled:opacity-50"><Mic className="h-4 w-4" /> {words ? "Record more" : "Start speaking"}</button>
        )}
      </div>

      {kind === "daily" && !personId && stage === "idle" && <p className="border-t border-line px-5 py-3 text-sm text-mute">Choose the person first.</p>}

      {stage === "recording" && (
        <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-[1fr_16rem]">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-flag"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-flag" /> Listening</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel" aria-hidden="true">
              <div className="h-full rounded-full bg-brand transition-[width] duration-75" style={{ width: `${Math.min(100, level * 180)}%` }} />
            </div>
            <p className="mt-2 text-xs text-mute">Up to 10 minutes. Nothing is saved; only the words are kept until you sign.</p>
          </div>
          <ul className="space-y-1 text-xs text-mute">
            <li className="font-semibold text-ink">Try to mention</li>
            {TOPICS[kind].map(topic => <li key={topic}>· {topic}</li>)}
          </ul>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-sm text-mute">
          <Loader2 className="h-4 w-4 animate-spin" /> {stage === "hearing" ? "Turning your words into text…" : "Filling in the note… this can take up to a minute."}
        </p>
      )}

      {(stage === "ready" || stage === "drafting" || stage === "done") && (
        <div className="space-y-3 border-t border-line px-5 py-4">
          <label htmlFor="scribe-words" className="label">What you said <span className="font-normal normal-case tracking-normal text-dim">(fix any wrong words first)</span></label>
          <textarea id="scribe-words" value={words} onChange={event => setWords(event.target.value)} rows={4} maxLength={12000} className="field" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={fill} disabled={busy || words.trim().length < 20} className="btn-brand btn-sm disabled:opacity-50"><Wand2 className="h-4 w-4" /> {stage === "done" ? "Fill again" : "Fill in the note"}</button>
            <button type="button" onClick={() => { setWords(""); setResult(null); setStage("idle"); }} disabled={busy} className="btn-ghost btn-sm">Start over</button>
          </div>
        </div>
      )}

      {result && (
        <div className={cn("border-t border-line px-5 py-3 text-sm", result.missing.length ? "bg-accent-soft" : "bg-sage-soft")}>
          <p className="font-semibold">Filled {result.filled} {result.filled === 1 ? "part" : "parts"} of the note. Check each highlighted part before you sign.</p>
          {result.missing.length > 0 && <p className="mt-0.5 text-mute">Not mentioned: {result.missing.join(", ")}. Add them by hand or record more.</p>}
        </div>
      )}

      {error && <p role="alert" className="border-t border-line bg-flag-soft px-5 py-3 text-sm font-medium text-flag">{error}</p>}
    </section>
  );
}
