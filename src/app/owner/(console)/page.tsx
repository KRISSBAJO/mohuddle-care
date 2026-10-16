import Link from "next/link";
import { and, count, eq, gt } from "drizzle-orm";
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, BellRing, Building2, CheckCircle2, CircleDollarSign, Hourglass, Inbox, KeyRound, MailWarning, PieChart, Plus, Search, ServerCrash, Sparkles, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { initialsOf, OwnerCard } from "@/components/owner/OwnerCard";
import { BILLING_STATUSES } from "@/lib/billing";
import type { BillingStatus } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { dateKey, fmt, money, zone } from "@/lib/format";
import { ownerActionWords } from "@/lib/owner-events";
import { billingOverview } from "@/server/billing";
import { requestTime } from "@/server/clock";
import { schema, systemDb } from "@/server/db";
import { healthLog } from "@/server/health-log";
import { listAgencies, ownerEvents } from "@/server/owner";
import { requireOwner } from "@/server/owner-auth";

// The layout's title template reaches only pages below it, so this one is written in full.
export const metadata = { title: { absolute: "Overview | Mohuddle admin" } };
export const dynamic = "force-dynamic";

type Attention = { icon: LucideIcon; tone: "warn" | "bad"; text: string; detail: string; href: string };

const STATUS_COLOURS: Record<BillingStatus, string> = { active: "#2f7d5b", trial: "#d99a1e", complimentary: "#8a6cc4", cancelled: "#b9b3a6" };

