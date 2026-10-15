"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, Copy, Loader2, PenLine, Signature, Trash2, Type, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { FIELD_KINDS, initialsOnEveryPage, type FieldKind, type SignField } from "@/lib/sign-fields";
import { saveTemplateFields } from "@/server/actions/signing";
import { PdfPages } from "./PdfPages";

const ICONS: Record<FieldKind, typeof PenLine> = { signature: Signature, initials: PenLine, date: CalendarDays, name: Type };
const TONE: Record<FieldKind, string> = {
  signature: "border-[#286b55] bg-[#286b55]/12 text-[#173e35]",
  initials: "border-[#b88a16] bg-[#f5c542]/20 text-[#6b4f05]",
  date: "border-[#5b6b7a] bg-[#5b6b7a]/10 text-[#334155]",
  name: "border-[#5b6b7a] bg-[#5b6b7a]/10 text-[#334155]",
};

type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; field: SignField; width: number; height: number };

/*
 * Placing fields on an uploaded PDF: add a signature, initials, date or printed name, drag it where
 * it belongs and resize it from the corner. Positions are saved as fractions of the page.
 */
export function FieldEditor({ templateId, pages, initial, sourceUrl }: { templateId: string; pages: number; initial: SignField[]; sourceUrl: string }) {
  const [fields, setFields] = useState<SignField[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const drag = useRef<Drag | null>(null);
  const counter = useRef(0);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);

  // The page in the middle of the screen gets new fields.
  useEffect(() => {
    const watch = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setPage(Number((entry.target as HTMLElement).dataset.page));
    }, { rootMargin: "-45% 0px -45% 0px" });
    const scan = () => document.querySelectorAll("[data-page]").forEach(element => watch.observe(element));
    scan();
    const again = window.setInterval(scan, 1500);
    return () => {
      window.clearInterval(again);
      watch.disconnect();
    };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!selected || (event.target as HTMLElement).closest("input, textarea")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setFields(list => list.filter(field => field.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected]);

  function add(kind: FieldKind) {
    const size = FIELD_KINDS[kind];
    let id = "";
    do {
      counter.current += 1;
      id = `${kind}-${counter.current}`;
    } while (fields.some(field => field.id === id));
    const offset = (fields.filter(field => field.page === page).length % 6) * 0.03;
    setFields(list => [...list, { id, kind, page, x: 0.1 + offset, y: 0.75 - offset, w: size.w, h: size.h }]);
    setSelected(id);
    setMessage(null);
  }

  function onPointerDown(event: React.PointerEvent, field: SignField, mode: Drag["mode"]) {
    event.preventDefault();
    event.stopPropagation();
    const pageBox = (event.currentTarget as HTMLElement).closest("[data-page]")?.getBoundingClientRect();
    if (!pageBox) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { id: field.id, mode, startX: event.clientX, startY: event.clientY, field, width: pageBox.width, height: pageBox.height };
    setSelected(field.id);
  }

  function onPointerMove(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const dx = (event.clientX - current.startX) / current.width;
    const dy = (event.clientY - current.startY) / current.height;
    const start = current.field;
    setFields(list =>
      list.map(field => {
        if (field.id !== current.id) return field;
        if (current.mode === "move") return { ...field, x: Math.min(1 - start.w, Math.max(0, start.x + dx)), y: Math.min(1 - start.h, Math.max(0, start.y + dy)) };
        return { ...field, w: Math.min(1 - start.x, Math.max(0.03, start.w + dx)), h: Math.min(1 - start.y, Math.max(0.015, start.h + dy)) };
      }),
    );
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveTemplateFields(templateId, JSON.stringify(fields));
      if (result.error) setMessage({ tone: "bad", text: result.error });
      else setMessage({ tone: "good", text: result.saved ? `Saved ${result.saved} ${result.saved === 1 ? "field" : "fields"}. New signers will see them.` : "Saved. With no fields, every page is initialled and a signature page is added." });
    });
  }

  const counts = (Object.keys(FIELD_KINDS) as FieldKind[]).map(kind => [kind, fields.filter(field => field.kind === kind).length] as const);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]" onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      <div onPointerDown={() => setSelected(null)}>
        <PdfPages
          url={sourceUrl}
          overlay={number =>
            fields
              .filter(field => field.page === number)
              .map(field => {
                const Icon = ICONS[field.kind];
                return (
                  <div
                    key={field.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${FIELD_KINDS[field.kind].label} field on page ${field.page}`}
                    onPointerDown={event => onPointerDown(event, field, "move")}
                    onFocus={() => setSelected(field.id)}
                    className={cn("absolute flex cursor-move touch-none select-none items-center justify-center gap-1 rounded-md border-2 border-dashed text-[11px] font-bold", TONE[field.kind], selected === field.id && "border-solid ring-2 ring-[#286b55]/40")}
                    style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{FIELD_KINDS[field.kind].label}</span>
                    {selected === field.id && (
                      <>
                        <button
                          type="button"
                          aria-label="Remove this field"
                          onPointerDown={event => event.stopPropagation()}
                          onClick={() => {
                            setFields(list => list.filter(item => item.id !== field.id));
                            setSelected(null);
                          }}
                          className="absolute -right-3 -top-3 grid h-6 w-6 place-items-center rounded-full bg-[#ab3c2b] text-white shadow"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <span onPointerDown={event => onPointerDown(event, field, "resize")} className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-[#286b55] shadow" aria-hidden="true" />
                      </>
                    )}
                  </div>
                );
              })
          }
        />
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card space-y-4 p-5">
          <div>
            <p className="text-sm font-bold">Add to page {page}</p>
            <p className="text-xs text-mute">Then drag it into place. Resize from the corner; Delete removes it.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FIELD_KINDS) as FieldKind[]).map(kind => {
              const Icon = ICONS[kind];
              return (
                <button key={kind} type="button" onClick={() => add(kind)} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 border-dashed px-2 py-3 text-xs font-bold transition hover:brightness-95", TONE[kind])}>
                  <Icon className="h-4 w-4" /> {FIELD_KINDS[kind].label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setFields(list => initialsOnEveryPage(pages, list))} className="btn-ghost btn-sm w-full justify-center"><Copy className="h-4 w-4" /> Initials on every page</button>
          <ul className="space-y-1 border-t border-line pt-3 text-sm">
            {counts.map(([kind, count]) => (
              <li key={kind} className="flex justify-between"><span className="text-mute">{FIELD_KINDS[kind].label}</span><span className="font-semibold tabular-nums">{count}</span></li>
            ))}
          </ul>
          {message && <p role={message.tone === "bad" ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm", message.tone === "bad" ? "bg-flag-soft text-flag" : "bg-sage-soft text-sage")}>{message.text}</p>}
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn-brand w-full justify-center disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {pending ? "Saving…" : dirty ? "Save fields" : "Saved"}
          </button>
          {fields.length > 0 && (
            <button type="button" onClick={() => { setFields([]); setSelected(null); }} className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-mute hover:text-flag"><Trash2 className="h-3.5 w-3.5" /> Remove all fields</button>
          )}
          <p className="text-xs text-dim">Signers tap each signature and initials field. The date and their name are printed for them. Saving changes makes a new version; documents already signed are not affected.</p>
        </div>
      </aside>
    </div>
  );
}
