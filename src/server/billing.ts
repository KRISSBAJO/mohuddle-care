import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { billingState, DEFAULT_RULES, monthlyCents, type BillingRules, type BillingStatus, type PlanFeature, type PlanUnit } from "@/lib/billing";
import { dateKey } from "@/lib/format";
import { asAgency, currentAgencyId, schema, systemDb } from "./db";

/*
 * Plans and billing. The tables are Mohuddle's own (the app's role cannot read them), so this reads
 * them as the database owner, for the agency being worked for or for the owner console.
 */

const RULE_KEYS: Record<keyof BillingRules, string> = { trialDays: "billing_trial_days", graceDays: "billing_grace_days", warnDays: "billing_warn_days" };

/* The trial, grace and warning days the owner set, or the defaults. */
export async function billingRules(): Promise<BillingRules> {
  const rows = await systemDb.select().from(schema.platformSettings);
  const value = (key: keyof BillingRules) => {
    const stored = rows.find(row => row.key === RULE_KEYS[key])?.value;
    return typeof stored === "number" && stored >= 0 && stored <= 365 ? stored : DEFAULT_RULES[key];
  };
  return { trialDays: value("trialDays"), graceDays: value("graceDays"), warnDays: value("warnDays") };
}

export async function saveBillingRules(rules: BillingRules) {
  for (const key of Object.keys(RULE_KEYS) as (keyof BillingRules)[]) {
    await systemDb
      .insert(schema.platformSettings)
      .values({ key: RULE_KEYS[key], value: rules[key] })
      .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: rules[key], updatedAt: new Date() } });
  }
}

export async function saveDefaultPlan(planId: string) {
  await systemDb.insert(schema.platformSettings).values({ key: "billing_default_plan", value: planId }).onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: planId, updatedAt: new Date() } });
}

/* The plan new agencies start on: the owner's choice, or else the last active plan (the fullest). */
export async function defaultPlanId() {
  const [chosen] = await systemDb.select().from(schema.platformSettings).where(eq(schema.platformSettings.key, "billing_default_plan"));
  if (typeof chosen?.value === "string") {
    const [plan] = await systemDb.select({ id: schema.plans.id }).from(schema.plans).where(and(eq(schema.plans.id, chosen.value), eq(schema.plans.active, true)));
    if (plan) return plan.id;
  }
  const [last] = await systemDb.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.active, true)).orderBy(desc(schema.plans.sortOrder)).limit(1);
  return last?.id ?? null;
}

// An agency's billing is read on many pages, so it is kept for half a minute.
const kept = new Map<string, { at: number; value: Awaited<ReturnType<typeof readBilling>> }>();

async function readBilling(agencyId: string) {
  const [row] = await systemDb
    .select({ billing: schema.agencyBilling, plan: schema.plans })
    .from(schema.agencyBilling)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.agencyBilling.planId))
    .where(eq(schema.agencyBilling.agencyId, agencyId))
    .limit(1);
  const rules = await billingRules();
  // An agency without a record (made before billing) counts as paying, with every feature.
  const billing = row?.billing ?? { agencyId, planId: null, status: "active" as BillingStatus, trialEndsOn: null, paidUntil: null, notes: "", updatedAt: new Date() };
  const state = await asAgency(agencyId, async () => billingState(billing, dateKey(), rules));
  return { billing, plan: row?.plan ?? null, state, rules };
}

export async function agencyBilling(agencyId: string) {
  const hit = kept.get(agencyId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const value = await readBilling(agencyId);
  if (kept.size > 1_000) kept.clear();
  kept.set(agencyId, { at: Date.now(), value });
  return value;
}

const forget = (agencyId: string) => kept.delete(agencyId);

/* The billing of the agency being worked for, or null when there is none. */
export async function currentBilling() {
  const agencyId = await currentAgencyId();
  return agencyId ? agencyBilling(agencyId) : null;
}

/* Whether the current agency's plan includes a feature. No plan means every feature. */
export async function planAllows(feature: PlanFeature) {
  const billing = await currentBilling();
  return !billing?.plan || billing.plan.features.includes(feature);
}

/* Whether the current agency can only look, not change anything, because its subscription lapsed. */
export async function readOnlyNow() {
  return (await currentBilling())?.state.mode === "read_only";
}

/* ---------- Owner console ---------- */

export const listPlans = () => systemDb.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder), asc(schema.plans.name));

