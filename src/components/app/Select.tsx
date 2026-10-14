"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string; hint?: string; group?: string; disabled?: boolean };

type Props = {
  name?: string;
  options: SelectOption[];
  /* Controlled value. Leave out and use defaultValue for an ordinary form field. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /* When set, a first option meaning "none" (value "") with this label, and a clear button. */
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  /* A search box at the top. On by default for lists longer than eight. */
  searchable?: boolean;
  /* For filter bars: choosing applies the filter straight away. */
  submitOnChange?: boolean;
  /* For filter forms that leave defaults out of the address. */
  dataDefault?: string;
  /* Marks the value for upload forms that send extra fields with a file (see FileUpload). */
  dataExtra?: boolean;
  size?: "md" | "sm";
  className?: string;
};

/*
 * The dropdown used everywhere. It submits like a normal field, opens above everything else so a
 * card or table never cuts it off, searches long lists (400 staff), and works from the keyboard:
 * arrows move, Enter picks, Escape closes, and letters jump in short lists.
 */
export function Select({
  name,
  options,
  value: controlled,
  defaultValue = "",
  onChange,
  placeholder = "Choose…",
  emptyLabel,
  required = false,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  searchable,
  submitOnChange = false,
  dataDefault,
  dataExtra = false,
  size = "md",
  className,
}: Props) {
  const auto = useId();
  const triggerId = id ?? `${auto}-trigger`;
  const listId = `${auto}-list`;
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const all = useMemo(() => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options), [options, emptyLabel]);
  const withSearch = searchable ?? options.length > 8;
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term ? all.filter(option => `${option.label} ${option.hint ?? ""} ${option.group ?? ""}`.toLowerCase().includes(term)) : all;
    return matches.slice(0, 150);
  }, [all, query]);
  const selected = all.find(option => option.value === value) ?? null;

  const measure = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom - 12;
    const above = box.top - 12;
    const up = below < 240 && above > below;
    setPlace({ left: box.left, top: up ? box.top - 4 : box.bottom + 4, width: Math.max(box.width, 220), up, max: Math.min(360, Math.max(160, up ? above : below)) });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    const move = () => measure();
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [open, measure, withSearch]);

  // When the form is reset (for example after saving an "add" form), go back to the starting value.
  useEffect(() => {
    const form = trigger.current?.closest("form");
    if (!form || controlled !== undefined) return;
    const reset = () => setOwn(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue]);

  // Focus moves into the menu once it is on screen, so typing searches straight away.
  const shownOnScreen = open && place !== null;
  useEffect(() => {
    if (shownOnScreen) (withSearch ? search.current : list.current)?.focus({ preventScroll: true });
  }, [shownOnScreen, withSearch]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openMenu = () => {
    if (disabled) return;
    const index = shown.findIndex(option => option.value === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };

  const choose = (next: string) => {
    if (controlled === undefined) setOwn(next);
    setOpen(false);
    setQuery("");
    trigger.current?.focus({ preventScroll: true });
    if (next !== value) {
      onChange?.(next);
      // Forms that react to a field changing (filter bars, progress lists) hear this once the value is in place.
      if (submitOnChange) setTimeout(() => trigger.current?.closest("form")?.requestSubmit());
      else setTimeout(() => trigger.current?.dispatchEvent(new CustomEvent("select-change", { bubbles: true, detail: next })));
    }
  };

  const step = (from: number, by: number) => {
    let index = from;
    for (let i = 0; i < shown.length; i++) {
      index = Math.min(shown.length - 1, Math.max(0, index + by));
      if (!shown[index]?.disabled) return index;
    }
    return from;
  };

  const onKeys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(index => step(index, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(index => step(index, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(shown.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = shown[active];
      if (option && !option.disabled) choose(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      trigger.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (!withSearch && event.key.length === 1 && /\S/.test(event.key)) {
      // Typing jumps to the first option starting with what was typed.
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + event.key.toLowerCase() : event.key.toLowerCase(), at: now };
      const index = shown.findIndex(option => option.label.toLowerCase().startsWith(typed.current.text));
      if (index >= 0) setActive(index);
    }
  };

  let lastGroup: string | undefined;

  return (
    <div className={cn("relative", className)}>
      {name && (
        // A real input carries the value, so forms, "required" and filter defaults all work as usual.
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={value}
          required={required}
          data-default={dataDefault}
          data-extra={dataExtra ? "" : undefined}
          onChange={() => undefined}
          onInvalid={() => trigger.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
        />
      )}
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={event => {
          if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            openMenu();
          } else if (!open && !withSearch && event.key.length === 1 && /\S/.test(event.key)) {
            // Closed and short: letters pick the matching option straight away, like a native select.
            const match = all.find(option => !option.disabled && option.label.toLowerCase().startsWith(event.key.toLowerCase()));
            if (match) choose(match.value);
          }
        }}
        className={cn(
          "field flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "py-1.5 pl-3 pr-2 text-xs" : "py-2.5 pl-3.5 pr-2.5",
          open && "border-brand ring-2 ring-brand/15",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected && (selected.value !== "" || emptyLabel !== undefined) ? (
            <span className={cn(selected.value === "" && "text-mute")}>
              {selected.label}
              {selected.hint && size === "md" && <span className="ml-2 text-xs text-mute">{selected.hint}</span>}
            </span>
          ) : (
            <span className="text-dim">{placeholder}</span>
          )}
        </span>
        {value && emptyLabel !== undefined && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={event => {
              event.stopPropagation();
              choose("");
            }}
            className="rounded p-0.5 text-dim hover:bg-panel hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-dim transition", open && "rotate-180")} aria-hidden="true" />
        )}
      </button>

      {open &&
        place &&
        createPortal(
          <div
            ref={popup}
            className="fixed z-[200] overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-float)]"
            style={{ left: place.left, width: place.width, ...(place.up ? { bottom: window.innerHeight - place.top } : { top: place.top }) }}
          >
            {withSearch && (
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
                <input
                  ref={search}
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeys}
                  placeholder={`Search ${all.length} options`}
                  aria-controls={listId}
                  aria-label="Search the options"
                  className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-dim"
                />
              </div>
            )}
            <ul ref={list} id={listId} role="listbox" tabIndex={-1} onKeyDown={withSearch ? undefined : onKeys} aria-activedescendant={`${auto}-opt-${active}`} className="overflow-y-auto p-1 outline-none" style={{ maxHeight: place.max - (withSearch ? 44 : 0) }}>
              {shown.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-mute">No match for “{query}”</li>
              ) : (
                shown.map((option, index) => {
                  const header = option.group && option.group !== lastGroup ? option.group : null;
                  lastGroup = option.group;
                  return (
                    <li key={`${option.value}-${index}`} role="presentation">
                      {header && <p className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-dim">{header}</p>}
                      <div
                        id={`${auto}-opt-${index}`}
                        role="option"
                        data-index={index}
                        aria-selected={option.value === value}
                        aria-disabled={option.disabled || undefined}
                        onMouseDown={event => event.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => !option.disabled && choose(option.value)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                          index === active && !option.disabled && "bg-sky/70",
                          option.value === "" && "text-mute",
                          option.disabled && "cursor-not-allowed opacity-40",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{option.label}</span>
                          {option.hint && <span className="block truncate text-xs text-mute">{option.hint}</span>}
                        </span>
                        {option.value === value && <Check className="h-4 w-4 shrink-0 text-brand" />}
                      </div>
                    </li>
                  );
                })
              )}
              {all.length > 150 && shown.length === 150 && <li className="px-3 py-2 text-xs text-dim">Type to narrow down {all.length} options</li>}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
