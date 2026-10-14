import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, CalendarDays, ClipboardList, Inbox, Pill, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { Avatar, Badge, Empty, PageHeader, Panel, Stat } from "@/components/app/ui";
import { daysBetween, fmt, initials, label } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { todayOverview } from "@/server/queries/dashboard";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const o = await todayOverview();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const completion = o.census ? Math.round(o.loggedCount / o.census * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Your daily overview"
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`${o.onShift.filter(shift => shift.staffFirst).length} staff on shift across ${o.homes} homes. ${o.loggedCount} of ${o.census} daily logs written so far.`}
        action={
          <Link href="/app/daily-logs/new" className="btn-brand">
            <ClipboardList className="h-4 w-4" /> Write a daily log
          </Link>
        }
      />
      {denied && (
        <p className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-[#8a5a10]">
          That page is for coordinators and administrators.
        </p>
      )}

      <section className="hub-overview-banner">
        <div><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Care, connected.</span><h2>A clear view. A better day.</h2><p>{o.meds.late ? `${o.meds.late} late ${o.meds.late === 1 ? "dose needs" : "doses need"} review. ` : "Medication rounds are on track. "}{o.awaitingLog.length ? `${o.awaitingLog.length} people are still waiting for today's care notes.` : "Everyone has a care note for today."}</p></div>
        <div className="hub-progress"><div className="hub-progress-ring" style={{ "--progress": `${completion}%` } as CSSProperties} aria-label={`Daily logs ${completion} percent complete`}><span>{completion}%</span></div><div className="hub-progress-detail"><strong>{o.loggedCount} of {o.census}</strong>Daily logs complete<br /><Link href="/app/daily-logs" className="text-white underline underline-offset-4">View care notes</Link></div></div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="People supported" value={o.census} hint={`${o.homes} active homes`} icon={Users} href="/app/individuals" />
        <Stat
          label="Medications today"
          value={`${o.meds.given}/${o.meds.total}`}
          hint={o.meds.late ? `${o.meds.late} running late` : `${o.meds.due} still due`}
          icon={Pill}
          tone={o.meds.late ? "bad" : "plum"}
          href="/app/medications"
        />
        <Stat
          label="Open incidents"
          value={o.incidentCount}
          hint={o.openIncidents.some(i => i.reportable) ? "Includes reportable incidents" : "Nothing reportable open"}
          icon={AlertTriangle}
          tone={o.openIncidents.length ? "warn" : "good"}
          href="/app/incidents"
        />
        <Stat
          label="Credentials expiring"
          value={o.credentialCount}
          hint={`Within ${o.settings.credential_warning_days} days`}
          icon={BadgeCheck}
          tone={o.expiring.length ? "warn" : "good"}
          href="/app/staff"
        />
      </div>

      <nav className="hub-action-strip" aria-label="Quick actions"><Link href="/app/daily-logs/new"><ClipboardList className="h-3.5 w-3.5" /> Write a care note</Link><Link href="/app/medications"><Pill className="h-3.5 w-3.5" /> Medication rounds</Link><Link href="/app/schedule"><CalendarDays className="h-3.5 w-3.5" /> View schedule</Link><Link href="/app/incidents/new"><AlertTriangle className="h-3.5 w-3.5" /> Report an incident</Link></nav>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel title="On shift right now" action={<Link href="/app/schedule" className="text-xs font-semibold text-brand">Schedule <ArrowRight className="inline h-3 w-3" /></Link>}>
            {o.onShift.length === 0 ? (
              <Empty>No shift is running at this moment.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.onShift.map(shift => (
                  <li key={shift.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar initials={shift.staffFirst ? initials(shift.staffFirst, shift.staffLast ?? "") : "?"} tone={shift.staffFirst ? "brand" : "bad"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{shift.staffFirst ? `${shift.staffFirst} ${shift.staffLast}` : "Unfilled"}</p>
                      <p className="text-xs text-mute">{shift.home} · {label("shiftKind", shift.kind)} · until {fmt.time(shift.endsAt)}</p>
                    </div>
                    <Badge tone={shift.status === "confirmed" ? "good" : shift.staffFirst ? "neutral" : "bad"}>{label("shiftStatus", shift.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Medications running late" action={<Link href="/app/medications" className="text-xs font-semibold text-brand">Open the MAR <ArrowRight className="inline h-3 w-3" /></Link>}>
            {o.lateMeds.length === 0 ? (
              <Empty>Nothing is late. Due doses are inside the {o.settings.med_late_minutes}-minute window.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.lateMeds.map(dose => (
                  <li key={dose.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar initials={initials(dose.first, dose.last)} tone="bad" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{dose.first} {dose.last}</p>
                      <p className="text-xs text-mute">{dose.medication} {dose.dose} · due {fmt.time(dose.scheduledFor)}</p>
                    </div>
                    <Link href="/app/medications" className="btn-ghost btn-sm">Record</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Open incidents" action={<Link href="/app/incidents/new" className="text-xs font-semibold text-brand">Report an incident</Link>}>
            {o.openIncidents.length === 0 ? (
              <Empty>No open incidents.</Empty>
            ) : (
              <table className="table">
                <thead><tr><th>When</th><th>Who</th><th>What</th><th>Severity</th><th>Status</th></tr></thead>
                <tbody>
                  {o.openIncidents.map(incident => (
                    <tr key={incident.id}>
                      <td className="whitespace-nowrap">{fmt.dateTime(incident.occurredAt)}</td>
                      <td>{incident.first ? `${incident.first} ${incident.last}` : incident.home ?? "Home"}</td>
                      <td>{label("incidentCategory", incident.category)}{incident.reportable && <Badge tone="bad" className="ml-2">Reportable</Badge>}</td>
                      <td><Badge tone={incident.severity === "critical" || incident.severity === "high" ? "bad" : incident.severity === "moderate" ? "warn" : "neutral"}>{label("incidentSeverity", incident.severity)}</Badge></td>
                      <td><Link href={`/app/incidents/${incident.id}`} className="font-semibold text-brand">{label("incidentStatus", incident.status)}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title={`Daily logs due by ${o.settings.daily_log_due_hour}:00`}>
            {o.awaitingLog.length === 0 ? (
              <Empty>Every person has a log for today.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.awaitingLog.slice(0, 8).map(person => (
                  <li key={person.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar initials={initials(person.first, person.last)} size="sm" tone="neutral" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{person.first} {person.last}</p>
                      <p className="text-xs text-mute">{person.home ?? "No home set"}</p>
                    </div>
                    <Link href={`/app/daily-logs/new?individual=${person.id}`} className="text-xs font-semibold text-brand">Log</Link>
                  </li>
                ))}
                {o.awaitingLog.length > 8 && <li className="px-5 py-2 text-xs text-mute">and {o.awaitingLog.length - 8} more</li>}
              </ul>
            )}
          </Panel>

          <Panel title="Open shifts this week" action={<Link href="/app/schedule" className="text-xs font-semibold text-brand">Fill</Link>}>
            {o.openShifts.length === 0 ? (
              <Empty>Every shift this week has someone on it.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.openShifts.map(shift => (
                  <li key={shift.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span><span className="font-semibold">{shift.home}</span> <span className="text-mute">· {label("shiftKind", shift.kind)}</span></span>
                    <span className="text-xs text-mute">{fmt.dateTime(shift.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Credentials to renew">
            {o.expiring.length === 0 ? (
              <Empty>Nothing expires in the next {o.settings.credential_warning_days} days.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.expiring.map(item => {
                  const days = item.expiresAt ? daysBetween(o.today, item.expiresAt) : 0;
                  return (
                    <li key={item.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span><span className="font-semibold">{item.first} {item.last}</span> <span className="text-mute">· {item.type}</span></span>
                      <Badge tone={days < 0 ? "bad" : days <= 7 ? "warn" : "neutral"}>{days < 0 ? `Expired ${-days}d ago` : days === 0 ? "Today" : `${days}d`}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Tasks due today">
            {o.tasksDue.length === 0 ? (
              <Empty>No tasks due.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.tasksDue.map(task => (
                  <li key={task.id} className="px-5 py-2.5 text-sm">
                    <p className="font-semibold">{task.title}</p>
                    <p className="text-xs text-mute">{task.assignee ?? "Unassigned"}{task.dueAt ? ` · ${fmt.time(task.dueAt)}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {canManage(user) && o.newEnquiries > 0 && (
            <Link href="/app/enquiries" className="card flex items-center gap-3 p-4 transition hover:shadow-[var(--shadow-float)]">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky text-brand-deep"><Inbox className="h-4 w-4" /></span>
              <span className="text-sm"><span className="font-semibold">{o.newEnquiries} new website message{o.newEnquiries === 1 ? "" : "s"}</span><span className="block text-xs text-mute">From families, referrers and applicants</span></span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
