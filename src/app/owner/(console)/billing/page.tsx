import Link from "next/link";
import { ArrowUpRight, Ban, CheckCircle2, ChevronRight, CircleAlert, CircleDollarSign, Gauge, Hourglass, Layers, Lock, Receipt, Settings2, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Select } from "@/components/app/Select";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { Kpi } from "@/components/owner/Kpi";
import { initialsOf, OwnerCard } from "@/components/owner/OwnerCard";
import { unitCount } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { fmt, money } from "@/lib/format";
import { saveBillingRulesAction } from "@/server/actions/owner";
import { billingOverview, billingRules, defaultPlanId, listPlans, recentPayments } from "@/server/billing";
import { requireOwner } from "@/server/owner-auth";

export const metadata = { title: "Billing" };

function Stage({ icon: Icon, title, detail, tone }: { icon: LucideIcon; title: string; detail: string; tone: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3.5 py-3", tone)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs opacity-80">{detail}</span>
      </span>
    </div>
  );
}

/* Every agency's plan and where it stands, what Mohuddle earns a month, and the billing rules. */
export default async function BillingPage() {
  await requireOwner();
  const [rows, rules, plans, defaultPlan, payments] = await Promise.all([billingOverview(), billingRules(), listPlans(), defaultPlanId(), recentPayments()]);
  const isPaying = (row: (typeof rows)[number]) => row.billing.status === "active" && row.state.mode !== "read_only";
  const isTrial = (row: (typeof rows)[number]) => row.billing.status === "trial" && row.state.mode !== "read_only";
  // What paying agencies bring in a month; trials are not counted until they pay.
  const monthly = rows.filter(isPaying).reduce((sum, row) => sum + row.monthly, 0);
  const trialValue = rows.filter(isTrial).reduce((sum, row) => sum + row.monthly, 0);
  const count = (test: (row: (typeof rows)[number]) => boolean) => rows.filter(test).length;
  const troubled = count(row => row.state.mode === "past_due" || row.state.mode === "read_only");
  // Income by plan, for the split bar.
  const byPlan = plans
    .map(plan => ({ plan, cents: rows.filter(row => isPaying(row) && row.plan?.id === plan.id).reduce((sum, row) => sum + row.monthly, 0) }))
    .filter(part => part.cents > 0);
  const PLAN_COLOURS = ["#2f7d5b", "#8a6cc4", "#d99a1e", "#3a7bbf", "#b85c5c"];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] text-white shadow-[0_24px_60px_-30px_#0e2a24]">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#dcef98]/15 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Money</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Billing</h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">Each agency&apos;s plan and where it stands. Payments are recorded by hand on each agency&apos;s page; no card is charged.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/owner/plans" className="inline-flex items-center gap-1.5 rounded-xl bg-[#dcef98] px-3.5 py-2 text-[13px] font-semibold text-[#173e35] hover:brightness-95"><Layers className="h-4 w-4" /> Plans and prices</Link>
              <a href="#rules" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[13px] font-semibold hover:bg-white/20"><Settings2 className="h-4 w-4" /> Billing rules</a>
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10 lg:min-w-80">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">A month from paying agencies</p>
            <p className="mt-2 text-4xl font-bold tabular-nums">{money(monthly, true)}</p>
            <p className="mt-1 text-sm text-white/60">{money(monthly * 12, true)} a year</p>
            {byPlan.length > 0 && (
              <div className="mt-4">
                <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
                  {byPlan.map((part, index) => <div key={part.plan.id} style={{ width: `${(part.cents / monthly) * 100}%`, background: PLAN_COLOURS[index % PLAN_COLOURS.length] }} />)}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/70">
                  {byPlan.map((part, index) => (
                    <span key={part.plan.id} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PLAN_COLOURS[index % PLAN_COLOURS.length] }} /> {part.plan.name} {money(part.cents, true)}</span>
                  ))}
                </div>
              </div>
            )}
            {trialValue > 0 && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#dcef98]/15 px-2.5 py-1 text-xs text-[#dcef98]"><TrendingUp className="h-3.5 w-3.5" /> +{money(trialValue, true)} if trials convert</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={CheckCircle2} tone="bg-sage-soft text-sage" label="Paying" value={count(isPaying)} hint={`${money(monthly, true)} a month between them`} />
        <Kpi icon={Hourglass} tone="bg-accent-soft text-[#8a5a10]" label="On trial" value={count(isTrial)} hint={trialValue ? `Worth ${money(trialValue, true)} a month` : "None right now"} />
        <Kpi icon={CircleDollarSign} tone="bg-[#efe8fa] text-[#6b4fa8]" label="Complimentary" value={count(row => row.billing.status === "complimentary")} hint="Every feature, at no charge" />
        <Kpi icon={CircleAlert} tone="bg-flag-soft text-flag" label="Past due or read-only" value={troubled} hint={troubled ? "Needs a word with them" : "Everyone is in good standing"} />
      </div>

      <OwnerCard title={`Agencies (${rows.length})`} icon={Gauge}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-mute">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-semibold">Agency</th>
                <th className="px-3 py-2.5 font-semibold">Plan</th>
                <th className="px-3 py-2.5 font-semibold">Standing</th>
                <th className="px-3 py-2.5 font-semibold">Period</th>
                <th className="px-3 py-2.5 text-right font-semibold">Counted</th>
                <th className="px-5 py-2.5 text-right font-semibold">A month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const length = row.billing.status === "trial" ? rules.trialDays || 14 : 31;
                const left = row.state.daysLeft === null ? null : Math.max(0, Math.min(1, row.state.daysLeft / length));
                return (
                  <tr key={row.agency.id} className={cn("group border-b border-line/60 transition last:border-0 hover:bg-[var(--color-panel)]/40", !row.agency.active && "opacity-60")}>
                    <td className="px-5 py-3">
                      <Link href={`/owner/agencies/${row.agency.id}?tab=billing`} className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#173e35] text-xs font-bold text-[#dcef98]">{initialsOf(row.agency.name)}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold group-hover:text-brand">{row.agency.name}</span>
                          <span className="block text-[11px] text-mute">{row.agency.active ? row.agency.slug : "Turned off"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{row.plan ? <span className="rounded-lg bg-[var(--color-panel)] px-2 py-1 text-xs font-semibold">{row.plan.name}</span> : <span className="text-mute">No plan</span>}</td>
                    <td className="px-3 py-3"><BillingBadge status={row.billing.status} state={row.state} /></td>
                    <td className="px-3 py-3">
                      {left === null || !row.state.endsOn ? (
                        <span className="text-xs text-mute">{row.billing.status === "complimentary" ? "No end date" : "—"}</span>
                      ) : (
                        <div className="w-36">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-panel)]">
                            <div className={cn("h-full rounded-full", row.state.mode === "ok" ? "bg-sage" : row.state.mode === "ending" ? "bg-[#d99a1e]" : "bg-flag")} style={{ width: `${Math.max(4, left * 100)}%` }} />
                          </div>
                          <span className="mt-1 block text-[11px] text-mute">{row.state.daysLeft! >= 0 ? `${row.state.daysLeft} ${row.state.daysLeft === 1 ? "day" : "days"} left` : `Ended ${fmt.day(row.state.endsOn)}`}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-mute">{row.plan && row.plan.unit !== "none" ? unitCount(row.plan.unit, row.units) : "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {row.billing.status === "active" ? <span className="font-semibold">{money(row.monthly)}</span> : row.billing.status === "trial" ? <span className="text-mute">{money(row.monthly)} after trial</span> : <span className="text-mute">—</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-mute">No agencies yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </OwnerCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <OwnerCard title="Billing rules" icon={Settings2} className="scroll-mt-6" action={<span className="text-xs text-mute">Apply to every agency</span>}>
          <div id="rules" className="space-y-5 p-5">
            {/* How an agency moves through the rules, with today's numbers. */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <Stage icon={Hourglass} title="Trial" detail={rules.trialDays ? `${rules.trialDays} days free` : "No trial"} tone="bg-accent-soft text-[#8a5a10]" />
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-dim lg:block" />
              <Stage icon={CheckCircle2} title="Paying" detail={`Warned ${rules.warnDays} days before the end`} tone="bg-sage-soft text-sage" />
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-dim lg:block" />
              <Stage icon={CircleAlert} title="Past due" detail={rules.graceDays ? `${rules.graceDays} days of grace` : "No grace"} tone="bg-flag-soft text-flag" />
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-dim lg:block" />
              <Stage icon={Lock} title="Read-only" detail="Until renewed" tone="bg-[var(--color-panel)] text-ink" />
            </div>
            <ActionForm action={saveBillingRulesAction} submitLabel="Save rules">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">Free trial<span className="flex items-center gap-2"><input name="trialDays" type="number" min={0} max={365} required defaultValue={rules.trialDays} className="field" /> <span className="shrink-0 text-mute">days</span></span></label>
                <label className="grid gap-1.5 text-sm font-medium">Grace after a lapse<span className="flex items-center gap-2"><input name="graceDays" type="number" min={0} max={365} required defaultValue={rules.graceDays} className="field" /> <span className="shrink-0 text-mute">days</span></span></label>
                <label className="grid gap-1.5 text-sm font-medium">Warn administrators<span className="flex items-center gap-2"><input name="warnDays" type="number" min={0} max={365} required defaultValue={rules.warnDays} className="field" /> <span className="shrink-0 text-mute">days before</span></span></label>
                <div className="grid gap-1.5 text-sm font-medium">
                  <span>New agencies start on</span>
                  <Select name="defaultPlan" defaultValue={defaultPlan ?? ""} options={plans.filter(plan => plan.active).map(plan => ({ value: plan.id, label: plan.name }))} aria-label="Plan for new agencies" />
                </div>
              </div>
              <p className="flex gap-2 rounded-xl bg-[var(--color-panel)]/60 p-3 text-xs text-mute"><Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Read-only means everyone can still sign in and see everything, but nothing can be changed until it is renewed.</p>
            </ActionForm>
          </div>
        </OwnerCard>

        <OwnerCard title="Latest payments" icon={Receipt}>
          {payments.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-panel)] text-mute"><Receipt className="h-6 w-6" /></span>
              <p className="mt-3 font-semibold">No payments yet</p>
              <p className="max-w-xs text-sm text-mute">Record one on an agency&apos;s Plan &amp; billing tab when it pays.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line/60">
              {payments.map(payment => (
                <li key={payment.id}>
                  <Link href={`/owner/agencies/${payment.agencyId}?tab=billing`} className="group flex items-center gap-3 px-5 py-3 text-sm hover:bg-[var(--color-panel)]/40">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sage-soft text-sage"><CircleDollarSign className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{payment.agency}</span>
                      <span className="block text-xs capitalize text-mute">{fmt.day(payment.paidOn)} · {payment.method} · to {fmt.day(payment.coversUntil)}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{money(payment.amountCents)}</span>
                    <ArrowUpRight className="h-4 w-4 text-dim transition group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OwnerCard>
      </div>
    </div>
  );
}
