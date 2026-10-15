import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanDraft, scribePrompt, scribeSchema, type ScribeDraft, type ScribeKind } from "@/lib/scribe";

/*
 * The note scribe's two local engines: Whisper turns a recording into words, and an Ollama model
 * sorts the words into the note. Both run on this server. Audio is held in memory only for the
 * length of the request and is never written to disk or sent anywhere.
 */

const PYTHON = process.env.SCRIBE_PYTHON ?? "";
const WHISPER_ROOT = process.env.SCRIBE_WHISPER_ROOT ?? "";
const OLLAMA = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const WORKER = join(process.cwd(), "scripts", "scribe", "whisper.py");

export const MAX_PCM_BYTES = 16000 * 2 * 60 * 10;

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
  const speechReady = Boolean(PYTHON && WHISPER_ROOT && existsSync(PYTHON) && existsSync(whisperDir(speech)));
  let draftReady = false;
  try {
    const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
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

/* Loads the note model into memory ahead of time, so the first draft does not wait for it. */
export function warmModel(model: string) {
  // Not awaited: the load can take minutes from disk, and Ollama stops loading if the request is dropped.
  void fetch(`${OLLAMA}/api/generate`, { method: "POST", signal: AbortSignal.timeout(5 * 60_000), body: JSON.stringify({ model, keep_alive: "30m" }) }).catch(() => undefined);
}

/* Words from a recording: 16 kHz mono 16-bit PCM. Names to listen for help Whisper spell them. */
export function transcribe(pcm: Buffer, speech: string, vocabulary: string[]): Promise<{ text: string; seconds: number; decodeMs: number }> {
  if (!pcm.length || pcm.length > MAX_PCM_BYTES || pcm.length % 2) return Promise.reject(new ScribeError("The recording is empty or longer than ten minutes."));
  if (!PYTHON || !existsSync(PYTHON) || !existsSync(whisperDir(speech))) return Promise.reject(new ScribeError("The speech engine is not set up on this server."));
  return oneAtATime(
    () =>
      new Promise((resolve, reject) => {
        const child = spawn(PYTHON, [WORKER, whisperDir(speech)], {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          env: { ...process.env, SCRIBE_VOCABULARY: JSON.stringify(vocabulary.slice(0, 120)), PYTHONIOENCODING: "utf-8" },
        });
        let out = "";
        let problem = "";
        child.stderr.on("data", chunk => (problem = (problem + chunk).slice(-2000)));
        const timer = setTimeout(() => {
          child.kill();
          reject(new ScribeError("Turning speech into words took too long. Try a shorter recording."));
        }, 5 * 60_000);
        child.stdout.on("data", chunk => (out += chunk));
        child.on("error", () => {
          clearTimeout(timer);
          reject(new ScribeError("The speech engine could not start."));
        });
        child.on("close", () => {
          clearTimeout(timer);
          // The worker's own error detail is for the server log only.
          const detail = problem.split("\n").find(text => text.startsWith("scribe whisper failed"));
          if (detail) console.error(detail);
          const line = out.trim().split("\n").pop() ?? "";
          try {
            const result = JSON.parse(line) as { type: string; text?: string; seconds?: number; decodeMs?: number; message?: string };
            if (result.type === "done") resolve({ text: result.text ?? "", seconds: result.seconds ?? 0, decodeMs: result.decodeMs ?? 0 });
            else reject(new ScribeError(result.message ?? "The speech engine could not process this recording."));
          } catch {
            if (!detail && problem) console.error(`scribe whisper did not run: ${problem.trim().slice(-600)}`);
            reject(new ScribeError("The speech engine could not process this recording."));
          }
        });
        child.stdin.on("error", () => undefined);
        child.stdin.end(pcm);
      }),
  );
}

/* A draft of the note's parts from what was said. The model is held to a schema and its answer is checked. */
export function draftNote(kind: ScribeKind, text: string, model: string, context: { person: string; extra?: string }): Promise<ScribeDraft> {
  const words = text.trim();
  if (words.length < 20) return Promise.reject(new ScribeError("Say a little more about the shift first."));
  return oneAtATime(async () => {
    let response: Response;
    try {
      response = await fetch(`${OLLAMA}/api/chat`, {
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
      "clock_in, clock_out, break_start, break_end, next_shift (when they work), whos_on (who is working now), my_hours (hours worked), whats_due (their tasks, notes owed, doses), leave (time-off balance), write_note (daily note for a person), incident (report an incident for a person), open (open a page), help (a question about how to use the app), greeting, unknown.",
      "Choose unknown when it is none of these. Never invent a person.",
    ].join("\n");
    const response = await fetch(`${OLLAMA}/api/chat`, {
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
    const response = await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(1500) });
    const data = (await response.json()) as { models?: { name: string }[] };
    return Boolean(data.models?.some(item => item.name === model));
  } catch {
    return false;
  }
}
