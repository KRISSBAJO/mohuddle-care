"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

export function PasswordInput({ id, className, disabled, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative min-w-0">
      <input {...props} id={inputId} disabled={disabled} type={visible ? "text" : "password"} className={cn("field pr-12", className)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" disabled={disabled} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls={inputId} onClick={() => setVisible(value => !value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-mute hover:text-ink focus-visible:z-10 disabled:opacity-50">
        {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
