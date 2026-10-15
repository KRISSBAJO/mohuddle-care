"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, RotateCcw } from "lucide-react";

type Draft = { at: number; fields: Record<string, string | string[]> };

const PREFIX = "mohuddle-draft:";
const KEEP_MS = 3 * 86_400_000;

/* Text, choices and ticks from a form. Files, hidden fields and passwords are left out. */
function read(form: HTMLFormElement): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || !element.name) continue;
    if (element instanceof HTMLInputElement && ["hidden", "file", "password", "submit", "button"].includes(element.type)) continue;
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      if (!element.checked) continue;
      const before = out[element.name];
      out[element.name] = element.type === "checkbox" ? [...(Array.isArray(before) ? before : before ? [before] : []), element.value] : element.value;
      continue;
    }
    if (element.value.trim()) out[element.name] = element.value;
  }
  return out;
}

/* Puts a draft back, the way typing would, so the page's own state follows. */
function restore(form: HTMLFormElement, fields: Draft["fields"]) {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || !element.name || !(element.name in fields)) continue;
    const value = fields[element.name];
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      const want = Array.isArray(value) ? value.includes(element.value) : value === element.value;
      if (want !== element.checked) element.click();
      continue;
    }
    if (element instanceof HTMLInputElement && ["hidden", "file", "password"].includes(element.type)) continue;
    if (element.value.trim()) continue;
    const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, String(value));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  form.dispatchEvent(new Event("change", { bubbles: true }));
}

/*
 * Keeps a copy of what is typed in the form it sits in, on this device only, so a dropped
 * connection, a closed tab or a sign-out never loses a note. Offers it back next time. The copy is
 * removed once the form is sent and the page moves on, and after three days.
 */
export function DraftKeeper({ name, label = "note" }: { name: string; label?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const key = PREFIX + name;
  const [offer, setOffer] = useState<Draft | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    // Read after the first paint, so the page renders the same on the server and here.
    const first = window.setTimeout(() => {
      setOffline(!navigator.onLine);
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
        if (saved && Date.now() - saved.at < KEEP_MS && Object.keys(saved.fields).length) setOffer(saved);
        else localStorage.removeItem(key);
      } catch {
        // No storage in this browser: the form works as before.
      }
    }, 0);
    let timer = 0;
    let sentAt = 0;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          const fields = read(form);
          if (Object.keys(fields).length) localStorage.setItem(key, JSON.stringify({ at: Date.now(), fields }));
        } catch {
          // Storage full or blocked: nothing to do.
        }
      }, 800);
    };
    const sent = () => {
      sentAt = Date.now();
    };
    const status = () => setOffline(!navigator.onLine);
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("submit", sent);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(timer);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      form.removeEventListener("submit", sent);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
      // Leaving right after sending means it was saved: the page moved on to the saved note.
      if (sentAt && Date.now() - sentAt < 60_000 && navigator.onLine) {
        try {
          localStorage.removeItem(key);
        } catch {
          // Nothing to remove.
        }
      }
    };
  }, [key]);

  const when = offer ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(offer.at)) : "";
  return (
    <span ref={box} className="contents">
      {offline && (
        <span className="flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-[#8a5a10]" role="status">
          <CloudOff className="h-4 w-4 shrink-0" /> You are offline. Keep writing: your {label} is kept on this device. Save it when you are back online.
        </span>
      )}
      {offer && (
        <span className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-sky px-4 py-3 text-sm" role="status">
          <RotateCcw className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">You have an unsaved {label} from {when}.</span>
          <button
            type="button"
            className="font-semibold text-brand"
            onClick={() => {
              const form = box.current?.closest("form");
              if (form) restore(form, offer.fields);
              setOffer(null);
            }}
          >
            Restore it
          </button>
          <button
            type="button"
            className="font-semibold text-mute hover:text-ink"
            onClick={() => {
              try {
                localStorage.removeItem(key);
              } catch {
                // Nothing to remove.
              }
              setOffer(null);
            }}
          >
            Discard
          </button>
        </span>
      )}
    </span>
  );
}
