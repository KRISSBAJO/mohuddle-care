"use client";

import { startTransition, useActionState, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Plus, X } from "lucide-react";
import type { FormState } from "@/server/actions/auth";

/* One group of settings with its own save button. It keeps what was typed, and says when it saved. */
export function SettingsGroupForm({ action, children, submitLabel }: { action: (previous: FormState, formData: FormData) => Promise<FormState>; children: React.ReactNode; submitLabel: string }) {
  const [state, formAction, pending] = useActionState<FormState & { saved?: number }, FormData>(async (previous, data) => {
    const result = await action(previous, data);
    return { ...result, saved: result.error ? undefined : Date.now() };
  }, {});
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="divide-y divide-line">{children}</div>
      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-panel/40 px-5 py-3">
        {state.error && <p className="text-sm font-medium text-flag" role="alert">{state.error}</p>}
        {state.saved && !pending && (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-sage" role="status"><CheckCircle2 className="h-4 w-4" /> Saved</p>
        )}
        <button type="submit" disabled={pending} className="btn-brand btn-sm disabled:opacity-60">{pending ? "Saving…" : submitLabel}</button>
      </footer>
    </form>
  );
}

/* A list setting as removable chips, with an add box and up and down to reorder. Sent as one line per item. */
export function ListEditor({ name, initial, placeholder }: { name: string; initial: string[]; placeholder?: string }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || items.some(item => item.toLowerCase() === value.toLowerCase())) return setDraft("");
    setItems([...items, value]);
    setDraft("");
  };
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setItems(next);
  };
  return (
    <div>
      <input type="hidden" name={name} value={items.join("\n")} />
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item, index) => (
          <li key={item} className="group inline-flex items-center gap-1 rounded-full border border-line bg-white py-1 pl-3 pr-1 text-sm">
            {item}
            <span className="flex opacity-50 group-hover:opacity-100">
              {index > 0 && (
                <button type="button" onClick={() => move(index, -1)} className="rounded-full p-0.5 text-mute hover:bg-panel hover:text-ink" aria-label={`Move ${item} earlier`}>
                  <ArrowUp className="h-3 w-3" />
                </button>
              )}
              {index < items.length - 1 && (
                <button type="button" onClick={() => move(index, 1)} className="rounded-full p-0.5 text-mute hover:bg-panel hover:text-ink" aria-label={`Move ${item} later`}>
                  <ArrowDown className="h-3 w-3" />
                </button>
              )}
              <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))} className="rounded-full p-0.5 text-mute hover:bg-flag-soft hover:text-flag" aria-label={`Remove ${item}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-flag">Add at least one.</li>}
      </ul>
      <div className="mt-2 flex max-w-md gap-2">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="field py-2"
          placeholder={placeholder ?? "Add another"}
          aria-label={`Add to ${name.replace(/_/g, " ")}`}
        />
        <button type="button" onClick={add} className="btn-ghost btn-sm"><Plus className="h-4 w-4" /> Add</button>
      </div>
    </div>
  );
}

const ROLES = [
  ["admin", "Administrators"],
  ["coordinator", "Coordinators"],
  ["nurse", "Nurses"],
  ["dsp", "Direct support staff"],
] as const;

/* Which login roles receive a kind of notification. Sent as one role per line, like other lists. */
export function RolePicker({ name, initial }: { name: string; initial: string[] }) {
  const [roles, setRoles] = useState(initial);
  return (
    <div>
      <input type="hidden" name={name} value={roles.join("\n")} />
      <div className="flex flex-wrap gap-2">
        {ROLES.map(([value, text]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
            <input
              type="checkbox"
              checked={roles.includes(value)}
              onChange={event => setRoles(event.target.checked ? [...roles, value] : roles.filter(role => role !== value))}
              className="h-4 w-4 accent-[#1b6fa8]"
            />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}
