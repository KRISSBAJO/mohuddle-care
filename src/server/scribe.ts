import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanDraft, scribePrompt, scribeSchema, type ScribeDraft, type ScribeKind } from "@/lib/scribe";
import { scribeService } from "@/lib/scribe-service";

/*
 * The note scribe's two local engines: Whisper turns a recording into words, and an Ollama model
 * sorts the words into the note. Both run on this server. Audio is held in memory only for the
 * length of the request and is never written to disk or sent anywhere.
 */

const PYTHON = process.env.SCRIBE_PYTHON ?? "";
const WHISPER_ROOT = process.env.SCRIBE_WHISPER_ROOT ?? "";
const OLLAMA = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const remote = scribeService(process.env.SCRIBE_SERVICE_URL, process.env.SCRIBE_SERVICE_KEY);
let remoteSpeechRunning = false;
const ollamaFetch = (path: string, init?: RequestInit) => remote ? remote.raw(`/ollama${path}`, init) : fetch(`${OLLAMA}${path}`, init);
const WORKER = join(process.cwd(), "scripts", "scribe", "whisper_worker.py");

export const MAX_PCM_BYTES = 16000 * 2 * 60 * 10;
/* A compressed recording from the phone app, such as m4a. */
export const MAX_ENCODED_BYTES = 25 * 1024 * 1024;

export class ScribeError extends Error {}

// One job at a time: speech and drafting each use most of the CPU, and a queue keeps the server usable.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

const whisperDir = (speech: string) => join(WHISPER_ROOT, `faster-whisper-${speech}`);

/* Whether each engine is there to use, with a plain reason when not. */
export async function scribeStatus(speech: string, model: string) {
  if (remote) {
    try {
      const status = await remote.json<{ speech: boolean; drafting: boolean }>(`/health?speech=${encodeURIComponent(speech)}&model=${encodeURIComponent(model)}`, { signal: AbortSignal.timeout(4000) });
      return { speech: status.speech === true, drafting: status.drafting === true, reason: !status.speech ? "The speech model is still being prepared." : !status.drafting ? "The note model is still being prepared." : "" };
    } catch { remoteSpeechRunning = false; return { speech: false, drafting: false, reason: "The speech service is unavailable. Try again shortly." }; }
  }
  const speechReady = Boolean(PYTHON && WHISPER_ROOT && existsSync(/*turbopackIgnore: true*/ PYTHON) && existsSync(/*turbopackIgnore: true*/ whisperDir(speech)));
  let draftReady = false;
  try {
    const response = await ollamaFetch("/api/tags", { signal: AbortSignal.timeout(2500) });
    const tags = (await response.json()) as { models?: { name: string }[] };
    draftReady = Boolean(tags.models?.some(item => item.name === model));
  } catch {
    draftReady = false;
  }
  return {
    speech: speechReady,
    drafting: draftReady,
    reason: !speechReady ? "The speech engine is not set up on this server." : !draftReady ? `The note model (${model}) is not running.` : "",
  };
}

/* Whether the speech engine is running now (it stops itself after a spell of not being used). */
export const speechRunning = () => remote ? remoteSpeechRunning : Boolean(holder.mohuddleSpeech);

/* Loads the note model into memory ahead of time, so the first draft does not wait for it. */
export function warmModel(model: string) {
  // Not awaited: the load can take minutes from disk, and Ollama stops loading if the request is dropped.
  void ollamaFetch("/api/generate", { method: "POST", signal: AbortSignal.timeout(5 * 60_000), body: JSON.stringify({ model, keep_alive: "30m", stream: false }) }).catch(() => undefined);
}

/*
 * The speech worker: one Python process that keeps the Whisper model loaded, so a request takes about
 * as long as the recording instead of loading the model each time. It starts on first use (or when a
 * page asks to warm it), restarts after a crash or a change of speech model, and stops after a spell
 * of not being used, to give the memory back.
 */
const IDLE_MS = 30 * 60_000;
const START_MS = 4 * 60_000;
const REQUEST_MS = 5 * 60_000;

