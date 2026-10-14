import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="hub-page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-bold">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-mute">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const tones = {
  neutral: "bg-panel text-mute",
  brand: "bg-sky text-brand-deep",
  good: "bg-sage-soft text-sage",
  warn: "bg-accent-soft text-[#8a5a10]",
  bad: "bg-flag-soft text-flag",
  plum: "bg-plum-soft text-plum",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("chip", tones[tone], className)}>{children}</span>;
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-mute">{label}</p>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="hub-stat-value mt-4 font-display">{value}</p>
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="hub-stat card block p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
      {body}
    </Link>
  ) : (
    <div className="hub-stat card p-6">{body}</div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("hub-panel card overflow-hidden", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          {title && <h2 className="text-sm font-bold">{title}</h2>}
          {action}
        </header>
      )}
      <div className="hub-table-scroll">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-mute">{children}</p>;
}

export function Avatar({ initials, tone = "brand", size = "md" }: { initials: string; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-14 w-14 text-xl" };
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-display font-bold", tones[tone], sizes[size])}>
      {initials}
    </span>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </div>
  );
}
