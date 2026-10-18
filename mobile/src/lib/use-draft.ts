import { useCallback, useEffect, useRef, useState } from "react";
import { drafts } from "./drafts";

/** Writes start with each change; intermediate keystrokes coalesce while a write is running. */
export function useDraft<T>(key: string | null) {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const [message, setMessage] = useState("");
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const pending = useRef<{ key: string; value: T } | null>(null);
  const writing = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let live = true;
    if (key) void drafts.read<T>(key).then(value => {
      if (!live) return;
      setState(value === null ? null : { key, value });
      setReadyKey(key);
      setMessage(value === null ? "" : "Draft restored from this phone.");
    }, () => { if (live) setMessage("Your saved draft could not be opened. Go back and try again before writing."); });
    return () => { live = false; };
  }, [key]);
  const flush = useCallback(async () => {
    if (writing.current) return writing.current;
    const run = async () => {
      while (pending.current) {
        const next = pending.current;
        pending.current = null;
        try {
          await drafts.write(next.key, next.value);
          setMessage("Draft saved on this phone. It has not been submitted.");
        } catch {
          if (!pending.current) pending.current = next;
          setMessage("Draft could not be saved on this phone. Keep this page open and try again.");
          throw new Error("Draft storage unavailable");
        }
      }
    };
    writing.current = run().finally(() => { writing.current = null; });
    return writing.current;
  }, []);
  const save = useCallback((value: T) => {
    if (!key || readyKey !== key) return;
    setState({ key, value });
    pending.current = { key, value };
    setMessage("Saving draft on this phone…");
    void flush().catch(() => {});
  }, [key, readyKey, flush]);
  const clear = useCallback(async () => {
    await flush();
    if (key) await drafts.clear(key);
    setState(null);
    setMessage("");
  }, [key, flush]);
  return { value: state?.key === key ? state.value : null, ready: Boolean(key && readyKey === key), save, clear, flush, message };
}
