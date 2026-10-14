import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  HeartPulse,
  Inbox,
  ListChecks,
  Phone,
  Pill,
  ShieldAlert,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AppointmentList } from "@/components/appointments/AppointmentParts";
import { Avatar, Badge, Empty, Panel } from "@/components/app/ui";
import { OwedShifts } from "@/components/logs/OwedShifts";
import { ClockCard } from "@/components/clock/ClockCard";
import { followUpState } from "@/lib/appointments";
import { cn } from "@/lib/cn";
import { compactRange } from "@/lib/schedule";
import { daysBetween, fmt, initials, label } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { listAppointments } from "@/server/queries/appointments";
import { todayOverview } from "@/server/queries/dashboard";
import { getSettings } from "@/server/settings";
import { notesOwed, owedTotals } from "@/server/queries/notes-owed";

const TABS = [
  ["attention", "Needs attention", AlertTriangle],
  ["shifts", "Shifts and notes", ClipboardCheck],
  ["care", "Care today", HeartPulse],
  ["incidents", "Incidents", ShieldAlert],
  ["team", "Staff and admin", Users],
] as const;
type Tab = (typeof TABS)[number][0];

type Action = { key: string; level: "now" | "today" | "soon"; icon: LucideIcon; title: string; detail: string; href: string; cta: string };
const LEVEL = {
  now: { title: "Do now", ring: "border-l-flag", chip: "bg-flag-soft text-flag" },
  today: { title: "Today", ring: "border-l-accent", chip: "bg-accent-soft text-[#8a5a10]" },
  soon: { title: "Coming up", ring: "border-l-brand", chip: "bg-sky text-brand-deep" },
} as const;

