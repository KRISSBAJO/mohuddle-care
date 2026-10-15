import Link from "next/link";
import { and, count, eq, gt } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, DollarSign, Hourglass, Inbox, MailWarning, ServerCrash, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel, Stat } from "@/components/app/ui";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { fmt, money, zone } from "@/lib/format";
import { ownerActionWords } from "@/lib/owner-events";
import { billingOverview } from "@/server/billing";
import { schema, systemDb } from "@/server/db";
import { healthLog } from "@/server/health-log";
import { listAgencies, ownerEvents } from "@/server/owner";
import { requestTime } from "@/server/clock";
import { requireOwner } from "@/server/owner-auth";

// The layout's title template reaches only pages below it, so this one is written in full.
export const metadata = { title: { absolute: "Overview | Mohuddle admin" } };
export const dynamic = "force-dynamic";

type Attention = { icon: LucideIcon; tone: "warn" | "bad"; text: string; href: string };

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

  // What needs doing, most urgent first.
  const attention: Attention[] = [];
  for (const row of billing.filter(item => item.agency.active)) {
    const href = `/owner/agencies/${row.agency.id}#billing`;
    if (row.state.mode === "read_only") attention.push({ icon: AlertTriangle, tone: "bad", text: `${row.agency.name} is read-only: its ${row.billing.status === "trial" ? "trial ended" : "subscription lapsed"}`, href });
    else if (row.state.mode === "past_due") attention.push({ icon: AlertTriangle, tone: "bad", text: `${row.agency.name} is past due since ${fmt.day(row.state.endsOn)}`, href });
    else if (row.state.mode === "ending") attention.push({ icon: Hourglass, tone: "warn", text: `${row.agency.name}'s ${row.billing.status === "trial" ? "trial" : "paid period"} ends ${fmt.day(row.state.endsOn)}`, href });
  }
  if (waiting.n) attention.push({ icon: Inbox, tone: "warn", text: `${waiting.n} demo ${waiting.n === 1 ? "request is" : "requests are"} waiting for a reply`, href: "/owner/enquiries" });
  const lastSweep = healthLog().sweeps[0];
  if (!lastSweep || now - lastSweep.finishedAt > 5 * 60_000) attention.push({ icon: ServerCrash, tone: "bad", text: "Reminders have not run in the last few minutes", href: "/owner/health" });
  if (failedEmail.n) attention.push({ icon: MailWarning, tone: "warn", text: `${failedEmail.n} ${failedEmail.n === 1 ? "email" : "emails"} failed in the last day`, href: "/owner/health" });
  attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1));

  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: zone() }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const biggest = [...active].sort((a, b) => b.people - a.people).slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="hub-page-header">
        <p className="eyebrow">{fmt.dayLong(new Date().toISOString().slice(0, 10))}</p>
        <h1 className="mt-1 text-3xl font-bold">{greeting}, {owner.name.split(" ")[0]}</h1>
        <p className="mt-1.5 text-sm text-mute">{active.length} {active.length === 1 ? "agency" : "agencies"} on Mohuddle, {people} people supported, {logins} staff logins.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label="Active agencies" value={active.length} hint={agencies.length > active.length ? `${agencies.length - active.length} turned off` : "All switched on"} href="/owner/agencies" />
        <Stat icon={Users} tone="plum" label="People supported" value={people} hint="Across every agency" />
        <Stat icon={DollarSign} tone="good" label="A month from paying" value={money(monthly, true)} hint={`${paying.length} paying`} href="/owner/billing" />
        <Stat icon={Hourglass} tone="warn" label="On trial" value={trials.length} hint={trials.length ? `Next ends ${fmt.day(trials.map(row => row.state.endsOn).filter(Boolean).sort()[0] ?? null)}` : "None right now"} href="/owner/billing" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Needs attention">
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-6 text-sm text-mute"><CheckCircle2 className="h-5 w-5 text-sage" /> Nothing needs you right now.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {attention.map(item => (
                <li key={item.text}>
                  <Link href={item.href} className="group flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-panel/60">
                    <span className={item.tone === "bad" ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-flag-soft text-flag" : "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-[#8a5a10]"}><item.icon className="h-4 w-4" /></span>
                    <span className="flex-1 font-medium">{item.text}</span>
                    <ArrowRight className="h-4 w-4 text-mute transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" action={<Link href="/owner/activity" className="text-xs font-semibold text-brand">Activity log</Link>}>
          {events.length === 0 ? (
            <p className="px-5 py-6 text-sm text-mute">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {events.slice(0, 7).map(event => (
                <li key={event.id} className="px-5 py-2.5 text-sm">
                  <span className="font-semibold">{ownerActionWords(event.action)}</span>
                  {event.agency && <span className="text-mute"> · {event.agency}</span>}
                  <span className="block text-xs text-mute">{fmt.dateTime(event.at)} · {event.ownerName.split(" (")[0]}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Agencies" action={<Link href="/owner/agencies" className="text-xs font-semibold text-brand">All agencies</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-mute">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Agency</th>
                <th className="px-3 py-3 text-right font-semibold">People</th>
                <th className="px-3 py-3 text-right font-semibold">Logins</th>
                <th className="px-3 py-3 font-semibold">Standing</th>
                <th className="px-5 py-3 font-semibold">Last used</th>
              </tr>
            </thead>
            <tbody>
              {biggest.map(agency => {
                const row = billing.find(item => item.agency.id === agency.id);
                return (
                  <tr key={agency.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3"><Link href={`/owner/agencies/${agency.id}`} className="font-semibold hover:text-brand">{agency.name}</Link></td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.people}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{agency.logins}</td>
                    <td className="px-3 py-3">{row && <BillingBadge status={row.billing.status} state={row.state} />}</td>
                    <td className="px-5 py-3 text-mute">{agency.lastSeen ? fmt.dateTime(new Date(agency.lastSeen)) : "Never"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}


