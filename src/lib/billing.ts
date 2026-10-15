/*
 * Plans and what an agency's billing means for it. Pure: the owner console sets the plans, prices,
 * trial length and grace period; these rules only read them.
 */

/* Features a plan can include. Everything else comes with every plan. */
export const PLAN_FEATURES = [
  { key: "scribe", label: "Speak your note", help: "Staff talk through the shift and the note is filled in for them." },
  { key: "assistant", label: "Ask Mohuddle", help: "Questions, help and clocking in or out by voice or typing." },
  { key: "signing", label: "E-signing", help: "Documents to read and sign, with signature and initial placement." },
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number]["key"];

/* What the per-unit price counts. */
export const PLAN_UNITS = { person: "person supported", staff: "active staff member", home: "home", none: "nothing (base price only)" } as const;
export type PlanUnit = keyof typeof PLAN_UNITS;

/* "8 people supported", "1 home": a count of a plan's unit, in words. */
export function unitCount(unit: PlanUnit, n: number) {
  const words = { person: ["person supported", "people supported"], staff: ["active staff member", "active staff members"], home: ["home", "homes"], none: ["", ""] }[unit];
  return `${n} ${n === 1 ? words[0] : words[1]}`;
}

export type BillingStatus = "trial" | "active" | "complimentary" | "cancelled";
export const BILLING_STATUSES: Record<BillingStatus, string> = { trial: "Trial", active: "Paying", complimentary: "Complimentary", cancelled: "Cancelled" };

/* The owner's billing rules. Changed in the owner console. */
export type BillingRules = { trialDays: number; graceDays: number; warnDays: number };
export const DEFAULT_RULES: BillingRules = { trialDays: 14, graceDays: 14, warnDays: 7 };

export type BillingMode = "ok" | "ending" | "past_due" | "read_only";

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/*
 * Where an agency stands on a day. Ending: within the warning days of its trial or paid period.
 * Past due: after the end, within the grace period, still fully working. Read-only: after that, or
 * cancelled. Complimentary never ends.
 */
export function billingState(billing: { status: BillingStatus; trialEndsOn: string | null; paidUntil: string | null }, today: string, rules: BillingRules = DEFAULT_RULES) {
  if (billing.status === "complimentary") return { mode: "ok" as BillingMode, endsOn: null, daysLeft: null };
  if (billing.status === "cancelled") return { mode: "read_only" as BillingMode, endsOn: null, daysLeft: null };
  const endsOn = billing.status === "trial" ? billing.trialEndsOn : billing.paidUntil;
  if (!endsOn) return { mode: (billing.status === "trial" ? "read_only" : "ok") as BillingMode, endsOn: null, daysLeft: null };
  const daysLeft = daysBetween(today, endsOn);
  if (daysLeft >= 0) return { mode: (daysLeft <= rules.warnDays ? "ending" : "ok") as BillingMode, endsOn, daysLeft };
  // A trial has no grace: it ends on its last day. A paid period has the grace days after it.
  if (billing.status === "active" && today <= plusDays(endsOn, rules.graceDays)) return { mode: "past_due" as BillingMode, endsOn, daysLeft, graceEndsOn: plusDays(endsOn, rules.graceDays) };
  return { mode: "read_only" as BillingMode, endsOn, daysLeft };
}

/* The monthly price of a plan for a number of units, in cents. */
export const monthlyCents = (plan: { baseCents: number; unitCents: number; unit: PlanUnit }, units: number) => plan.baseCents + (plan.unit === "none" ? 0 : plan.unitCents * units);