/*
 * The day at a glance. A short header and a strip of counts on top; the detail sits in tabs, starting
 * with one list of everything that needs someone to act, most urgent first.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string; tab?: string }> }) {
  const user = await requireUser();
  const { denied, tab: tabParam } = await searchParams;
  const manager = canManage(user);
  const [now, settings] = await Promise.all([requestTime(), getSettings()]);
  const since = new Date(now - 36 * 3_600_000);
  const [o, myOwed, allOwed, toDocument, upcoming, followUps] = await Promise.all([
    todayOverview(),
    user.staffId ? notesOwed({ from: since, staffId: user.staffId }) : Promise.resolve([]),
    manager ? notesOwed({ from: since }) : Promise.resolve([]),
    listAppointments({ view: "document", limit: 20 }),
    listAppointments({ view: "upcoming", limit: 30 }),
    listAppointments({ view: "followup", limit: 20 }),
  ]);
  const tab: Tab = TABS.some(([value]) => value === tabParam) ? (tabParam as Tab) : "attention";
  const myTotals = owedTotals(myOwed);
  const teamTotals = owedTotals(allOwed);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const soon = upcoming.filter(visit => visit.scheduledAt.getTime() - now < 3 * 86_400_000);
  const todayVisits = upcoming.filter(visit => fmt.day(visit.scheduledAt) === fmt.day(new Date(now)) && visit.scheduledAt.getTime() - now < 86_400_000);
  const reportHours = o.settings.incident_report_hours;
  const filings = o.openIncidents
    .filter(incident => incident.reportable && !incident.stateFiledAt)
    .map(incident => ({ ...incident, deadline: incident.occurredAt.getTime() + reportHours * 3_600_000 }));
  const overdueFollowUps = followUps.filter(visit => followUpState(visit, o.today) === "overdue");
  const docOverdue = toDocument.filter(visit => now - visit.scheduledAt.getTime() > o.settings.appointment_document_hours * 3_600_000);
  const expired = o.expiring.filter(item => item.expiresAt && item.expiresAt < o.today);

  // One list of what needs doing, most urgent first.
  const actions: Action[] = [];
  for (const dose of o.lateMeds.slice(0, 6)) {
    actions.push({ key: `med-${dose.id}`, level: "now", icon: Pill, title: `${dose.first} ${dose.last}: ${dose.medication} is late`, detail: `Due ${fmt.time(dose.scheduledFor)}${dose.home ? ` · ${dose.home}` : ""}`, href: "/app/medications", cta: "Open MAR" });
  }
  if (o.meds.late > 6) {
    actions.push({ key: "med-more", level: "now", icon: Pill, title: `${o.meds.late - 6} more late doses`, detail: "Including earlier days still not recorded", href: "/app/medications", cta: "Open MAR" });
  }
  for (const filing of filings) {
    const overdue = filing.deadline < now;
    actions.push({
      key: `filing-${filing.id}`,
      level: overdue || filing.deadline - now < 6 * 3_600_000 ? "now" : "today",
      icon: ShieldAlert,
      title: `${overdue ? "State filing overdue" : "File with the state"}: ${label("incidentCategory", filing.category)}${filing.first ? ` for ${filing.first}` : ""}`,
      detail: overdue ? `Was due ${fmt.dateTime(new Date(filing.deadline))}` : `Due by ${fmt.dateTime(new Date(filing.deadline))}`,
      href: `/app/incidents/${filing.id}`,
      cta: "Record filing",
    });
  }
  if (myTotals.missing) {
    actions.push({ key: "my-notes", level: myTotals.overdue ? "now" : "today", icon: ClipboardList, title: `You owe ${myTotals.missing} daily ${myTotals.missing === 1 ? "note" : "notes"}`, detail: myTotals.overdue ? `${myTotals.overdue} past the deadline` : "From your recent shifts", href: "/app?tab=shifts", cta: "Write them" });
  }
  if (manager && teamTotals.overdue) {
    actions.push({ key: "team-notes", level: "now", icon: ClipboardCheck, title: `${teamTotals.overdue} daily notes overdue across homes`, detail: "Staff have been reminded", href: "/app/daily-logs?view=owed", cta: "See who" });
  }
  for (const visit of docOverdue) {
    actions.push({ key: `doc-${visit.id}`, level: "now", icon: Stethoscope, title: `Document ${visit.first}'s ${visit.type.toLowerCase()} visit`, detail: `It was ${fmt.dateTime(visit.scheduledAt)}${visit.escort ? ` · ${visit.escort} went` : ""}`, href: `/app/appointments/${visit.id}`, cta: "Document" });
  }
  for (const visit of toDocument.filter(visit => !docOverdue.includes(visit))) {
    actions.push({ key: `doc-${visit.id}`, level: "today", icon: Stethoscope, title: `Document ${visit.first}'s ${visit.type.toLowerCase()} visit`, detail: fmt.dateTime(visit.scheduledAt), href: `/app/appointments/${visit.id}`, cta: "Document" });
  }
  for (const visit of soon.filter(visit => !visit.escortStaffId)) {
    actions.push({ key: `escort-${visit.id}`, level: "today", icon: Users, title: `Choose who goes with ${visit.first} to ${visit.type.toLowerCase()}`, detail: fmt.dateTime(visit.scheduledAt), href: `/app/appointments/${visit.id}`, cta: "Choose" });
  }
  for (const visit of overdueFollowUps) {
    actions.push({ key: `follow-${visit.id}`, level: "today", icon: CalendarDays, title: `Book ${visit.first}'s ${visit.type.toLowerCase()} follow-up`, detail: `Was needed by ${fmt.day(visit.followUpBy)}`, href: `/app/appointments/${visit.id}`, cta: "Book" });
  }
  for (const shift of o.openShifts.filter(shift => shift.startsAt.getTime() - now < 48 * 3_600_000)) {
    actions.push({ key: `shift-${shift.id}`, level: shift.startsAt.getTime() - now < 12 * 3_600_000 ? "now" : "today", icon: CalendarDays, title: `Open shift at ${shift.home}`, detail: `${shift.pattern ?? label("shiftKind", shift.kind)} · ${fmt.dateTime(shift.startsAt)}`, href: `/app/schedule?home=${shift.homeId}`, cta: "Fill" });
  }
  if (o.awaitingLog.length && hour >= 12) {
    actions.push({ key: "awaiting", level: hour >= o.settings.daily_log_due_hour - 3 ? "today" : "soon", icon: ClipboardList, title: `${o.awaitingLog.length} people have no note yet today`, detail: o.awaitingLog.slice(0, 4).map(person => person.first).join(", ") + (o.awaitingLog.length > 4 ? "…" : ""), href: "/app?tab=care", cta: "See who" });
  }
  for (const visit of todayVisits.filter(visit => visit.escortStaffId)) {
    actions.push({ key: `visit-${visit.id}`, level: "soon", icon: Stethoscope, title: `${visit.first}: ${visit.type} at ${fmt.time(visit.scheduledAt)}`, detail: `${visit.clinic || "Clinic not set"} · with ${visit.escort}`, href: `/app/appointments/${visit.id}`, cta: "Visit sheet" });
  }
  for (const task of o.tasksDue.slice(0, 4)) {
    actions.push({ key: `task-${task.id}`, level: "soon", icon: ListChecks, title: task.title, detail: `${task.assignee ?? "Unassigned"}${task.dueAt ? ` · due ${fmt.time(task.dueAt)}` : ""}`, href: "/app/tasks", cta: "Open" });
  }
  if (manager && expired.length) {
    actions.push({ key: "expired", level: "soon", icon: BadgeCheck, title: `${expired.length} expired ${expired.length === 1 ? "credential" : "credentials"}`, detail: expired.slice(0, 3).map(item => `${item.first} ${item.type}`).join(", "), href: "/app?tab=team", cta: "Review" });
  }
  const urgent = actions.filter(action => action.level === "now").length;

  const strip: { label: string; value: number; tone: "bad" | "warn" | "good"; href: string; icon: LucideIcon }[] = [
    { label: "Late doses", value: o.meds.late, tone: o.meds.late ? "bad" : "good", href: "/app/medications", icon: Pill },
    { label: manager ? "Notes overdue" : "Notes you owe", value: manager ? teamTotals.overdue : myTotals.missing, tone: (manager ? teamTotals.overdue : myTotals.missing) ? "bad" : "good", href: "/app/daily-logs?view=owed", icon: ClipboardCheck },
    { label: "Visits to document", value: toDocument.length, tone: docOverdue.length ? "bad" : toDocument.length ? "warn" : "good", href: "/app/appointments?view=document", icon: Stethoscope },
    { label: "Filings due", value: filings.length, tone: filings.some(filing => filing.deadline < now) ? "bad" : filings.length ? "warn" : "good", href: "/app/incidents?status=active&reportable=yes", icon: ShieldAlert },
    { label: "Open shifts", value: o.openShifts.length, tone: o.openShifts.length ? "warn" : "good", href: "/app/schedule", icon: CalendarDays },
  ];
  const badges: Partial<Record<Tab, number>> = { attention: actions.length, incidents: o.incidentCount, care: o.meds.late + toDocument.length };

  return (
    <div className="max-w-7xl">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">{fmt.dayLong(o.today)}</p>
          <h1 className="mt-1 text-3xl font-bold">{greeting}, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-mute">
            {o.onShift.filter(shift => shift.staffFirst).length} staff on shift across {o.homes} homes · {o.census} people supported ·{" "}
            {urgent ? <span className="font-semibold text-flag">{urgent} {urgent === 1 ? "thing needs" : "things need"} doing now</span> : <span className="font-semibold text-sage">nothing urgent right now</span>}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Quick actions">
          <Link href="/app/daily-logs/new" className="btn-brand btn-sm"><ClipboardList className="h-4 w-4" /> Write a note</Link>
          <Link href="/app/medications" className="btn-ghost btn-sm"><Pill className="h-4 w-4" /> Med rounds</Link>
          <Link href="/app/appointments/new" className="btn-ghost btn-sm"><Stethoscope className="h-4 w-4" /> Book visit</Link>
          <Link href="/app/incidents/new" className="btn-ghost btn-sm"><AlertTriangle className="h-4 w-4" /> Incident</Link>
        </nav>
      </header>

      {user.staffId && <ClockCard staffId={user.staffId} now={now} settings={settings} />}

      {denied && <p className="mb-5 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-[#8a5a10]">That page is for coordinators and administrators.</p>}

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {strip.map(item => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]",
              item.tone === "bad" ? "border-flag/30" : item.tone === "warn" ? "border-accent/40" : "border-line",
            )}
          >
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", item.tone === "bad" ? "bg-flag-soft text-flag" : item.tone === "warn" ? "bg-accent-soft text-[#8a5a10]" : "bg-sage-soft text-sage")}>
              {item.value === 0 ? <CheckCircle2 className="h-4 w-4" /> : <item.icon className="h-4 w-4" />}
            </span>
            <span>
              <span className={cn("block font-display text-xl font-bold leading-tight", item.tone === "bad" && "text-flag")}>{item.value}</span>
              <span className="block text-xs text-mute">{item.label}</span>
            </span>
          </Link>
        ))}
      </div>

      <nav className="mb-6 flex flex-wrap gap-1 rounded-xl bg-panel p-1 lg:flex-nowrap lg:overflow-x-auto" aria-label="Today sections">
        {TABS.map(([value, text, Icon]) => (
          <Link
            key={value}
            href={value === "attention" ? "/app" : `/app?tab=${value}`}
            aria-current={tab === value ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition", tab === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}
          >
            <Icon className="h-4 w-4" /> {text}
            {badges[value] ? <span className={cn("chip px-1.5 py-0", value === "attention" && urgent ? "bg-flag-soft text-flag" : "bg-white/70 text-mute")}>{badges[value]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "attention" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            {actions.length === 0 ? (
              <div className="card flex flex-col items-center px-6 py-14 text-center">
                <CheckCircle2 className="h-10 w-10 text-sage" />
                <p className="mt-3 font-display text-xl font-bold">All clear</p>
                <p className="mt-1 max-w-sm text-sm text-mute">No late doses, overdue notes, undocumented visits, filing deadlines or open shifts in the next two days.</p>
              </div>
            ) : (
              (["now", "today", "soon"] as const).map(level => {
                const list = actions.filter(action => action.level === level);
                if (!list.length) return null;
                return (
                  <section key={level}>
                    <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mute">
                      {LEVEL[level].title} <span className={cn("chip px-1.5 py-0", LEVEL[level].chip)}>{list.length}</span>
                    </h2>
                    <ul className="card divide-y divide-line/60 overflow-hidden">
                      {list.map(action => (
                        <li key={action.key} className={cn("border-l-4", LEVEL[level].ring)}>
                          <Link href={action.href} className="flex items-center gap-3 px-4 py-3 hover:bg-panel/50">
                            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", LEVEL[level].chip)}><action.icon className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{action.title}</span>
                              <span className="block truncate text-xs text-mute">{action.detail}</span>
                            </span>
                            <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-brand sm:flex">{action.cta} <ArrowRight className="h-3 w-3" /></span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>

          <aside className="space-y-5">
            <Panel title="On shift now" action={<Link href="/app?tab=shifts" className="text-xs font-semibold text-brand">Shifts</Link>}>
              {o.onShift.length === 0 ? (
                <Empty>No shift is running.</Empty>
              ) : (
                <ul className="divide-y divide-line/60">
                  {o.onShift.slice(0, 6).map(shift => (
                    <li key={shift.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar initials={shift.staffFirst ? initials(shift.staffFirst, shift.staffLast ?? "") : "?"} tone={shift.staffFirst ? "brand" : "bad"} size="sm" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-semibold">{shift.staffFirst ? `${shift.staffFirst} ${shift.staffLast}` : "Unfilled"}</span>
                        <span className="block truncate text-xs text-mute">{shift.home} · until {fmt.time(shift.endsAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Medications today" action={<Link href="/app/medications" className="text-xs font-semibold text-brand">MAR</Link>}>
              <div className="px-4 py-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-display text-2xl font-bold">{o.meds.given}<span className="text-base text-mute">/{o.meds.total}</span></p>
                  <p className={cn("text-xs font-semibold", o.meds.late ? "text-flag" : "text-sage")}>{o.meds.late ? `${o.meds.late} late` : "On time"}</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                  <div className="h-full rounded-full bg-sage" style={{ width: `${o.meds.total ? (o.meds.given / o.meds.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-mute">{o.meds.due} still due today</p>
              </div>
            </Panel>
            <Panel title="Today's notes">
              <div className="px-4 py-4">
                <p className="font-display text-2xl font-bold">{o.loggedCount}<span className="text-base text-mute">/{o.census}</span></p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${o.census ? (o.loggedCount / o.census) * 100 : 0}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-mute">People with at least one note today</p>
              </div>
            </Panel>
          </aside>
        </div>
      )}

      {tab === "shifts" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            {user.staffId && (
              <Panel title={myTotals.missing ? `Your notes · ${myTotals.missing} to write` : "Your notes"} action={<Link href="/app/daily-logs?view=owed" className="text-xs font-semibold text-brand">All</Link>}>
                <OwedShifts shifts={[...myOwed].reverse()} myStaffId={user.staffId} empty="No shifts in the last day and a half." />
              </Panel>
            )}
            <Panel title="On shift right now" action={<Link href="/app/schedule" className="text-xs font-semibold text-brand">Schedule</Link>}>
              {o.onShift.length === 0 ? (
                <Empty>No shift is running at this moment.</Empty>
              ) : (
                <ul className="divide-y divide-line/60">
                  {o.onShift.map(shift => (
                    <li key={shift.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar initials={shift.staffFirst ? initials(shift.staffFirst, shift.staffLast ?? "") : "?"} tone={shift.staffFirst ? "brand" : "bad"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{shift.staffFirst ? `${shift.staffFirst} ${shift.staffLast}` : "Unfilled"}</p>
                        <p className="text-xs text-mute">{shift.home} · {shift.pattern ?? label("shiftKind", shift.kind)} {compactRange({ startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() })}</p>
                      </div>
                      {shift.staffPhone && <a href={`tel:${shift.staffPhone}`} className="text-brand" aria-label="Call"><Phone className="h-4 w-4" /></a>}
                      <Badge tone={shift.status === "confirmed" ? "good" : shift.staffFirst ? "neutral" : "bad"}>{label("shiftStatus", shift.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="space-y-6">
            {manager && (
              <Panel title="Notes across homes" action={<Link href="/app/daily-logs?view=owed" className="text-xs font-semibold text-brand">Who owes notes</Link>}>
                <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
                  {[
                    ["Written", `${teamTotals.written}/${teamTotals.expected}`, "text-sage"],
                    ["To write", String(teamTotals.missing), teamTotals.missing ? "text-[#8a5a10]" : ""],
                    ["Overdue", String(teamTotals.overdue), teamTotals.overdue ? "text-flag" : "text-sage"],
                  ].map(([title, value, tone]) => (
                    <div key={title} className="px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</p>
                      <p className={`font-display text-xl font-bold ${tone}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <OwedShifts shifts={[...allOwed].reverse().filter(shift => shift.state === "overdue")} myStaffId={user.staffId} showComplete={false} empty="No overdue notes." />
              </Panel>
            )}
            <Panel title="Open shifts this week" action={<Link href="/app/schedule" className="text-xs font-semibold text-brand">Fill</Link>}>
              {o.openShifts.length === 0 ? (
                <Empty>Every shift this week has someone on it.</Empty>
              ) : (
                <ul className="divide-y divide-line/60">
                  {o.openShifts.map(shift => (
                    <li key={shift.id}>
                      <Link href={`/app/schedule?home=${shift.homeId}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-panel/50">
                        <span><span className="font-semibold">{shift.home}</span> <span className="text-mute">· {shift.pattern ?? label("shiftKind", shift.kind)}</span></span>
                        <span className="text-xs text-mute">{fmt.dateTime(shift.startsAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "care" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel title="Medications running late" action={<Link href="/app/medications" className="text-xs font-semibold text-brand">Open the MAR</Link>}>
              {o.lateMeds.length === 0 ? (
                <Empty>Nothing is late. Due doses are inside the {o.settings.med_late_minutes}-minute window.</Empty>
              ) : (
                <ul className="divide-y divide-line/60">
                  {o.lateMeds.map(dose => (
                    <li key={dose.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar initials={initials(dose.first, dose.last)} tone="bad" size="sm" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold">{dose.first} {dose.last} · {dose.medication}</p>
                        <p className="text-xs text-mute">Due {fmt.time(dose.scheduledFor)}{dose.home ? ` · ${dose.home}` : ""}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Appointments: next three days" action={<Link href="/app/appointments" className="text-xs font-semibold text-brand">All appointments</Link>}>
              <AppointmentList rows={soon} now={now} documentHours={o.settings.appointment_document_hours} empty="Nothing booked in the next three days." />
            </Panel>
            {toDocument.length > 0 && (
              <Panel title="Visits to document">
                <AppointmentList rows={toDocument} now={now} documentHours={o.settings.appointment_document_hours} empty="" />
              </Panel>
            )}
          </div>
          <Panel title={`No note yet today (${o.awaitingLog.length})`}>
            {o.awaitingLog.length === 0 ? (
              <Empty>Every person has a note for today.</Empty>
            ) : (
              <ul className="divide-y divide-line/60">
                {o.awaitingLog.map(person => (
                  <li key={person.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar initials={initials(person.first, person.last)} size="sm" tone="neutral" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/individuals/${person.id}`} className="block truncate text-sm font-semibold hover:text-brand">{person.first} {person.last}</Link>
                      <p className="text-xs text-mute">{person.home ?? "No home set"}</p>
                    </div>
                    <Link href={`/app/daily-logs/new?individual=${person.id}`} className="text-xs font-semibold text-brand">Write</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "incidents" && (
        <Panel title={`Open incidents (${o.incidentCount})`} action={<Link href="/app/incidents" className="text-xs font-semibold text-brand">All incidents</Link>}>
          {o.openIncidents.length === 0 ? (
            <Empty>No open incidents.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {o.openIncidents.map(incident => {
                const deadline = incident.occurredAt.getTime() + reportHours * 3_600_000;
                return (
                  <li key={incident.id}>
                    <Link href={`/app/incidents/${incident.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-panel/50">
                      <span className="w-28 shrink-0 text-xs text-mute">{fmt.dateTime(incident.occurredAt)}</span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold">{label("incidentCategory", incident.category)}</span>
                        <span className="text-mute"> · {incident.first ? `${incident.first} ${incident.last}` : incident.home ?? "Home"}</span>
                      </span>
                      <Badge tone={incident.severity === "critical" || incident.severity === "high" ? "bad" : incident.severity === "moderate" ? "warn" : "neutral"}>{label("incidentSeverity", incident.severity)}</Badge>
                      {incident.reportable && (incident.stateFiledAt ? <Badge tone="good">Filed</Badge> : <Badge tone="bad">{deadline < now ? "Filing overdue" : `File by ${fmt.time(new Date(deadline))}`}</Badge>)}
                      <Badge tone="brand">{label("incidentStatus", incident.status)}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {tab === "team" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Credentials to renew" action={<Link href="/app/staff?cred=any" className="text-xs font-semibold text-brand">Staff</Link>}>
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
          <div className="space-y-6">
            <Panel title="Tasks due today" action={<Link href="/app/tasks" className="text-xs font-semibold text-brand">All tasks</Link>}>
              {o.tasksDue.length === 0 ? (
                <Empty>No tasks due.</Empty>
              ) : (
                <ul className="divide-y divide-line/60">
                  {o.tasksDue.map(task => (
                    <li key={task.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <Clock className="h-4 w-4 shrink-0 text-dim" />
                      <span className="min-w-0">
                        <span className="block font-semibold">{task.title}</span>
                        <span className="block text-xs text-mute">{task.assignee ?? "Unassigned"}{task.dueAt ? ` · ${fmt.time(task.dueAt)}` : ""}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {manager && (
              <Link href="/app/enquiries" className="card flex items-center gap-3 p-4 transition hover:shadow-[var(--shadow-float)]">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky text-brand-deep"><Inbox className="h-4 w-4" /></span>
                <span className="text-sm">
                  <span className="font-semibold">{o.newEnquiries ? `${o.newEnquiries} new website message${o.newEnquiries === 1 ? "" : "s"}` : "No new website messages"}</span>
                  <span className="block text-xs text-mute">From families, referrers and applicants</span>
                </span>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
