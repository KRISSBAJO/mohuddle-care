"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string; hint?: string };

/*
 * A dropdown you can type into, for long lists such as 400 staff. It submits like a normal field
 * (a hidden input with the chosen value). Arrow keys move, Enter picks, Escape closes.
 */
export function SearchSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "Choose…",
  emptyLabel,
  required = false,
  id,
  onChange,
  submitOnChange = false,
  className,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  /* When set, an option to choose nothing (value "") is offered first with this label. */
  emptyLabel?: string;
  required?: boolean;
  id?: string;
  onChange?: (value: string) => void;
  /* For filter bars: picking an option applies the filter straight away. */
  submitOnChange?: boolean;
  className?: string;
}) {
  const auto = useId();
  const inputId = id ?? `${auto}-input`;
  const listId = `${auto}-list`;
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find(option => option.value === value) ?? null;

  const all = useMemo(() => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options), [options, emptyLabel]);
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term ? all.filter(option => `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(term)) : all;
    return matches.slice(0, 80);
  }, [all, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (next: string) => {
    setValue(next);
    setOpen(false);
    setQuery("");
    onChange?.(next);
    if (submitOnChange) setTimeout(() => box.current?.closest("form")?.requestSubmit());
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <div className={cn("field flex items-center gap-2 py-0 pl-3 pr-1.5", open && "border-brand ring-2 ring-brand/15")}>
        <Search className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required && !value}
          className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-dim"
          placeholder={selected ? selected.label : value === "" && emptyLabel ? emptyLabel : placeholder}
          value={open ? query : selected?.label ?? (value === "" && emptyLabel ? "" : "")}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={event => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive(index => Math.min(shown.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive(index => Math.max(0, index - 1));
            } else if (event.key === "Enter") {
              if (open && shown[active]) {
                event.preventDefault();
                choose(shown[active].value);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {value && emptyLabel !== undefined ? (
          <button type="button" onClick={() => choose("")} className="rounded p-1 text-dim hover:bg-panel hover:text-ink" aria-label="Clear">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-4 w-4 text-dim" aria-hidden="true" />
        )}
      </div>
      {open && (
        <ul ref={list} id={listId} role="listbox" className="absolute left-0 right-0 z-[70] mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-float)]">
          {shown.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-mute">No match for “{query}”</li>
          ) : (
            shown.map((option, index) => (
              <li
                key={option.value || "none"}
                role="option"
                data-index={index}
                aria-selected={option.value === value}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.value)}
                className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm", index === active ? "bg-sky/70" : "", option.value === "" && "text-mute")}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && <span className="block truncate text-xs text-mute">{option.hint}</span>}
                </span>
                {option.value === value && <Check className="h-4 w-4 shrink-0 text-brand" />}
              </li>
            ))
          )}
          {all.length > 80 && shown.length === 80 && <li className="px-3 py-2 text-xs text-dim">Type to narrow down {all.length} options</li>}
        </ul>
      )}
    </div>
  );
}
