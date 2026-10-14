import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  HeartPulse,
  Home,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Phone,
  Pill,
  ShieldAlert,
  Stethoscope,
  Target,
  UserRound,
  UsersRound,
} from "lucide-react";
import { PrintButton } from "@/components/app/PrintButton";
import { Avatar, Badge } from "@/components/app/ui";
import { PersonAppointmentsTab } from "@/components/person/PersonAppointmentsTab";
import { PersonCareTeamTab } from "@/components/person/PersonCareTeamTab";
import { PersonDocumentsSection } from "@/components/docs/DocumentSections";
import { requestTime } from "@/server/clock";
import { PersonCarePlanTab } from "@/components/person/PersonCarePlanTab";
import { PersonHealthTab } from "@/components/person/PersonHealthTab";
import { PersonIncidentsTab } from "@/components/person/PersonIncidentsTab";
import { PersonLogsTab } from "@/components/person/PersonLogsTab";
import { PersonMedicationsTab } from "@/components/person/PersonMedicationsTab";
import { PersonOverviewTab } from "@/components/person/PersonOverviewTab";
import { PersonProfileTab } from "@/components/person/PersonProfileTab";
import { PersonTasksTab } from "@/components/person/PersonTasksTab";
import { cn } from "@/lib/cn";
import { age, dateKey, fmt, initials, label } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { personHeader } from "@/server/queries/person";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Person" };

const TABS = [
  ["overview", "Overview", LayoutDashboard],
  ["plan", "Care plan", Target],
  ["medications", "Medications", Pill],
  ["appointments", "Appointments", Stethoscope],
  ["health", "Health", HeartPulse],
  ["care-team", "Care team", UsersRound],
  ["logs", "Daily logs", ClipboardList],
  ["incidents", "Incidents", ShieldAlert],
  ["documents", "Documents", FolderOpen],
  ["tasks", "Tasks", ListChecks],
  ["profile", "Profile & history", UserRound],
] as const;
export type PersonTab = (typeof TABS)[number][0];

type Search = Record<string, string | undefined>;

