"use client";

import { useRef } from "react";
import { ScribePanel } from "@/components/logs/ScribePanel";
import type { ScribeDraft } from "@/lib/scribe";

/* Speak a Community Participation note: fills the empty boxes of the form it sits in. */
export function CommunityScribe({ personId, personName }: { personId: string; personName: string }) {
  const box = useRef<HTMLDivElement>(null);
  function fill(draft: ScribeDraft) {
    const form = box.current?.closest("form");
    if (!form) return;
    for (const [name, value] of Object.entries(draft)) {
      if (value === null || value === "") continue;
      const field = form.elements.namedItem(name);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || field.value.trim()) continue;
      field.value = String(value);
      field.classList.add("scribe-filled");
      field.addEventListener("input", () => field.classList.remove("scribe-filled"), { once: true });
    }
  }
  return (
    <div ref={box}>
      <ScribePanel kind="community" personId={personId} personName={personName} onFill={fill} />
    </div>
  );
}
