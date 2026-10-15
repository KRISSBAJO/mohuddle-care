import { Badge } from "@/components/app/ui";
import type { BillingMode } from "@/lib/billing";
import { fmt } from "@/lib/format";

/* Where an agency stands, in a word or two. */
export function BillingBadge({ status, state }: { status: string; state: { mode: BillingMode; endsOn: string | null; daysLeft: number | null } }) {
  if (status === "complimentary") return <Badge tone="plum">Complimentary</Badge>;
  if (state.mode === "read_only") return <Badge tone="bad">{status === "cancelled" ? "Cancelled" : "Read-only"}</Badge>;
  if (state.mode === "past_due") return <Badge tone="bad">Past due since {fmt.day(state.endsOn)}</Badge>;
  const what = status === "trial" ? "Trial" : "Paid";
  if (state.mode === "ending") return <Badge tone="warn">{what} ends {fmt.day(state.endsOn)}</Badge>;
  return <Badge tone="good">{what}{state.endsOn ? ` to ${fmt.day(state.endsOn)}` : ""}</Badge>;
}
