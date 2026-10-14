"use client";

import { useState } from "react";
import { Select } from "@/components/app/Select";

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

type Value = { name: string; kind: "hours" | "days" | "home"; startTime: string; endTime: string; days: number[]; homeId: string | null; centsPerHour: number };

/* The fields for one pay differential. Which fields show depends on the kind. */
export function DifferentialFields({ value, homes, prefix }: { value?: Value; homes: { id: string; name: string }[]; prefix: string }) {
  const [kind, setKind] = useState<Value["kind"]>(value?.kind ?? "hours");
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor={id("name")} className="label">Name</label>
          <input id={id("name")} name="name" required maxLength={80} className="field" defaultValue={value?.name} placeholder="Overnight" />
        </div>
        <div>
          <label htmlFor={id("amount")} className="label">Extra per hour ($)</label>
          <input id={id("amount")} name="amount" type="number" step="0.01" min="0.01" max="100" required className="field" defaultValue={value ? (value.centsPerHour / 100).toFixed(2) : ""} placeholder="1.00" />
        </div>
      </div>
      <div>
        <label htmlFor={id("kind")} className="label">Applies to</label>
        <Select
          id={id("kind")}
          name="kind"
          value={kind}
          onChange={value => setKind(value as Value["kind"])}
          options={[
            { value: "hours", label: "Hours worked between two times", hint: "For example nights" },
            { value: "days", label: "Hours worked on certain days", hint: "For example weekends" },
            { value: "home", label: "Every hour worked at one home" },
          ]}
        />
      </div>
      {kind === "hours" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id("start")} className="label">From</label>
            <input id={id("start")} name="startTime" type="time" required className="field" defaultValue={value?.startTime || "23:00"} />
          </div>
          <div>
            <label htmlFor={id("end")} className="label">To</label>
            <input id={id("end")} name="endTime" type="time" required className="field" defaultValue={value?.endTime || "07:00"} />
            <p className="mt-1 text-xs text-mute">Earlier than From means the next morning.</p>
          </div>
        </div>
      )}
      {kind !== "home" && (
        <fieldset>
          <legend className="label">{kind === "days" ? "Days" : "Only on these days (leave all off for every day)"}</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(([n, text]) => (
              <label key={n} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
                <input type="checkbox" name="days" value={n} defaultChecked={value ? value.days.includes(n) : kind === "days" && n >= 6} /> {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {kind === "home" && (
        <div>
          <label htmlFor={id("home")} className="label">Home</label>
          <Select id={id("home")} name="homeId" required defaultValue={value?.homeId ?? ""} options={homes.map(home => ({ value: home.id, label: home.name }))} />
        </div>
      )}
    </div>
  );
}
