import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarDays, ClipboardList, FolderOpen, Home, KeyRound, LayoutDashboard, Mail, Pencil, Phone, Timer, Wallet } from "lucide-react";
import { Avatar, Badge } from "@/components/app/ui";
import { StaffDocumentsSection } from "@/components/docs/DocumentSections";
import { StaffAccountTab, StaffCredentialsTab, StaffNotesTab, StaffOverviewTab, StaffScheduleTab, StaffTimeTab } from "@/components/staff/StaffTabs";
import { StaffPayTab } from "@/components/staff/StaffPayTab";
import { mayManageLogin } from "@/lib/account-policy";
import { cn } from "@/lib/cn";
import { dateKey, daysBetween, fmt, initials, label } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { requireUser } from "@/server/guard";
import { staffDetail } from "@/server/queries/hub";
import { staffSummary } from "@/server/queries/staff-profile";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Staff member" };

const TABS = [
  ["overview", "Overview", LayoutDashboard],
  ["schedule", "Schedule", CalendarDays],
  ["time", "Time", Timer],
  ["pay", "Pay & leave", Wallet],
  ["notes", "Daily notes", ClipboardList],
  ["credentials", "Credentials", BadgeCheck],
  ["documents", "Documents", FolderOpen],
  ["account", "Login & employment", KeyRound],
] as const;
type StaffTab = (typeof TABS)[number][0];