function Kpi({ icon: Icon, label, value, hint, href, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; hint: string; href?: string; tone: string }) {
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

/* The owner console's home: how Mohuddle is doing, and what needs doing. */
export default async function OverviewPage() {
  const owner = await requireOwner();
  const now = await requestTime();
  const [agencies, billing, events, [waiting], [failedEmail]] = await Promise.all([
    listAgencies(),
    billingOverview(),
    ownerEvents(),
    systemDb.select({ n: count() }).from(schema.productEnquiries).where(eq(schema.productEnquiries.handled, false)),
    systemDb.select({ n: count() }).from(schema.emailMessages).where(and(eq(schema.emailMessages.status, "failed"), gt(schema.emailMessages.createdAt, new Date(now - 86_400_000)))),
  ]);
  const active = agencies.filter(agency => agency.active);
  const people = active.reduce((sum, agency) => sum + agency.people, 0);
  const logins = active.reduce((sum, agency) => sum + agency.logins, 0);
  const paying = billing.filter(row => row.billing.status === "active" && row.state.mode !== "read_only");
  const monthly = paying.reduce((sum, row) => sum + row.monthly, 0);
  const trials = billing.filter(row => row.billing.status === "trial" && row.state.mode !== "read_only");
  // What trials would bring in a month if they all started paying today.
  const trialValue = trials.reduce((sum, row) => sum + row.monthly, 0);

  // What needs doing, most urgent first.
  const attention: Attention[] = [];
  for (const row of billing.filter(item => item.agency.active)) {
    const href = `/owner/agencies/${row.agency.id}?tab=billing`;
    const what = row.billing.status === "trial" ? "trial" : "paid period";
    if (row.state.mode === "read_only") attention.push({ icon: AlertTriangle, tone: "bad", text: `${row.agency.name} is read-only`, detail: `Its ${row.billing.status === "trial" ? "trial ended" : "subscription lapsed"}. Staff can look but not change anything.`, href });
    else if (row.state.mode === "past_due") attention.push({ icon: AlertTriangle, tone: "bad", text: `${row.agency.name} is past due`, detail: `Since ${fmt.day(row.state.endsOn)}. It goes read-only when the grace period ends.`, href });
    else if (row.state.mode === "ending") attention.push({ icon: Hourglass, tone: "warn", text: `${row.agency.name}'s ${what} ends soon`, detail: `On ${fmt.day(row.state.endsOn)}.`, href });
  }
  if (waiting.n) attention.push({ icon: Inbox, tone: "warn", text: `${waiting.n} demo ${waiting.n === 1 ? "request is" : "requests are"} waiting`, detail: "Someone asked to see Mohuddle and has not heard back.", href: "/owner/enquiries" });
  const lastSweep = healthLog().sweeps[0];
  const sweepLate = !lastSweep || now - lastSweep.finishedAt > 5 * 60_000;
  if (sweepLate) attention.push({ icon: ServerCrash, tone: "bad", text: "Reminders have not run lately", detail: "Nothing in the last few minutes. Check the health page.", href: "/owner/health" });
  if (failedEmail.n) attention.push({ icon: MailWarning, tone: "warn", text: `${failedEmail.n} ${failedEmail.n === 1 ? "email" : "emails"} failed`, detail: "In the last day.", href: "/owner/health" });
  attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1));

  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: zone() }).format(new Date(now)));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const biggest = [...active].sort((a, b) => b.people - a.people).slice(0, 6);
  const mostPeople = Math.max(1, ...biggest.map(agency => agency.people));

  // Where agencies stand, for the ring.
  const live = billing.filter(row => row.agency.active);
  const mix = (Object.keys(BILLING_STATUSES) as BillingStatus[]).map(status => ({ status, n: live.filter(row => row.billing.status === status).length })).filter(part => part.n > 0);
  let turned = 0;
  const ring = mix.length
    ? `conic-gradient(${mix
        .map(part => {
          const from = turned;
          turned += (part.n / live.length) * 360;
          return `${STATUS_COLOURS[part.status]} ${from}deg ${turned}deg`;
        })
        .join(", ")})`
    : "conic-gradient(#e7e2d6 0deg 360deg)";

  // Agencies added in each of the last six months.
  const months = Array.from({ length: 6 }, (_, back) => {
    const day = new Date(`${dateKey(new Date(now))}T12:00:00Z`);
    day.setUTCDate(1);
    day.setUTCMonth(day.getUTCMonth() - (5 - back));
    const key = day.toISOString().slice(0, 7);
    return { key, label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(day), n: agencies.filter(agency => dateKey(agency.createdAt).slice(0, 7) === key).length };
  });
  const busiestMonth = Math.max(1, ...months.map(month => month.n));
  const addedThisMonth = months[5].n;

  return (
    <div className="space-y-6">
      {/* Greeting and the money, at a glance. */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] text-white shadow-[0_24px_60px_-30px_#0e2a24]">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#dcef98]/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[#7fc6a4]/10 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">{fmt.dayLong(dateKey(new Date(now)))}</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{greeting}, {owner.name.split(" ")[0]}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              {active.length} {active.length === 1 ? "agency" : "agencies"} on Mohuddle, supporting {people} {people === 1 ? "person" : "people"} with {logins} staff {logins === 1 ? "login" : "logins"}.{" "}
              {attention.length ? `${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} you.` : "Nothing needs you right now."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/owner/agencies/new" className="inline-flex items-center gap-1.5 rounded-xl bg-[#dcef98] px-3.5 py-2 text-[13px] font-semibold text-[#173e35] hover:brightness-95"><Plus className="h-4 w-4" /> Add an agency</Link>
              <Link href="/owner/enquiries" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[13px] font-semibold hover:bg-white/20">
                <Inbox className="h-4 w-4" /> Demo requests
                {waiting.n > 0 && <span className="rounded-full bg-[#dcef98] px-1.5 text-[11px] text-[#173e35]">{waiting.n}</span>}
              </Link>
              <Link href="/owner/search" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-[13px] font-semibold hover:bg-white/20"><Search className="h-4 w-4" /> Search</Link>
            </div>
          </div>
          <Link href="/owner/billing" className="group rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10 transition hover:bg-white/[0.11] lg:min-w-72">
            <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">A month from paying <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></p>
            <p className="mt-2 text-4xl font-bold tabular-nums">{money(monthly, true)}</p>
            <p className="mt-1 text-sm text-white/60">{money(monthly * 12, true)} a year · {paying.length} paying</p>
            {trialValue > 0 && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#dcef98]/15 px-2.5 py-1 text-xs text-[#dcef98]"><TrendingUp className="h-3.5 w-3.5" /> +{money(trialValue, true)} if trials convert</p>}
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Building2} tone="bg-sky text-brand-deep" label="Active agencies" value={active.length} hint={agencies.length > active.length ? `${agencies.length - active.length} turned off` : addedThisMonth ? `${addedThisMonth} added this month` : "All switched on"} href="/owner/agencies" />
        <Kpi icon={Users} tone="bg-[#efe8fa] text-[#6b4fa8]" label="People supported" value={people} hint={`${logins} staff logins across every agency`} />
        <Kpi icon={Hourglass} tone="bg-accent-soft text-[#8a5a10]" label="On trial" value={trials.length} hint={trials.length ? `Next ends ${fmt.day(trials.map(row => row.state.endsOn).filter(Boolean).sort()[0] ?? null)}` : "None right now"} href="/owner/billing" />
        <Kpi icon={Inbox} tone="bg-sage-soft text-sage" label="Demo requests" value={waiting.n} hint={waiting.n ? "Waiting for a reply" : "All answered"} href="/owner/enquiries" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <OwnerCard title="Needs attention" icon={BellRing} action={attention.length > 0 && <span className="rounded-full bg-flag-soft px-2 py-0.5 text-[11px] font-bold text-flag">{attention.length}</span>}>
          {attention.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sage-soft text-sage"><CheckCircle2 className="h-7 w-7" /></span>
              <p className="mt-3 font-semibold">All clear</p>
              <p className="text-sm text-mute">Nothing needs you right now.</p>
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {attention.map(item => (
                <li key={item.text}>
                  <Link href={item.href} className={cn("group flex items-center gap-3 rounded-xl border-l-4 bg-[var(--color-panel)]/50 px-4 py-3 text-sm transition hover:bg-[var(--color-panel)]", item.tone === "bad" ? "border-flag" : "border-[#d99a1e]")}>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", item.tone === "bad" ? "bg-flag-soft text-flag" : "bg-accent-soft text-[#8a5a10]")}><item.icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.text}</span>
                      <span className="block text-xs text-mute">{item.detail}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-mute transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OwnerCard>

        <OwnerCard title="Recent activity" icon={Activity} action={<Link href="/owner/activity" className="text-xs font-semibold text-brand">Activity log</Link>}>
          {events.length === 0 ? (
            <p className="px-5 py-6 text-sm text-mute">Nothing yet.</p>
          ) : (
            <ol className="relative space-y-4 px-5 py-4 before:absolute before:bottom-4 before:left-[27px] before:top-4 before:w-px before:bg-line">
              {events.slice(0, 6).map(event => (
                <li key={event.id} className="relative flex gap-3 text-sm">
                  <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-brand ring-2 ring-sky" />
                  <span className="min-w-0">
                    <span className="font-semibold">{ownerActionWords(event.action)}</span>
                    {event.agency && <span className="text-mute"> · {event.agency}</span>}
                    <span className="block truncate text-xs text-mute">{fmt.dateTime(event.at)} · {event.ownerName.split(" (")[0]}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </OwnerCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <OwnerCard title="Where agencies stand" icon={PieChart}>
          <div className="flex items-center gap-6 p-5">
            <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: ring }}>
              <div className="absolute inset-[14px] grid place-items-center rounded-full bg-white text-center">
                <span><span className="block text-2xl font-bold tabular-nums">{live.length}</span><span className="block text-[11px] text-mute">active</span></span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2 text-sm">
              {mix.map(part => (
                <li key={part.status} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOURS[part.status] }} />
                  <span className="flex-1">{BILLING_STATUSES[part.status]}</span>
                  <span className="font-semibold tabular-nums">{part.n}</span>
                </li>
              ))}
              {mix.length === 0 && <li className="text-mute">No agencies yet.</li>}
            </ul>
          </div>
        </OwnerCard>

        <OwnerCard title="Agencies added" icon={TrendingUp}>
          <div className="p-5">
            <div className="flex h-28 items-end gap-2">
              {months.map(month => (
                <div key={month.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[11px] font-semibold tabular-nums text-mute">{month.n || ""}</span>
                  <div className={cn("w-full rounded-t-md", month.n ? "bg-gradient-to-t from-[#1b4a3e] to-[#3f8a6c]" : "bg-[var(--color-panel)]")} style={{ height: `${Math.max(6, (month.n / busiestMonth) * 80)}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              {months.map(month => <span key={month.key} className="flex-1 text-center text-[11px] text-mute">{month.label}</span>)}
            </div>
          </div>
        </OwnerCard>

        <OwnerCard title="Running Mohuddle" icon={Sparkles} action={<Link href="/owner/health" className="text-xs font-semibold text-brand">Health</Link>}>
          <ul className="divide-y divide-line/60 text-sm">
            <li className="flex items-center gap-3 px-5 py-3">
              <span className={cn("h-2.5 w-2.5 rounded-full", sweepLate ? "bg-flag" : "bg-sage")} />
              <span className="flex-1">Reminders</span>
              <span className="text-xs text-mute">{lastSweep ? `Ran ${fmt.time(new Date(lastSweep.finishedAt))}` : "Not run yet"}</span>
            </li>
            <li className="flex items-center gap-3 px-5 py-3">
              <span className={cn("h-2.5 w-2.5 rounded-full", failedEmail.n ? "bg-[#d99a1e]" : "bg-sage")} />
              <span className="flex-1">Email</span>
              <span className="text-xs text-mute">{failedEmail.n ? `${failedEmail.n} failed today` : "No failures today"}</span>
            </li>
            <li className="flex items-center gap-3 px-5 py-3">
              <KeyRound className="h-3.5 w-3.5 text-mute" />
              <span className="flex-1">Staff logins</span>
              <span className="text-xs font-semibold tabular-nums">{logins}</span>
            </li>
            <li className="flex items-center gap-3 px-5 py-3">
              <CircleDollarSign className="h-3.5 w-3.5 text-mute" />
              <span className="flex-1">Paying agencies</span>
              <span className="text-xs font-semibold tabular-nums">{paying.length}</span>
            </li>
          </ul>
        </OwnerCard>
      </div>

      <OwnerCard title="Largest agencies" icon={Building2} action={<Link href="/owner/agencies" className="text-xs font-semibold text-brand">All agencies</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-mute">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-semibold">Agency</th>
                <th className="px-3 py-2.5 font-semibold">People supported</th>
                <th className="px-3 py-2.5 text-right font-semibold">Logins</th>
                <th className="px-3 py-2.5 font-semibold">Standing</th>
                <th className="px-5 py-2.5 font-semibold">Last used</th>
              </tr>
            </thead>
            <tbody>
              {biggest.map(agency => {
                const row = billing.find(item => item.agency.id === agency.id);
                return (
                  <tr key={agency.id} className="group border-b border-line/60 transition last:border-0 hover:bg-[var(--color-panel)]/40">
                    <td className="px-5 py-3">
                      <Link href={`/owner/agencies/${agency.id}`} className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#173e35] text-xs font-bold text-[#dcef98]">{initialsOf(agency.name)}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold group-hover:text-brand">{agency.name}</span>
                          <span className="block font-mono text-[11px] text-mute">{agency.slug}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-panel)]"><div className="h-full rounded-full bg-sage" style={{ width: `${(agency.people / mostPeople) * 100}%` }} /></div>
                        <span className="tabular-nums">{agency.people}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.logins}</td>
                    <td className="px-3 py-3">{row && <BillingBadge status={row.billing.status} state={row.state} />}</td>
                    <td className="px-5 py-3 text-mute">{agency.lastSeen ? fmt.dateTime(new Date(agency.lastSeen)) : "Never"}</td>
                  </tr>
                );
              })}
              {biggest.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-mute">No agencies yet. <Link href="/owner/agencies/new" className="font-semibold text-brand">Add the first one</Link>.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </OwnerCard>
    </div>
  );
}
