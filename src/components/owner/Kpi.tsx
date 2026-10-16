import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/* A headline number for the owner console, with an icon and a line of context. Links when given an href. */
export function Kpi({ icon: Icon, label, value, hint, href, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; hint: string; href?: string; tone: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", tone)}><Icon className="h-5 w-5" /></span>
        {href && <ArrowUpRight className="h-4 w-4 text-dim transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />}
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-mute">{hint}</p>
    </>
  );
  const style = "group card block p-5 transition";
  return href ? <Link href={href} className={cn(style, "hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_#173e35]")}>{body}</Link> : <div className={style}>{body}</div>;
}
