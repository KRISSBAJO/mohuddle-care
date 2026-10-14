import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, FolderOpen, Home, MapPin, Phone, Pill, Receipt, Settings2, Wrench } from "lucide-react";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Field } from "@/components/app/ui";
import { HomeDetailsTab } from "@/components/homes/HomeDetailsTab";
import { HomeExpensesTab } from "@/components/homes/HomeExpensesTab";
import { HomeIssuesTab } from "@/components/homes/HomeIssuesTab";
import { HomeMedsTab } from "@/components/homes/HomeMedsTab";
import { HomeOverviewTab } from "@/components/homes/HomeOverviewTab";
import { HomeScheduleTab } from "@/components/homes/HomeScheduleTab";
import { HomeDocumentsSection } from "@/components/docs/DocumentSections";
import { cn } from "@/lib/cn";
import { dateKey, label, labels } from "@/lib/format";
import { mayManageHome } from "@/lib/home-policy";
import { addExpense, reportIssue } from "@/server/actions/homes";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { listStaff } from "@/server/queries/hub";
import { homeHub } from "@/server/queries/homes";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Home" };

const TABS = [
  ["overview", "Overview", Home],
  ["medications", "Medications", Pill],
  ["expenses", "Expenses", Receipt],
  ["issues", "Issues", Wrench],
  ["schedule", "Schedule", CalendarDays],
  ["documents", "Documents", FolderOpen],
  ["details", "Details", Settings2],
] as const;
type Tab = (typeof TABS)[number][0];

type Search = { tab?: string; day?: string; month?: string; show?: string; created?: string; week?: string };