type Pending = { resolve: (value: { text: string; seconds: number; decodeMs: number }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type Worker = { child: ChildProcessWithoutNullStreams; dir: string; ready: Promise<void>; pending: Map<number, Pending>; nextId: number; idle?: ReturnType<typeof setTimeout> };

// Kept on globalThis so a code reload in development does not start a second worker.
const holder = globalThis as unknown as { mohuddleSpeech?: Worker | null };

function stopWorker(reason: string) {
  const worker = holder.mohuddleSpeech;
  if (!worker) return;
  holder.mohuddleSpeech = null;
  if (worker.idle) clearTimeout(worker.idle);
  for (const job of worker.pending.values()) {
    clearTimeout(job.timer);
    job.reject(new ScribeError(reason));
  }
  worker.pending.clear();
  worker.child.kill();
}

function restartIdleTimer(worker: Worker) {
  if (worker.idle) clearTimeout(worker.idle);
  worker.idle = setTimeout(() => stopWorker("The speech engine was stopped after a while unused."), IDLE_MS);
}

function startWorker(dir: string): Worker {
  const child = spawn(/*turbopackIgnore: true*/ PYTHON, [WORKER, dir], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  let markReady: () => void = () => undefined;
  let failStart: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    failStart = reject;
  });
  const worker: Worker = { child, dir, ready, pending: new Map(), nextId: 1 };
  const startTimer = setTimeout(() => {
    failStart(new ScribeError("The speech engine took too long to start."));
    if (holder.mohuddleSpeech === worker) stopWorker("The speech engine took too long to start.");
  }, START_MS);
  // Unhandled if nobody is waiting yet; the next request sees the failure instead.
  ready.catch(() => undefined);

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      try {
        const message = JSON.parse(line) as { id?: number; type: string; text?: string; seconds?: number; decodeMs?: number; message?: string };
        if (message.type === "ready") {
          clearTimeout(startTimer);
          markReady();
          continue;
        }
        const job = message.id !== undefined ? worker.pending.get(message.id) : undefined;
        if (!job || message.id === undefined) continue;
        worker.pending.delete(message.id);
        clearTimeout(job.timer);
        if (message.type === "done") job.resolve({ text: message.text ?? "", seconds: message.seconds ?? 0, decodeMs: message.decodeMs ?? 0 });
        else job.reject(new ScribeError(message.message ?? "The speech engine could not process this recording."));
      } catch {
        // Not a protocol line; ignore it.
      }
    }
  });
  let problem = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    problem = (problem + chunk).slice(-2000);
    // The worker's own error detail is for the server log only.
    const detail = chunk.split("\n").find(text => text.startsWith("scribe whisper failed"));
    if (detail) console.error(detail.trim());
  });
  child.on("error", () => {
    clearTimeout(startTimer);
    failStart(new ScribeError("The speech engine could not start."));
    if (holder.mohuddleSpeech === worker) stopWorker("The speech engine could not start.");
  });
  child.on("exit", () => {
    clearTimeout(startTimer);
    failStart(new ScribeError("The speech engine stopped while starting."));
    if (holder.mohuddleSpeech === worker) {
      if (worker.pending.size && problem) console.error(`scribe whisper stopped: ${problem.trim().slice(-600)}`);
      stopWorker("The speech engine stopped. Try again.");
    }
  });
  child.stdin.on("error", () => undefined);
  holder.mohuddleSpeech = worker;
  restartIdleTimer(worker);
  return worker;
}

/* The running worker for this speech model, starting or switching it when needed. */
function speechWorker(speech: string): Worker {
  const dir = whisperDir(speech);
  const current = holder.mohuddleSpeech;
  if (current && current.dir === dir && current.child.exitCode === null && !current.child.killed) return current;
  if (current) stopWorker("The speech model was changed.");
  return startWorker(dir);
}

/* Starts the speech worker ahead of use, so the first request does not wait for the model to load. */
export function warmSpeech(speech: string) {
  if (remote) { void remote.json(`/warm?speech=${encodeURIComponent(speech)}`, { method: "POST" }).then(() => { remoteSpeechRunning = true; }).catch(() => { remoteSpeechRunning = false; }); return; }
  if (!PYTHON || !existsSync(/*turbopackIgnore: true*/ PYTHON) || !existsSync(/*turbopackIgnore: true*/ whisperDir(speech))) return;
  speechWorker(speech);
}

/*
 * Words from a recording: 16 kHz mono 16-bit PCM from the website, or (encoded) a recording file
 * from the phone app, decoded by the worker. Names to listen for help Whisper spell them.
 */
export function transcribe(pcm: Buffer, speech: string, vocabulary: string[], encoded = false): Promise<{ text: string; seconds: number; decodeMs: number }> {
  if (!pcm.length || pcm.length > (encoded ? MAX_ENCODED_BYTES : MAX_PCM_BYTES) || (!encoded && pcm.length % 2)) return Promise.reject(new ScribeError("The recording is empty or longer than ten minutes."));
  if (remote) return oneAtATime(async () => {
    try {
      const result = await remote.json<{ text: string; seconds: number; decodeMs: number }>(`/transcribe?speech=${encodeURIComponent(speech)}`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-speech-encoded": encoded ? "true" : "false", "x-speech-vocabulary": Buffer.from(JSON.stringify(vocabulary.slice(0, 120))).toString("base64") }, body: new Uint8Array(pcm) });
      if (typeof result.text !== "string" || !Number.isFinite(result.seconds) || !Number.isFinite(result.decodeMs)) throw new Error("Invalid speech response");
      remoteSpeechRunning = true;
      return result;
    } catch { throw new ScribeError("The speech service could not process this recording. Try again shortly."); }
  });
  if (!PYTHON || !existsSync(/*turbopackIgnore: true*/ PYTHON) || !existsSync(/*turbopackIgnore: true*/ whisperDir(speech))) return Promise.reject(new ScribeError("The speech engine is not set up on this server."));
  return oneAtATime(async () => {
    const worker = speechWorker(speech);
    await worker.ready;
    restartIdleTimer(worker);
    const id = worker.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.pending.delete(id);
        reject(new ScribeError("Turning speech into words took too long. Try a shorter recording."));
        // A stuck worker is replaced on the next request.
        if (holder.mohuddleSpeech === worker) stopWorker("The speech engine was restarted.");
      }, REQUEST_MS);
      worker.pending.set(id, { resolve, reject, timer });
      worker.child.stdin.write(`${JSON.stringify({ id, bytes: pcm.length, encoded, vocabulary: vocabulary.slice(0, 120) })}\n`);
      worker.child.stdin.write(pcm);
    });
  });
}

