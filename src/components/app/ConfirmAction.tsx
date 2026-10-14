"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/actions/auth";
import { cn } from "@/lib/cn";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  /* Asked in a browser confirm box before the action runs. Leave out for harmless actions. */
  confirm?: string;
  tone?: "ghost" | "brand" | "danger";
  children?: React.ReactNode;
  className?: string;
};

/* A small form with one button. Shows the action's error, if any, right under the button. */
export function ConfirmAction({ action, label, confirm, tone = "ghost", children, className }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form
      action={formAction}
      onSubmit={event => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={cn("grid gap-2", className)}
    >
      {children}
      <div>
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "btn-sm disabled:opacity-60",
            tone === "brand" ? "btn-brand" : "btn-ghost",
            tone === "danger" && "border-flag/40 text-flag hover:bg-flag-soft",
          )}
        >
          {pending ? "Working…" : label}
        </button>
      </div>
      {state.error && <p className="text-sm font-medium text-flag" role="alert">{state.error}</p>}
    </form>
  );
}