export default async function HomePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [hub, settings, staff] = await Promise.all([homeHub(id), getSettings(), listStaff()]);
  if (!hub) notFound();
  const { home } = hub;
  const manager = canManage(user);
  const runsHome = mayManageHome(user, home);
  const tabs = TABS.filter(([value]) => value !== "details" || manager);
  const tab: Tab = tabs.some(([value]) => value === query.tab) ? (query.tab as Tab) : "overview";
  const day = query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : dateKey();
  const month = query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : dateKey().slice(0, 7);
  const href = (next: Tab) => `/app/homes/${id}${next === "overview" ? "" : `?tab=${next}`}`;

  return (
    <div className="max-w-7xl">
      <Link href="/app/homes" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All homes
      </Link>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">{label("homeType", home.type)}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold">
            {home.name}
            {!home.active && <Badge tone="neutral">Closed</Badge>}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
            {(home.address || home.city) && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{[home.address, home.city, [home.zip].filter(Boolean).join("")].filter(Boolean).join(", ")}</span>
            )}
            {home.phone && (
              <a href={`tel:${home.phone}`} className="inline-flex items-center gap-1.5 hover:text-ink"><Phone className="h-3.5 w-3.5" />{home.phone}</a>
            )}
            <span>
              Home manager:{" "}
              <span className="font-semibold text-ink">{hub.manager ? `${hub.manager.firstName} ${hub.manager.lastName}` : "not set"}</span>
            </span>
          </p>
        </div>
        {home.active && (
          <div className="flex flex-wrap gap-2">
            <ModalForm
              action={reportIssue.bind(null, id)}
              title={`Report an issue at ${home.name}`}
              description={runsHome ? "Repairs, safety, supplies, the van. For anything that happened to a person, report an incident instead." : "It goes to the home manager. For anything that happened to a person, report an incident instead."}
              triggerLabel="Report issue"
              triggerTone="ghost"
              submitLabel="Report issue"
            >
              <Field label="What is wrong" htmlFor="issue-title"><input id="issue-title" name="title" required minLength={3} maxLength={160} className="field" placeholder="Kitchen tap leaking" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="issue-category">
                  <select id="issue-category" name="category" className="field">{settings.issue_categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </Field>
                <Field label="Priority" htmlFor="issue-priority">
                  <select id="issue-priority" name="priority" className="field" defaultValue="normal">{Object.entries(labels.issuePriority).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                </Field>
              </div>
              <Field label="Details" htmlFor="issue-details" hint="Where it is, since when, and anything already tried."><textarea id="issue-details" name="details" rows={3} maxLength={3000} className="field" /></Field>
              {runsHome ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Assign to" htmlFor="issue-assign">
                    <select id="issue-assign" name="assignedTo" className="field" defaultValue={home.managerStaffId ?? ""}>
                      <option value="">Nobody yet</option>
                      {staff.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                    </select>
                  </Field>
                  <Field label="Fix by" htmlFor="issue-due"><input id="issue-due" name="dueOn" type="date" className="field" /></Field>
                </div>
              ) : (
                <>
                  <input type="hidden" name="assignedTo" value="" />
                  <input type="hidden" name="dueOn" value="" />
                </>
              )}
            </ModalForm>
            <ModalForm
              action={addExpense.bind(null, id)}
              title={`Add an expense for ${home.name}`}
              description={settings.expense_approval_dollars === 0 ? "Every expense waits for approval." : `Up to $${settings.expense_approval_dollars} is approved at once. Above that, a coordinator or the home manager approves it.`}
              triggerLabel="Add expense"
              submitLabel="Add expense"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount (USD)" htmlFor="exp-amount"><input id="exp-amount" name="amount" required inputMode="decimal" className="field" placeholder="42.50" /></Field>
                <Field label="Date" htmlFor="exp-date"><input id="exp-date" name="spentOn" type="date" required className="field" defaultValue={dateKey()} /></Field>
                <Field label="Category" htmlFor="exp-category">
                  <select id="exp-category" name="category" className="field">{settings.expense_categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </Field>
                <Field label="Paid by" htmlFor="exp-method">
                  <select id="exp-method" name="paymentMethod" className="field">{Object.entries(labels.paymentMethod).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                </Field>
              </div>
              <Field label="Store or supplier" htmlFor="exp-vendor"><input id="exp-vendor" name="vendor" maxLength={120} className="field" placeholder="Kroger, Nolensville Pike" /></Field>
              <Field label="What it was for" htmlFor="exp-description"><input id="exp-description" name="description" required minLength={3} maxLength={500} className="field" placeholder="Weekly groceries" /></Field>
            </ModalForm>
          </div>
        )}
      </div>

      {query.created && (
        <div className="mb-5 rounded-2xl border border-sage/30 bg-sage-soft px-5 py-4 text-sm text-sage">
          <p className="font-semibold">{home.name} is set up.</p>
          <p className="mt-1">
            Next: move people in from their own pages, then use{" "}
            <Link href={`/app/schedule?home=${id}`} className="font-semibold underline">Add shifts on the schedule</Link>
            {manager && !home.managerStaffId && (
              <>
                {" "}and choose a home manager under <Link href={`/app/homes/${id}?tab=details`} className="font-semibold underline">Details</Link>
              </>
            )}
            .
          </p>
        </div>
      )}

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-panel p-1" aria-label="Home sections">
        {tabs.map(([value, text, Icon]) => (
          <Link
            key={value}
            href={href(value)}
            aria-current={tab === value ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition", tab === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}
          >
            <Icon className="h-4 w-4" /> {text}
            {value === "issues" && hub.money.openIssues > 0 && <span className="chip bg-flag-soft px-1.5 py-0 text-flag">{hub.money.openIssues}</span>}
            {value === "expenses" && hub.money.pendingCount > 0 && <span className="chip bg-accent-soft px-1.5 py-0 text-[#8a5a10]">{hub.money.pendingCount}</span>}
            {value === "medications" && hub.meds.late > 0 && <span className="chip bg-flag-soft px-1.5 py-0 text-flag">{hub.meds.late}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <HomeOverviewTab hub={hub} homeId={id} />}
      {tab === "medications" && <HomeMedsTab homeId={id} day={day} lateMinutes={settings.med_late_minutes} />}
      {tab === "expenses" && <HomeExpensesTab homeId={id} home={home} month={month} user={user} />}
      {tab === "issues" && <HomeIssuesTab homeId={id} home={home} show={query.show} user={user} staff={staff} />}
      {tab === "documents" && <HomeDocumentsSection homeId={id} manager={manager} />}
      {tab === "schedule" && <HomeScheduleTab homeId={id} week={query.week} manager={manager} />}
      {tab === "details" && manager && <HomeDetailsTab homeId={id} staff={staff} />}
    </div>
  );
}