/* A draft of the note's parts from what was said. The model is held to a schema and its answer is checked. */
export function draftNote(kind: ScribeKind, text: string, model: string, context: { person: string; extra?: string }): Promise<ScribeDraft> {
  const words = text.trim();
  if (words.length < 20) return Promise.reject(new ScribeError("Say a little more about the shift first."));
  return oneAtATime(async () => {
    let response: Response;
    try {
      response = await ollamaFetch("/api/chat", {
        method: "POST",
        signal: AbortSignal.timeout(4 * 60_000),
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          keep_alive: "30m",
          format: scribeSchema(kind),
          options: { temperature: 0.1 },
          messages: [
            { role: "system", content: scribePrompt(kind, context) },
            { role: "user", content: words.slice(0, 12_000) },
          ],
        }),
      });
    } catch {
      throw new ScribeError("The note model is not running, or took too long.");
    }
    const data = (await response.json().catch(() => ({}))) as { message?: { content?: string }; error?: string };
    if (!response.ok || !data.message?.content) throw new ScribeError(data.error?.includes("memory") ? "The server is short of memory for the note model." : "The note model could not draft this note.");
    try {
      return cleanDraft(kind, JSON.parse(data.message.content));
    } catch {
      throw new ScribeError("The note model gave an answer that could not be read.");
    }
  });
}

/*
 * For Ask Mohuddle: when the plain rules cannot place a request, the local model picks one from the
 * same fixed list. It only ever chooses; it never acts or writes anything itself.
 */
export function chooseRequest(text: string, model: string, kinds: readonly string[], pages: string[]): Promise<unknown> {
  return oneAtATime(async () => {
    const schema = {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...kinds] },
        person: { type: "string", description: "A person's name if the request is about someone, else empty" },
        page: { type: "string", enum: ["", ...pages] },
        break: { type: "string", enum: ["", "meal", "rest"] },
      },
      required: ["kind", "person", "page", "break"],
    };
    const system = [
      "You sort a care worker's request to a care-operations app into one of these kinds:",
      "clock_in, clock_out, break_start, break_end, next_shift (when they work), huddle (a briefing on the people and what is due this shift), whos_on (who is working now), my_hours (hours worked), whats_due (their tasks, notes owed, doses), leave (time-off balance), write_note (daily note for a person), incident (report an incident for a person), open (open a page), help (a question about how to use the app), greeting, unknown.",
      "Choose unknown when it is none of these. Never invent a person.",
    ].join("\n");
    const response = await ollamaFetch("/api/chat", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({ model, stream: false, think: false, keep_alive: "30m", format: schema, options: { temperature: 0 }, messages: [{ role: "system", content: system }, { role: "user", content: text.slice(0, 500) }] }),
    });
    const data = (await response.json()) as { message?: { content?: string } };
    return JSON.parse(data.message?.content ?? "{}");
  });
}

/* Whether the model is already in memory, so a request can use it without waiting minutes for it to load. */
export async function modelLoaded(model: string) {
  try {
    const response = await ollamaFetch("/api/ps", { signal: AbortSignal.timeout(1500) });
    const data = (await response.json()) as { models?: { name: string }[] };
    return Boolean(data.models?.some(item => item.name === model));
  } catch {
    return false;
  }
}

// Phone entry points only offer speech when both engines are ready. Coalesce checks across sessions.
const phoneReadiness = new Map<string, { until: number; value: Promise<boolean> }>();
export function phoneScribeReady(speech: string, model: string): Promise<boolean> {
  // Speech installations are provisioned separately from the deployed JavaScript bundle.
  if (!remote && (!PYTHON || !WHISPER_ROOT || !existsSync(/* turbopackIgnore: true */ PYTHON) || !existsSync(/* turbopackIgnore: true */ whisperDir(speech)))) return Promise.resolve(false);
  const key = `${speech}:${model}`, kept = phoneReadiness.get(key);
  if (kept && kept.until > Date.now()) return kept.value;
  const value = scribeStatus(speech, model).then(status => status.speech && status.drafting).catch(() => false);
  if (phoneReadiness.size > 100) phoneReadiness.clear();
  phoneReadiness.set(key, { until: Date.now() + 30_000, value });
  return value;
}
