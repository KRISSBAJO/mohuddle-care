"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";
import { ACCEPT_ATTR, formatBytes } from "@/lib/documents";

/*
 * Drop a file or choose one (on a phone, take a photo). Uploads with a progress bar, then refreshes the
 * page. Extra form fields (owner, type, dates, token) are sent alongside the file.
 */
export function FileUpload({
  endpoint,
  fields,
  label = "Upload a file",
  hint = "PDF or photo",
  compact = false,
  maxMb,
  onDone,
  extra,
}: {
  endpoint: string;
  fields: Record<string, string>;
  label?: string;
  hint?: string;
  compact?: boolean;
  maxMb: number;
  onDone?: () => void;
  /* Optional inputs (dates, notes) rendered above the drop zone; their values are sent too. */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function send(file: File) {
    setError(null);
    setDone(null);
    if (file.size > maxMb * 1024 * 1024) return setError(`That file is ${formatBytes(file.size)}. The limit is ${maxMb} MB.`);
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    box.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-extra]").forEach(field => data.append(field.name, field.value));
    data.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.upload.onprogress = event => event.lengthComputable && setProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => {
      setProgress(null);
      let body: { error?: string } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = { error: "The upload did not finish. Try again." };
      }
      if (request.status >= 400 || body.error) return setError(body.error ?? "The upload did not finish. Try again.");
      setDone(file.name);
      if (input.current) input.current.value = "";
      onDone?.();
      router.refresh();
    };
    request.onerror = () => {
      setProgress(null);
      setError("The connection dropped. Try again.");
    };
    setProgress(0);
    request.send(data);
  }

  return (
    <div ref={box} className="grid gap-3">
      {extra}
      <div
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={event => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (file) send(file);
        }}
        className={cn(
          "relative flex items-center gap-3 rounded-xl border-2 border-dashed transition",
          compact ? "px-3 py-2" : "flex-col justify-center px-4 py-6 text-center",
          over ? "border-brand bg-sky/60" : "border-line bg-white hover:border-brand/50",
        )}
      >
        {progress !== null ? (
          <div className="flex w-full items-center gap-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>
            <span className="text-xs font-semibold text-mute">{progress}%</span>
          </div>
        ) : (
          <>
            {compact ? <FileUp className="h-4 w-4 shrink-0 text-brand" /> : <UploadCloud className="h-7 w-7 text-brand" />}
            <div className={compact ? "min-w-0 flex-1 text-left" : ""}>
              <button type="button" onClick={() => input.current?.click()} className="text-sm font-semibold text-brand hover:text-brand-deep">
                {label}
              </button>
              <p className="text-xs text-mute">{compact ? hint : `or drop it here · ${hint}, up to ${maxMb} MB`}</p>
            </div>
          </>
        )}
        <input ref={input} type="file" accept={ACCEPT_ATTR} className="sr-only" onChange={event => event.target.files?.[0] && send(event.target.files[0])} aria-label={label} />
      </div>
      {error && <p className="rounded-lg bg-flag-soft px-3 py-2 text-sm font-medium text-flag" role="alert">{error}</p>}
      {done && <p className="flex items-center gap-1.5 text-sm font-medium text-sage" role="status"><CheckCircle2 className="h-4 w-4" /> {done} uploaded.</p>}
    </div>
  );
}
