import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { fmt, label } from "@/lib/format";
import type { Coverage } from "@/lib/log-browser";

export const moodTone = { great: "good", good: "good", okay: "neutral", low: "warn", distressed: "bad" } as const;

export function MoodBadge({ mood }: { mood: string }) {
  return <Badge tone={moodTone[mood as keyof typeof moodTone] ?? "neutral"}>{label("mood", mood)}</Badge>;
}

/* Where you are: Daily logs › Home › Person › Day. The last crumb is the current page. */
export function Crumbs({ items }: { items: [string, string | null][] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-xs font-semibold text-mute">
      {items.map(([text, href], index) => (
        <span key={`${text}-${index}`} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-3 w-3 text-dim" aria-hidden="true" />}
          {href ? <Link href={href} className="hover:text-ink">{text}</Link> : <span aria-current="page" className="text-ink">{text}</span>}
        </span>
      ))}
    </nav>
  );
}

export const coverageStyle: Record<Coverage, { box: string; text: string; word: string }> = {
  complete: { box: "bg-sage text-white", text: "text-sage", word: "All notes written" },
  partial: { box: "bg-[#f0c060] text-ink", text: "text-[#8a5a10]", word: "Some notes missing" },
  missing: { box: "bg-flag text-white", text: "text-flag", word: "No notes written" },
  upcoming: { box: "bg-sky text-brand-deep ring-1 ring-inset ring-brand/30", text: "text-brand", word: "Shift running or note not yet due" },
  none: { box: "bg-panel text-dim", text: "text-mute", word: "No shift worked" },
};

/* One day as a small square: colour for coverage, a dot when a note needs a second look. */
export function DaySquare({
  day,
  state,
  matched,
  expected,
  notes,
  concern,
  href,
  size = "md",
}: {
  day: string;
  state: Coverage;
  matched: number;
  expected: number;
  notes: number;
  concern?: boolean;
  href?: string;
  size?: "sm" | "md";
}) {
  const style = coverageStyle[state];
  const title = `${fmt.dayLong(day)}: ${style.word}${expected ? ` (${matched} of ${expected})` : notes ? ` (${notes} note${notes === 1 ? "" : "s"})` : ""}${concern ? ". A note needs a second look." : ""}`;
  const body = (
    <span
      className={cn(
        "relative flex items-center justify-center rounded-md font-semibold tabular-nums",
        size === "sm" ? "h-5 w-5 text-[9px]" : "h-8 w-8 text-[11px]",
        style.box,
      )}
    >
      {size === "md" && (expected ? `${matched}/${expected}` : notes || "")}
      {concern && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-plum" aria-hidden="true" />}
      <span className="sr-only">{title}</span>
    </span>
  );
  return href ? (
    <Link href={href} title={title} className="rounded-md focus-visible:outline-2 focus-visible:outline-brand">
      {body}
    </Link>
  ) : (
    <span title={title}>{body}</span>
  );
}

export function CoverageLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-mute">
      {(Object.keys(coverageStyle) as Coverage[]).map(state => (
        <li key={state} className="flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm", coverageStyle[state].box)} aria-hidden="true" /> {coverageStyle[state].word}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-plum" aria-hidden="true" /> Needs a second look
      </li>
    </ul>
  );
}

/* A short day label for column heads: "Mon 12". */
export function dayHead(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  return { weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), date: date.getUTCDate() };
}