export type PlanInput = { name: string; description: string; baseCents: number; unitCents: number; unit: PlanUnit; features: PlanFeature[]; active: boolean; sortOrder: number };

export async function savePlan(id: string | null, input: PlanInput) {
  if (id) await systemDb.update(schema.plans).set(input).where(eq(schema.plans.id, id));
  else await systemDb.insert(schema.plans).values(input);
  kept.clear();
}

/* How many units an agency has for its plan's price: people supported, active staff or homes. */
export async function unitsFor(agencyId: string, unit: PlanUnit) {
  if (unit === "none") return 0;
  const table = unit === "person" ? schema.individuals : unit === "staff" ? schema.staff : schema.homes;
  const [row] = await systemDb.select({ n: count() }).from(table).where(and(eq(table.agencyId, agencyId), eq(table.active, true)));
  return row.n;
}

/* Every agency with its plan, where it stands and what it costs a month. */
export async function billingOverview() {
  const agencies = await systemDb.select({ id: schema.agencies.id, name: schema.agencies.name, slug: schema.agencies.slug, active: schema.agencies.active }).from(schema.agencies).orderBy(asc(schema.agencies.name));
  return Promise.all(
    agencies.map(async agency => {
      const { billing, plan, state } = await readBilling(agency.id);
      const units = plan ? await unitsFor(agency.id, plan.unit) : 0;
      const monthly = plan && billing.status !== "complimentary" && billing.status !== "cancelled" ? monthlyCents(plan, units) : 0;
      return { agency, billing, plan, state, units, monthly };
    }),
  );
}

export type BillingInput = { planId: string | null; status: BillingStatus; trialEndsOn: string | null; paidUntil: string | null; notes: string };

/* Sets an agency's plan and where it stands. */
export async function setAgencyBilling(agencyId: string, input: BillingInput) {
  await systemDb
    .insert(schema.agencyBilling)
    .values({ agencyId, ...input })
    .onConflictDoUpdate({ target: schema.agencyBilling.agencyId, set: { ...input, updatedAt: new Date() } });
  forget(agencyId);
}

/* A new agency starts a trial of the default plan. */
export async function startTrial(agencyId: string) {
  const rules = await billingRules();
  const trialEndsOn = new Date(Date.now() + rules.trialDays * 86_400_000).toISOString().slice(0, 10);
  await setAgencyBilling(agencyId, { planId: await defaultPlanId(), status: "trial", trialEndsOn, paidUntil: null, notes: "" });
}

/* Records a payment. The agency is then paying, paid up to the later of its old date and this one. */
export async function recordPayment(agencyId: string, payment: { amountCents: number; paidOn: string; coversUntil: string; method: string; note: string }, recordedBy: string) {
  await systemDb.insert(schema.billingPayments).values({ agencyId, ...payment, recordedBy });
  await systemDb
    .insert(schema.agencyBilling)
    .values({ agencyId, status: "active", paidUntil: payment.coversUntil, planId: await defaultPlanId() })
    .onConflictDoUpdate({
      target: schema.agencyBilling.agencyId,
      set: { status: sql`case when ${schema.agencyBilling.status} = 'complimentary' then 'complimentary' else 'active' end`, paidUntil: sql`greatest(coalesce(${schema.agencyBilling.paidUntil}, ${payment.coversUntil}::date), ${payment.coversUntil}::date)`, updatedAt: new Date() },
    });
  forget(agencyId);
}

export const paymentsFor = (agencyId: string) => systemDb.select().from(schema.billingPayments).where(eq(schema.billingPayments.agencyId, agencyId)).orderBy(desc(schema.billingPayments.paidOn), desc(schema.billingPayments.createdAt)).limit(50);

/* The latest payments across every agency, newest first, for the billing page. */
export const recentPayments = (limit = 8) =>
  systemDb
    .select({ id: schema.billingPayments.id, agencyId: schema.billingPayments.agencyId, agency: schema.agencies.name, amountCents: schema.billingPayments.amountCents, paidOn: schema.billingPayments.paidOn, coversUntil: schema.billingPayments.coversUntil, method: schema.billingPayments.method })
    .from(schema.billingPayments)
    .innerJoin(schema.agencies, eq(schema.agencies.id, schema.billingPayments.agencyId))
    .orderBy(desc(schema.billingPayments.paidOn), desc(schema.billingPayments.createdAt))
    .limit(limit);