function tenure(hiredAt: string | null, today: string) {
  if (!hiredAt) return null;
  const days = daysBetween(hiredAt, today);
  if (days < 0) return `Starts ${fmt.day(hiredAt)}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0 && months === 0) return "Joined this month";
  return [years ? `${years} year${years === 1 ? "" : "s"}` : null, months ? `${months} month${months === 1 ? "" : "s"}` : null].filter(Boolean).join(", ") + " with us";
}

export default async function StaffMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, settings, now] = await Promise.all([staffDetail(id), getSettings(), requestTime()]);
  if (!detail) notFound();
  const summary = await staffSummary(id);
  const { member, login, credentials } = detail;
  const manager = canManage(user);
  const self = user.staffId === member.id;
  const manageable = manager && !self && (!login || mayManageLogin(user, login));
  const today = dateKey();
  const base = `/app/staff/${id}`;
  const visible = TABS.filter(([value]) => !(["documents", "time", "pay"] as string[]).includes(value) || manager || (value === "time" && self));
  const tab: StaffTab = visible.some(([value]) => value === query.tab) ? (query.tab as StaffTab) : "overview";
  const href = (next: StaffTab) => (next === "overview" ? base : `${base}?tab=${next}`);

  const expired = credentials.filter(cred => cred.expiresAt && cred.expiresAt < today).length;
  const expiring = credentials.filter(cred => cred.expiresAt && cred.expiresAt >= today && daysBetween(today, cred.expiresAt) <= settings.credential_warning_days).length;
  const over = summary.weekHours > settings.overtime_weekly_hours;
  const served = tenure(member.hiredAt, today);

  const badges: Partial<Record<StaffTab, { n: number; tone: string }>> = {
    notes: summary.notesOverdue ? { n: summary.notesOverdue, tone: "bg-flag-soft text-flag" } : summary.notesMissing ? { n: summary.notesMissing, tone: "bg-panel text-mute" } : undefined,
    credentials: expired ? { n: expired, tone: "bg-flag-soft text-flag" } : expiring ? { n: expiring, tone: "bg-accent-soft text-[#8a5a10]" } : undefined,
  };

  const stats = [
    { title: "Hours this week", value: `${Math.round(summary.weekHours * 10) / 10}`, hint: over ? `Over ${settings.overtime_weekly_hours} h` : `${summary.weekShifts.length} shifts scheduled`, tone: over ? "bad" : "neutral", tab: "schedule" as const },
    { title: "Notes owed", value: String(summary.notesMissing), hint: summary.notesOverdue ? `${summary.notesOverdue} overdue` : summary.notesMissing ? "Not yet late" : "All written", tone: summary.notesOverdue ? "bad" : summary.notesMissing ? "warn" : "good", tab: "notes" as const },
    { title: "Notes, 30 days", value: String(summary.notes30), hint: summary.lastNote ? `Last for ${fmt.day(summary.lastNote)}` : "None yet", tone: "neutral", tab: "notes" as const },
    { title: "Credentials", value: String(credentials.length), hint: expired ? `${expired} expired` : expiring ? `${expiring} expiring soon` : "All current", tone: expired ? "bad" : expiring ? "warn" : "good", tab: "credentials" as const },
    { title: "Open tasks", value: String(detail.openTasks), hint: `${detail.upcomingShifts} upcoming shifts`, tone: "neutral", tab: "overview" as const },
  ];

  return (
    <div className="max-w-7xl">
      <Link href="/app/staff" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All staff
      </Link>

      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar initials={initials(member.firstName, member.lastName)} size="lg" tone={member.active ? "brand" : "neutral"} />
            <div className="min-w-0">
              <p className="eyebrow">{label("staffRole", member.role)}{member.employmentType ? ` · ${member.employmentType}` : ""}</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-3xl font-bold">
                {member.firstName} {member.lastName}
                {member.active ? <Badge tone="good">Current</Badge> : <Badge tone="neutral">Left</Badge>}
                {login ? (!login.active ? <Badge tone="neutral">Login off</Badge> : !login.hasPassword ? <Badge tone="warn">Login not set up</Badge> : null) : <Badge tone="warn">No login</Badge>}
              </h1>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-mute">
                <div className="inline-flex items-center gap-1.5">
                  <dt className="sr-only">Based at</dt>
                  <Home className="h-3.5 w-3.5" />
                  <dd>{detail.home ? <Link href={`/app/homes/${detail.home.id}`} className="font-semibold text-ink hover:text-brand">{detail.home.name}</Link> : "Floating or office"}</dd>
                </div>
                {served && (
                  <div className="inline-flex items-center gap-1.5">
                    <dt className="sr-only">Time with us</dt>
                    <CalendarDays className="h-3.5 w-3.5" />
                    <dd>{served}</dd>
                  </div>
                )}
                {member.employeeNumber && (
                  <div className="inline-flex items-center gap-1.5">
                    <dt className="sr-only">Employee number</dt>
                    <BadgeCheck className="h-3.5 w-3.5" />
                    <dd>No. {member.employeeNumber}</dd>
                  </div>
                )}
                {member.phone && (
                  <div className="inline-flex items-center gap-1.5">
                    <dt className="sr-only">Phone</dt>
                    <Phone className="h-3.5 w-3.5" />
                    <dd><a href={`tel:${member.phone}`} className="hover:text-brand">{member.phone}</a></dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {member.phone && <a href={`tel:${member.phone}`} className="btn-ghost btn-sm"><Phone className="h-3.5 w-3.5" /> Call</a>}
            <a href={`mailto:${member.email}`} className="btn-ghost btn-sm"><Mail className="h-3.5 w-3.5" /> Email</a>
            {manager && <Link href={`${base}/edit`} className="btn-brand btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit details</Link>}
          </div>
        </div>
      </section>

      {query.created && <p className="mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">{member.firstName} has been added. Next, create their login on the Login &amp; employment tab and add their credentials.</p>}
      {query.saved === "details" && <p className="mb-5 rounded-xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">Details saved.</p>}
      {!member.active && <p className="mb-5 rounded-xl bg-panel px-4 py-3 text-sm font-medium text-mute">{member.firstName} has left. Their records stay on file.</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(stat => (
          <Link key={stat.title} href={href(stat.tab)} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{stat.title}</p>
            <p className={cn("mt-0.5 font-display text-xl font-bold", stat.tone === "warn" && "text-[#8a5a10]", stat.tone === "good" && "text-sage", stat.tone === "bad" && "text-flag")}>{stat.value}</p>
            <p className="mt-0.5 text-xs text-mute">{stat.hint}</p>
          </Link>
        ))}
      </div>

      <nav className="z-10 mb-6 flex flex-wrap gap-1 rounded-xl bg-panel p-1 lg:sticky lg:top-0 lg:flex-nowrap lg:overflow-x-auto" aria-label={`${member.firstName}'s record`}>
        {visible.map(([value, text, Icon]) => {
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

      {tab === "overview" && <StaffOverviewTab detail={detail} summary={summary} base={base} warningDays={settings.credential_warning_days} />}
      {tab === "time" && <StaffTimeTab id={id} manager={manager} />}
      {tab === "pay" && manager && <StaffPayTab staffId={id} first={member.firstName} admin={user.role === "admin"} />}
      {tab === "schedule" && <StaffScheduleTab id={id} overtime={settings.overtime_weekly_hours} />}
      {tab === "notes" && <StaffNotesTab detail={detail} summary={summary} myStaffId={user.staffId} />}
      {tab === "credentials" && <StaffCredentialsTab detail={detail} manager={manager} warningDays={settings.credential_warning_days} credentialTypes={settings.credential_types} />}
      {tab === "documents" && manager && <StaffDocumentsSection staffId={member.id} now={now} />}
      {tab === "account" && <StaffAccountTab detail={detail} user={user} manager={manager} self={self} manageable={manageable} />}
    </div>
  );
}