export default async function IndividualPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const settings = await getSettings();
  const header = await personHeader(id, settings.med_late_minutes);
  if (!header) notFound();
  const { person, home, manager: homeManager, counts } = header;
  const tab: PersonTab = TABS.some(([value]) => value === query.tab) ? (query.tab as PersonTab) : "overview";
  const manager = canManage(user);
  const active = person.active;
  const years = age(person.dob);
  const today = dateKey();
  const base = `/app/individuals/${id}`;
  const href = (next: PersonTab) => (next === "overview" ? base : `${base}?tab=${next}`);
  const logToday = counts.lastLog === today;

  const badges: Partial<Record<PersonTab, { n: number; tone: string }>> = {
    medications: counts.dosesLate ? { n: counts.dosesLate, tone: "bg-flag-soft text-flag" } : counts.activeMeds ? { n: counts.activeMeds, tone: "bg-panel text-mute" } : undefined,
    plan: counts.activeGoals ? { n: counts.activeGoals, tone: "bg-sky text-brand-deep" } : undefined,
    appointments: counts.appointmentsToDocument ? { n: counts.appointmentsToDocument, tone: "bg-accent-soft text-[#8a5a10]" } : counts.upcomingAppointments ? { n: counts.upcomingAppointments, tone: "bg-panel text-mute" } : undefined,
    incidents: counts.openIncidents ? { n: counts.openIncidents, tone: "bg-accent-soft text-[#8a5a10]" } : undefined,
    tasks: counts.overdueTasks ? { n: counts.overdueTasks, tone: "bg-flag-soft text-flag" } : counts.openTasks ? { n: counts.openTasks, tone: "bg-panel text-mute" } : undefined,
  };

  return (
    <div className="max-w-7xl">
      <Link href="/app/individuals" className="no-print mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All people
      </Link>

      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar initials={initials(person.firstName, person.lastName)} size="lg" tone={active ? "brand" : "neutral"} />
            <div className="min-w-0">
              <p className="eyebrow">{label("serviceType", person.serviceType)}</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-3xl font-bold">
                {person.firstName} {person.lastName}
                {active ? <Badge tone="good">Supported now</Badge> : <Badge tone="neutral">Support ended</Badge>}
              </h1>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-mute">
                {years !== null && (
                  <div className="inline-flex items-center gap-1.5">
                    <dt className="sr-only">Age</dt>
                    <CalendarDays className="h-3.5 w-3.5" />
                    <dd>{years} years · born {fmt.day(person.dob)}, {person.dob?.slice(0, 4)}</dd>
                  </div>
                )}
                <div className="inline-flex items-center gap-1.5">
                  <dt className="sr-only">Home</dt>
                  <Home className="h-3.5 w-3.5" />
                  <dd>{home ? <Link href={`/app/homes/${home.id}`} className="font-semibold text-ink hover:text-brand">{home.name}</Link> : "Not in one of our homes"}</dd>
                </div>
                {homeManager && (
                  <div className="inline-flex items-center gap-1.5">
                    <dt>Home manager</dt>
                    <dd>
                      <Link href={`/app/staff/${homeManager.id}`} className="font-semibold text-ink hover:text-brand">{homeManager.firstName} {homeManager.lastName}</Link>
                      {homeManager.phone && <a href={`tel:${homeManager.phone}`} className="ml-1.5 inline-flex items-center gap-1 text-brand"><Phone className="h-3 w-3" />{homeManager.phone}</a>}
                    </dd>
                  </div>
                )}
                {person.admittedAt && (
                  <div>
                    <dt className="sr-only">Supported since</dt>
                    <dd>Supported since {fmt.dayLong(person.admittedAt)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2 lg:justify-end">
            {active && <Link href={`/app/daily-logs/new?individual=${id}`} className="btn-brand btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Daily log</Link>}
            {active && <Link href={`/app/incidents/new?individual=${id}`} className="btn-ghost btn-sm"><AlertTriangle className="h-3.5 w-3.5" /> Report incident</Link>}
            {manager && (
              <Link href={`/app/individuals/${id}/edit`} className="btn-ghost btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit details</Link>
            )}
            <PrintButton />
          </div>
        </div>

        {/* The things nobody should miss, on every tab. */}
        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
          <div className={cn("flex items-start gap-2.5 px-5 py-3 text-sm sm:px-6", person.allergies ? "bg-flag-soft" : "bg-white")}>
            <ShieldAlert className={cn("mt-0.5 h-4 w-4 shrink-0", person.allergies ? "text-flag" : "text-dim")} />
            <p>
              <span className="font-semibold">Allergies: </span>
              <span className={person.allergies ? "font-semibold text-flag" : "text-mute"}>{person.allergies || "None known"}</span>
            </p>
          </div>
          <div className="flex items-start gap-2.5 bg-white px-5 py-3 text-sm sm:px-6">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-dim" />
            <p>
              <span className="font-semibold">In an emergency: </span>
              {person.emergencyContact || person.guardianName ? (
                <>
                  {person.emergencyContact || person.guardianName}
                  {(person.emergencyPhone || person.guardianPhone) && (
                    <a href={`tel:${person.emergencyPhone || person.guardianPhone}`} className="ml-1.5 font-semibold text-brand">{person.emergencyPhone || person.guardianPhone}</a>
                  )}
                </>
              ) : (
                <span className="text-mute">No contact on file{manager ? ". Add one with Edit details." : "."}</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {query.saved === "log" && <p className="mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Daily log saved. Thank you.</p>}
      {query.saved === "created" && (
        <p className="mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">
          {person.firstName} has been added. Their care team, insurance, goals and medications are on the tabs below.
        </p>
      )}
      {query.saved === "details" && <p className="mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Details saved.</p>}
      {query.saved === "medication" && <p className="mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Medication updated. The medication record follows from now on.</p>}
      {!active && (
        <p className="mb-5 rounded-xl bg-panel px-4 py-3 text-sm font-medium text-mute">
          Support ended{person.dischargedAt ? ` on ${fmt.dayLong(person.dischargedAt)}` : ""}.{person.dischargeReason && ` ${person.dischargeReason.replace(/[.!?]?$/, ".")}`} Their records stay on file.
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          {
            title: "Medications today",
            value: counts.dosesToday ? `${counts.dosesDone}/${counts.dosesToday}` : "None",
            hint: counts.dosesLate ? `${counts.dosesLate} late` : counts.dosesToday ? (counts.dosesDone === counts.dosesToday ? "All recorded" : "On time so far") : `${counts.activeMeds} active orders`,
            tone: counts.dosesLate ? "bad" : counts.dosesToday && counts.dosesDone === counts.dosesToday ? "good" : "neutral",
            tab: "medications" as const,
          },
          {
            title: "Last daily log",
            value: counts.lastLog ? (logToday ? "Today" : fmt.day(counts.lastLog)) : "Never",
            hint: logToday ? "Written" : active ? "Today's log not written yet" : "",
            tone: logToday ? "good" : active ? "warn" : "neutral",
            tab: "logs" as const,
          },
          { title: "Plan goals", value: String(counts.activeGoals), hint: `${counts.metGoals} met so far`, tone: "neutral", tab: "plan" as const },
          { title: "Open incidents", value: String(counts.openIncidents), hint: `${counts.incidents} on record`, tone: counts.openIncidents ? "warn" : "good", tab: "incidents" as const },
          { title: "Open tasks", value: String(counts.openTasks), hint: counts.overdueTasks ? `${counts.overdueTasks} overdue` : "Nothing overdue", tone: counts.overdueTasks ? "bad" : "neutral", tab: "tasks" as const },
        ].map(stat => (
          <Link key={stat.title} href={href(stat.tab)} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{stat.title}</p>
            <p className={cn("mt-0.5 font-display text-xl font-bold", stat.tone === "warn" && "text-[#8a5a10]", stat.tone === "good" && "text-sage", stat.tone === "bad" && "text-flag")}>{stat.value}</p>
            {stat.hint && <p className="mt-0.5 text-xs text-mute">{stat.hint}</p>}
          </Link>
        ))}
      </div>

      <nav className="no-print z-10 mb-6 flex flex-wrap gap-1 rounded-xl bg-panel p-1 lg:sticky lg:top-0 lg:flex-nowrap lg:overflow-x-auto" aria-label={`${person.firstName}'s record`}>
        {TABS.map(([value, text, Icon]) => {
          const badge = badges[value];
          return (
            <Link
              key={value}
              href={href(value)}
              aria-current={tab === value ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition", tab === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}
            >
              <Icon className="h-4 w-4" /> {text}
              {badge?.n ? <span className={cn("chip px-1.5 py-0", badge.tone)}>{badge.n}</span> : null}
            </Link>
          );
        })}
      </nav>

      <p className="print-only mb-4 flex items-center gap-2 text-sm text-mute"><FileText className="h-4 w-4" /> {TABS.find(([value]) => value === tab)?.[1]} · printed {fmt.dayLong(today)}</p>

      {tab === "overview" && <PersonOverviewTab id={id} person={person} home={home} lateMinutes={settings.med_late_minutes} />}
      {tab === "plan" && <PersonCarePlanTab id={id} person={person} manager={manager} />}
      {tab === "medications" && <PersonMedicationsTab id={id} person={person} manager={manager} end={query.end} days={query.days} lateMinutes={settings.med_late_minutes} />}
      {tab === "appointments" && <PersonAppointmentsTab id={id} person={person} />}
      {tab === "health" && <PersonHealthTab id={id} person={person} manager={manager} />}
      {tab === "logs" && <PersonLogsTab id={id} person={person} query={query} adlOrder={settings.adl_items} />}
      {tab === "incidents" && <PersonIncidentsTab id={id} person={person} />}
      {tab === "care-team" && <PersonCareTeamTab id={id} person={person} editor={manager || user.role === "nurse"} />}
      {tab === "documents" && <PersonDocumentsSection individualId={id} manager={manager} now={await requestTime()} />}
      {tab === "tasks" && <PersonTasksTab id={id} person={person} />}
      {tab === "profile" && <PersonProfileTab id={id} person={person} home={home} manager={manager} />}
    </div>
  );
}
