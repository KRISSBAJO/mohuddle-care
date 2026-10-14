"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FormState } from "@/server/actions/auth";

/* A round check button that marks a task done in one tap. */
export function TaskCheck({ action, label, done = false }: { action: (previous: FormState, formData: FormData) => Promise<FormState>; label: string; done?: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  if (done) {
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage text-white" aria-label="Done">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <form action={formAction} className="shrink-0">
      <button
        aria-label={label}
        title={state.error ?? label}
        disabled={pending}
        className={cn("group grid h-6 w-6 place-items-center rounded-full border-2 transition", state.error ? "border-flag" : "border-line hover:border-sage hover:bg-sage-soft")}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sage" /> : <Check className="h-3.5 w-3.5 text-transparent group-hover:text-sage" />}
      </button>
    </form>
  );
}
