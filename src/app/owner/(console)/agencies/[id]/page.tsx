import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Building2, CalendarClock, CircleDollarSign, Clock3, ExternalLink, Globe2, Home, KeyRound, LifeBuoy, Power, Receipt, ScrollText, Settings2, ShieldCheck, Sparkles, UserPlus, Users, UsersRound } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { LinkIssuer } from "@/components/app/LinkIssuer";
import { Select } from "@/components/app/Select";
import { AgencyFields } from "@/components/owner/AgencyFields";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { CopyButton } from "@/components/owner/CopyButton";
import { initialsOf, OwnerCard as Card } from "@/components/owner/OwnerCard";
import { SupportForm } from "@/components/owner/SupportForm";
import { agencyOrigin } from "@/lib/agency-host";
import { BILLING_STATUSES, monthlyCents, PLAN_FEATURES, unitCount } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { dateKey, fmt, money } from "@/lib/format";
import { ownerActionWords } from "@/lib/owner-events";
import { addAdminAction, newAdminLinkAction, openSupportAction, recordPaymentAction, setAgencyActiveAction, setAgencyBillingAction, updateAgencyAction } from "@/server/actions/owner";
import { agencyBilling, listPlans, paymentsFor, unitsFor } from "@/server/billing";
import { requestTime } from "@/server/clock";
import { env } from "@/server/env";
import { agencyDetail, listAgencies, ownerEvents } from "@/server/owner";
import { requireOwner } from "@/server/owner-auth";

export const metadata = { title: "Agency" };

const TABS = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "profile", label: "Profile", icon: Settings2 },
  { key: "admins", label: "Administrators", icon: UsersRound },
  { key: "billing", label: "Plan & billing", icon: CircleDollarSign },
  { key: "activity", label: "Activity", icon: Activity },
] as const;
type Tab = (typeof TABS)[number]["key"];

function AdminStatus({ active, hasPassword }: { active: boolean; hasPassword: boolean | null }) {
  const [tone, words] = !active ? ["bg-[var(--color-panel)] text-mute", "Off"] : hasPassword ? ["bg-sage-soft text-sage", "Can sign in"] : ["bg-accent-soft text-[#8a5a10]", "Invited"];
  return <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone)}>{words}</span>;
}

/* One agency, in the owner console: who they are, their people, their plan and what has happened. */
export default async function AgencyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await agencyDetail(id);
  if (!detail) notFound();
  const { agency, admins } = detail;
  const { tab: asked } = await searchParams;
  const tab: Tab = TABS.some(item => item.key === asked) ? (asked as Tab) : "overview";
  const now = await requestTime();
  const [billing, plans, payments, events, all] = await Promise.all([agencyBilling(agency.id), listPlans(), paymentsFor(agency.id), ownerEvents(agency.id), listAgencies()]);
  const stats = all.find(item => item.id === agency.id);
  const units = billing.plan ? await unitsFor(agency.id, billing.plan.unit) : 0;
  const monthly = billing.plan ? monthlyCents(billing.plan, units) : 0;
  const address = `${agencyOrigin(agency.slug, env.APP_URL)}`;
  const today = dateKey(new Date(now));
  const { state } = billing;
  // How much of the trial or paid period is left, for the bar.
  const periodDays = billing.billing.status === "trial" ? billing.rules.trialDays || 14 : 31;
  const left = state.daysLeft === null ? null : Math.max(0, Math.min(1, state.daysLeft / periodDays));
  const tabHref = (key: Tab) => `/owner/agencies/${agency.id}${key === "overview" ? "" : `?tab=${key}`}`;

  const supportCard = agency.active && (
    <Card title="Support visit" icon={LifeBuoy}>
      <div className="space-y-3 p-5 text-sm">
        <p className="text-mute">Open {agency.name} as an administrator for an hour, to see what they see and help. Its administrators are told who, when and why.</p>
        <SupportForm action={openSupportAction.bind(null, agency.id)} />
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Link href="/owner/agencies" className="inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> All agencies</Link>

      {/* Who they are, at a glance. */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] text-white shadow-[0_24px_60px_-30px_#0e2a24]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#dcef98]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#dcef98] font-display text-2xl font-bold text-[#173e35] shadow-lg">{initialsOf(agency.name)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold sm:text-3xl">{agency.name}</h1>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", agency.active ? "bg-[#dcef98] text-[#173e35]" : "bg-white/15 text-white/80")}>{agency.active ? "Active" : "Turned off"}</span>
              </div>
              <p className="mt-1 truncate text-sm text-white/65">{agency.legalName}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pl-3 pr-1 font-mono text-xs">
                  <Globe2 className="h-3.5 w-3.5 text-[#dcef98]" /> {new URL(address).host}
                  <CopyButton text={address} className="rounded-full bg-white/10 px-2.5 py-1 font-sans text-[11px] font-semibold hover:bg-white/20" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs"><Clock3 className="h-3.5 w-3.5 text-[#dcef98]" /> Since {fmt.day(dateKey(agency.createdAt))}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a href={address} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[13px] font-semibold hover:bg-white/20"><ExternalLink className="h-4 w-4" /> Open their address</a>
            {agency.active && <Link href={tabHref("activity")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#dcef98] px-3.5 py-2 text-[13px] font-semibold text-[#173e35] hover:brightness-95"><LifeBuoy className="h-4 w-4" /> Support visit</Link>}
          </div>
        </div>
        <dl className="relative grid grid-cols-2 border-t border-white/10 bg-black/10 sm:grid-cols-5">
          {[
            { label: "People supported", value: stats?.people ?? 0, icon: Users },
            { label: "Active staff", value: stats?.staff ?? 0, icon: UsersRound },
            { label: "Logins", value: stats?.logins ?? 0, icon: KeyRound },
            { label: "Homes", value: stats?.homes ?? 0, icon: Home },
            { label: "Last used", value: stats?.lastSeen ? fmt.dateTime(new Date(stats.lastSeen)) : "Never", icon: CalendarClock },
          ].map(item => (
            <div key={item.label} className="border-white/10 px-5 py-4 [&:not(:last-child)]:border-r">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50"><item.icon className="h-3.5 w-3.5" /> {item.label}</dt>
              <dd className="mt-1 truncate text-lg font-bold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-1.5" aria-label="Agency sections">
        {TABS.map(item => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            scroll={false}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition", tab === item.key ? "bg-[#173e35] text-white shadow-sm" : "text-mute hover:bg-[var(--color-panel)] hover:text-ink")}
          >
            <item.icon className={cn("h-4 w-4", tab === item.key ? "text-[#dcef98]" : "")} /> {item.label}
            {item.key === "admins" && <span className={cn("rounded-full px-1.5 text-[11px]", tab === item.key ? "bg-white/15" : "bg-[var(--color-panel)]")}>{admins.length}</span>}
          </Link>
        ))}
      </nav>

      <div key={tab} className="wizard-step">
        {tab === "overview" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card title="Plan" icon={CircleDollarSign} action={<Link href={tabHref("billing")} className="text-xs font-semibold text-brand">Manage</Link>}>
                <div className="p-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold">{billing.plan?.name ?? "No plan"}</p>
                      <p className="text-sm text-mute">{billing.billing.status === "complimentary" ? "At no charge" : billing.plan ? `${money(monthly)} a month at today's numbers` : "Every feature on"}</p>
                    </div>
                    <BillingBadge status={billing.billing.status} state={state} />
                  </div>
                  {left !== null && state.endsOn && (
                    <div className="mt-5">
                      <div className="flex justify-between text-xs text-mute">
                        <span>{billing.billing.status === "trial" ? "Trial" : "Paid period"}</span>
                        <span>{state.daysLeft! >= 0 ? `${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"} left · ends ${fmt.day(state.endsOn)}` : `Ended ${fmt.day(state.endsOn)}`}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-panel)]">
                        <div className={cn("h-full rounded-full", state.mode === "ok" ? "bg-sage" : state.mode === "ending" ? "bg-[#d99a1e]" : "bg-flag")} style={{ width: `${Math.max(4, left * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {billing.plan && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {PLAN_FEATURES.map(feature => {
                        const has = billing.plan!.features.includes(feature.key);
                        return <span key={feature.key} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", has ? "bg-sage-soft text-sage" : "bg-[var(--color-panel)] text-dim line-through")}><Sparkles className="h-3 w-3" /> {feature.label}</span>;
                      })}
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Administrators" icon={UsersRound} action={<Link href={tabHref("admins")} className="text-xs font-semibold text-brand">Manage</Link>}>
                <ul className="divide-y divide-line/60">
                  {admins.map(admin => (
                    <li key={admin.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky text-xs font-bold text-brand-deep">{initialsOf(admin.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{admin.name}</span>
                        <span className="block truncate text-xs text-mute">{admin.email}</span>
                      </span>
                      <AdminStatus active={admin.active} hasPassword={admin.hasPassword} />
                    </li>
                  ))}
                  {admins.length === 0 && <li className="px-5 py-4 text-sm text-mute">No administrators yet.</li>}
                </ul>
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Recent activity" icon={ScrollText} action={<Link href={tabHref("activity")} className="text-xs font-semibold text-brand">All</Link>}>
                {events.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-mute">Nothing yet.</p>
                ) : (
                  <ol className="relative space-y-4 px-5 py-4 before:absolute before:bottom-4 before:left-[27px] before:top-4 before:w-px before:bg-line">
                    {events.slice(0, 5).map(event => (
                      <li key={event.id} className="relative flex gap-3 text-sm">
                        <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-brand ring-2 ring-sky" />
                        <span className="min-w-0">
                          <span className="font-semibold">{ownerActionWords(event.action)}</span>
                          <span className="block truncate text-xs text-mute">{fmt.dateTime(event.at)} · {event.ownerName.split(" (")[0]}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              {supportCard}
            </div>
          </div>
        )}

        {tab === "profile" && (
          <Card title="Profile" icon={Settings2} className="max-w-4xl">
            <div className="p-6">
              <ActionForm action={updateAgencyAction.bind(null, agency.id)} submitLabel="Save profile">
                <AgencyFields initial={agency} />
              </ActionForm>
            </div>
          </Card>
        )}

        {tab === "admins" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-4 sm:grid-cols-2">
              {admins.map(admin => (
                <section key={admin.id} className="card space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky text-sm font-bold text-brand-deep">{initialsOf(admin.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{admin.name}</span>
                      <span className="block truncate text-xs text-mute">{admin.email}</span>
                    </span>
                    <AdminStatus active={admin.active} hasPassword={admin.hasPassword} />
                  </div>
                  {admin.active && <LinkIssuer action={newAdminLinkAction.bind(null, agency.id, admin.id)} label={admin.hasPassword ? "New password link" : "New setup link"} />}
                </section>
              ))}
              {admins.length === 0 && <p className="text-sm text-mute">No administrators yet.</p>}
            </div>
            <Card title="Add an administrator" icon={UserPlus}>
              <div className="p-5">
                <LinkIssuer key={admins.length} action={addAdminAction.bind(null, agency.id)} label="Add and get their link">
                  <label className="grid gap-1.5 text-sm font-medium">Name<input name="adminName" required maxLength={120} className="field" autoComplete="off" /></label>
                  <label className="grid gap-1.5 text-sm font-medium">Email<input name="adminEmail" type="email" required maxLength={200} className="field" autoComplete="off" /></label>
                </LinkIssuer>
                <p className="mt-3 text-xs text-mute">Someone who already signs in to Mohuddle for another agency keeps their password and simply gains this one.</p>
              </div>
            </Card>
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#173e35] to-[#286b55] p-6 text-white">
                <div className="pointer-events-none absolute -bottom-16 -right-10 h-48 w-48 rounded-full bg-[#dcef98]/15 blur-2xl" aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Current plan</p>
                <p className="mt-1 text-3xl font-bold">{billing.plan?.name ?? "No plan"}</p>
                <p className="mt-3 text-4xl font-bold tabular-nums">{billing.billing.status === "complimentary" ? "Free" : money(monthly)}<span className="text-base font-medium text-white/60">{billing.billing.status === "complimentary" ? "" : " a month"}</span></p>
                {billing.plan && billing.billing.status !== "complimentary" && (
                  <p className="mt-1 text-sm text-white/65">{money(billing.plan.baseCents)} base{billing.plan.unit !== "none" ? ` + ${money(billing.plan.unitCents)} × ${unitCount(billing.plan.unit, units)}` : ""}</p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  {PLAN_FEATURES.map(feature => {
                    const has = !billing.plan || billing.plan.features.includes(feature.key);
                    return <span key={feature.key} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", has ? "bg-[#dcef98] text-[#173e35]" : "bg-white/10 text-white/45 line-through")}>{feature.label}</span>;
                  })}
                </div>
                <div className="mt-5"><BillingBadge status={billing.billing.status} state={state} /></div>
              </section>

              <Card title="Plan and status" icon={ShieldCheck}>
                <div className="p-5">
                  <ActionForm action={setAgencyBillingAction.bind(null, agency.id)} submitLabel="Save plan and status">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-1.5 text-sm font-medium">
                        <span>Plan</span>
                        <Select name="planId" defaultValue={billing.plan?.id ?? ""} options={plans.map(plan => ({ value: plan.id, label: plan.active ? plan.name : `${plan.name} (retired)` }))} aria-label="Plan" />
                      </div>
                      <div className="grid gap-1.5 text-sm font-medium">
                        <span>Status</span>
                        <Select name="status" defaultValue={billing.billing.status} options={Object.entries(BILLING_STATUSES).map(([value, words]) => ({ value, label: words }))} aria-label="Status" />
                      </div>
                      <label className="grid gap-1.5 text-sm font-medium">Trial ends<input type="date" name="trialEndsOn" defaultValue={billing.billing.trialEndsOn ?? ""} className="field" /></label>
                      <label className="grid gap-1.5 text-sm font-medium">Paid until<input type="date" name="paidUntil" defaultValue={billing.billing.paidUntil ?? ""} className="field" /></label>
                      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Notes<textarea name="notes" rows={2} maxLength={1000} defaultValue={billing.billing.notes} className="field" placeholder="Agreed price, invoice contact, anything to remember" /></label>
                    </div>
                  </ActionForm>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <Card title="Record a payment" icon={Receipt}>
                <div className="p-5">
                  <ActionForm action={recordPaymentAction.bind(null, agency.id)} submitLabel="Record payment">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium">Amount ($)<input name="amount" inputMode="decimal" required className="field" placeholder={monthly ? (monthly / 100).toFixed(2) : "0.00"} /></label>
                      <div className="grid gap-1.5 text-sm font-medium">
                        <span>How</span>
                        <Select name="method" defaultValue="invoice" options={[{ value: "invoice", label: "Invoice" }, { value: "bank transfer", label: "Bank transfer" }, { value: "check", label: "Check" }, { value: "card", label: "Card" }]} aria-label="How it was paid" />
                      </div>
                      <label className="grid gap-1.5 text-sm font-medium">Paid on<input type="date" name="paidOn" required defaultValue={today} className="field" /></label>
                      <label className="grid gap-1.5 text-sm font-medium">Pays up to<input type="date" name="coversUntil" required className="field" /></label>
                      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Note<input name="note" maxLength={300} className="field" placeholder="Invoice number, period" /></label>
                    </div>
                  </ActionForm>
                </div>
              </Card>
              <Card title={`Payments (${payments.length})`} icon={CircleDollarSign}>
                {payments.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-mute">No payments recorded yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-mute">
                      <tr className="border-b border-line">
                        <th className="px-5 py-2.5 font-semibold">Paid</th>
                        <th className="px-3 py-2.5 font-semibold">How</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                        <th className="px-5 py-2.5 font-semibold">Pays up to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(payment => (
                        <tr key={payment.id} className="border-b border-line/60 last:border-0">
                          <td className="px-5 py-3">{fmt.day(payment.paidOn)}{payment.note && <span className="block text-xs text-mute">{payment.note}</span>}</td>
                          <td className="px-3 py-3 capitalize text-mute">{payment.method}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(payment.amountCents)}</td>
                          <td className="px-5 py-3 text-mute">{fmt.day(payment.coversUntil)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card title={`Owner activity (${events.length})`} icon={ScrollText}>
              {events.length === 0 ? (
                <p className="px-5 py-6 text-sm text-mute">Nothing yet.</p>
              ) : (
                <ol className="relative space-y-5 px-5 py-5 before:absolute before:bottom-5 before:left-[27px] before:top-5 before:w-px before:bg-line">
                  {events.map(event => (
                    <li key={event.id} className="relative flex gap-3 text-sm">
                      <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-brand ring-2 ring-sky" />
                      <span className="min-w-0">
                        <span className="font-semibold">{ownerActionWords(event.action)}</span>
                        <span className="block text-xs text-mute">{fmt.dateTime(event.at)} · {event.ownerName}</span>
                        {event.detail && <span className="mt-1 block text-mute">{event.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <div className="space-y-6">{supportCard}</div>
          </div>
        )}
      </div>

      {/* Turning it off or on, kept apart from everything else. */}
      {(tab === "overview" || tab === "profile") && (
        <section className={cn("flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5", agency.active ? "border-flag/25 bg-flag-soft/40" : "border-line bg-white")}>
          <div className="flex items-start gap-3">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", agency.active ? "bg-flag-soft text-flag" : "bg-sage-soft text-sage")}><Power className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-bold">{agency.active ? "Turn this agency off" : "Turn this agency back on"}</p>
              <p className="max-w-xl text-xs text-mute">
                {agency.active
                  ? "Everyone there is signed out at once and nobody can sign in. Reminders stop. Every record stays, and turning it back on restores everything."
                  : "Its people can sign in again, and reminders start again."}
              </p>
            </div>
          </div>
          <ConfirmAction
            action={setAgencyActiveAction.bind(null, agency.id, !agency.active)}
            label={agency.active ? "Turn off" : "Turn back on"}
            confirm={agency.active ? `Turn off ${agency.name}? Everyone there is signed out now.` : undefined}
            tone={agency.active ? "danger" : "brand"}
          />
        </section>
      )}
    </div>
  );
}
