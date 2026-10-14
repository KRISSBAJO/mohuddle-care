import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, FolderOpen, UsersRound, ClipboardList, KeyRound, Pill, Settings2, ShieldAlert, Stethoscope, Timer, Wallet, type LucideIcon } from "lucide-react";
import { ChoicePicker, ListEditor, RolePicker, SettingsGroupForm } from "@/components/app/SettingsForms";
import { SettingsNav } from "@/components/app/SettingsNav";
import { PageHeader } from "@/components/app/ui";
import { saveSettings } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { getSettings, settingDefs, type SettingKey } from "@/server/settings";

export const metadata = { title: "Settings" };

type Item = { key: SettingKey; title: string; help: string; unit?: string; min?: number; max?: number; roles?: boolean; choices?: [string, string][] };
type Group = { id: string; title: string; icon: LucideIcon; intro: string; link?: [string, string]; items: Item[] };

/* How the business rules are grouped and explained on screen. The rules themselves live in settings. */
const GROUPS: Group[] = [
  {
    id: "notes",
    title: "Daily notes",
    icon: ClipboardList,
    intro: "When notes are due, what every note must confirm, and the lists staff pick from.",
    link: ["/app/settings/notes", "Sections and extra questions"],
    items: [
      { key: "shift_note_grace_hours", title: "Notes due after a shift ends", help: "Staff must finish their notes within this time. After it, they show as overdue.", unit: "hours", min: 0, max: 48 },
      { key: "daily_log_due_hour", title: "End-of-day deadline", help: "The Today page lists people still without a note for the day until this hour (0 to 23).", unit: ":00 Central", min: 0, max: 23 },
      { key: "daily_log_summary_min_chars", title: "Shortest shift summary", help: "Stops one-word summaries such as \"fine\". 0 turns the check off.", unit: "characters", min: 0, max: 500 },
      { key: "required_daily_checks", title: "Checks every note must confirm", help: "Staff tick each one before they can save." },
      { key: "adl_items", title: "Personal care tasks", help: "The rows in the personal care section." },
      { key: "prompt_levels", title: "Levels of support", help: "From least to most help. Used for personal care and plan goals." },
      { key: "activity_types", title: "Activity types", help: "What staff can tick in the activities section." },
      { key: "log_locations", title: "Where support was given", help: "The choices for where each shift happened." },
    ],
  },
  {
    id: "medication",
    title: "Medication",
    icon: Pill,
    intro: "When a dose counts as late on the medication record, the Today page and home rounds.",
    items: [{ key: "med_late_minutes", title: "A dose is late after", help: "Minutes after its scheduled time with nothing recorded.", unit: "minutes", min: 5, max: 240 }],
  },
  {
    id: "time",
    title: "Time clock",
    icon: Timer,
    intro: "Clocking in and out: where staff must be, what they confirm, and what the handover must cover.",
    items: [
      { key: "clock_in_requirements", title: "To clock in", help: "Location: on their phone, near the home. Handover: read and acknowledge the last handover at the home. Statements: tick each statement below.", choices: [["location", "Be at the home"], ["handover", "Read the last handover"], ["statements", "Tick the statements"]] },
      { key: "clock_out_blocking", title: "Must be done before clock-out", help: "Anything not chosen still shows as a warning and is flagged for a manager.", choices: [["handover", "Handover note"], ["checks", "Handover ticks"], ["incident", "Incident reported"], ["notes", "Daily notes written"], ["doses", "Doses recorded"]] },
      { key: "clock_early_minutes", title: "Clock in early by up to", help: "Earlier than this, the shift cannot be clocked in to yet.", unit: "minutes", min: 0, max: 120 },
      { key: "clock_late_grace_minutes", title: "Still on time within", help: "After this they are marked late.", unit: "minutes", min: 0, max: 60 },
      { key: "clock_geofence_meters", title: "Distance from the home", help: "Phones further away than this must give a reason, and the punch is flagged. Each home's location is set on its details.", unit: "meters", min: 25, max: 5000 },
      { key: "clock_overstay_minutes", title: "Staying late needs a reason after", help: "Clocking out later than this past the shift end asks why.", unit: "minutes", min: 0, max: 240 },
      { key: "clock_no_show_minutes", title: "No-show after", help: "The manager is told when a shift has no clock-in this long after it starts.", unit: "minutes", min: 5, max: 240 },
      { key: "clock_forgot_hours", title: "Forgotten clock-out after", help: "Staff and managers are told. A manager closes it with the right time.", unit: "hours", min: 1, max: 24 },
      { key: "handover_min_chars", title: "Shortest handover note", help: "0 turns the length check off.", unit: "characters", min: 0, max: 1000 },
      { key: "handover_checks", title: "Handover ticks", help: "Staff tick each one, or explain why not. Homes can add their own on their details." },
      { key: "clock_in_statements", title: "Statements at clock in", help: "Staff tick each one before they can clock in." },
      { key: "notify_roles_time", title: "Told about time", help: "No-shows, forgotten clock-outs, punches away from the home and correction requests.", roles: true },
    ],
  },
  {
    id: "appointments",
    title: "Appointments",
    icon: Stethoscope,
    intro: "Appointment types, reminders before a visit, and the deadline for documenting it.",
    items: [
      { key: "appointment_reminder_days", title: "Remind before a visit", help: "The escort and home manager are reminded this far ahead, and again on the day.", unit: "days", min: 0, max: 14 },
      { key: "appointment_document_hours", title: "Document a visit within", help: "After this, the visit shows as overdue and the team is told.", unit: "hours", min: 1, max: 168 },
      { key: "appointment_types", title: "Appointment types", help: "Offered when booking an appointment." },
    ],
  },
  {
    id: "people",
    title: "People supported",
    icon: UsersRound,
    intro: "The lists used when adding a person, on their care team, insurance and plan goals.",
    items: [
      { key: "care_team_roles", title: "Care team roles", help: "Who can be added to a person's care team." },
      { key: "insurance_types", title: "Insurance types", help: "Offered when recording a person's insurance." },
      { key: "goal_services", title: "Where goals are recorded", help: "Each plan goal names the service whose notes record it, such as daily notes or community participation." },
      { key: "communication_options", title: "Ways of communicating", help: "Offered when adding a person." },
      { key: "mobility_options", title: "Mobility levels", help: "Offered when adding a person." },
      { key: "diet_options", title: "Diets", help: "Offered when adding a person." },
    ],
  },
  {
    id: "documents",
    title: "Documents",
    icon: FolderOpen,
    intro: "Private request links and who reviews what staff send in.",
    link: ["/app/documents?tab=types", "Document types"],
    items: [
      { key: "document_link_days", title: "Request links work for", help: "After this, the link stops working and a fresh one must be sent.", unit: "days", min: 1, max: 60 },
      { key: "notify_roles_documents", title: "Told about documents", help: "New uploads to review, signed documents, and documents expiring or expired.", roles: true },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Bell,
    intro: "Who is told about what. Escorts, the staff who owe notes and home managers are always told about their own.",
    items: [
      { key: "notify_roles_appointments", title: "Appointments", help: "New, moved, cancelled and undocumented visits, follow-ups to book, and medication changes from a visit.", roles: true },
      { key: "notify_roles_notes", title: "Overdue daily notes", help: "When a staff member's notes pass their deadline.", roles: true },
      { key: "notify_roles_incidents", title: "Incidents", help: "Every new incident, and reportable incidents near or past their filing deadline.", roles: true },
    ],
  },
  {
    id: "incidents",
    title: "Incidents",
    icon: ShieldAlert,
    intro: "The filing deadline for incidents reportable to the state.",
    items: [{ key: "incident_report_hours", title: "File reportable incidents within", help: "The countdown on each reportable incident starts from when it happened.", unit: "hours", min: 1, max: 72 }],
  },
  {
    id: "schedule",
    title: "Schedule and staffing",
    icon: CalendarDays,
    intro: "How the schedule judges coverage, overtime and rest. Shift times are set as shift patterns.",
    link: ["/app/settings/shifts", "Shift patterns"],
    items: [
      { key: "shift_coverage_minimum", title: "Staff needed per shift", help: "The fewest people on duty at a home during each pattern it needs.", unit: "people", min: 1, max: 10 },
      { key: "overtime_weekly_hours", title: "Overtime warning above", help: "Staff scheduled for more than this in a week are flagged.", unit: "hours a week", min: 8, max: 100 },
      { key: "min_rest_hours", title: "Shortest rest between shifts", help: "Less rest than this between one person's shifts is flagged.", unit: "hours", min: 0, max: 24 },
    ],
  },
  {
    id: "staff",
    title: "Staff and logins",
    icon: KeyRound,
    intro: "Credential tracking and how staff sign in.",
    items: [
      { key: "credential_types", title: "Credentials tracked", help: "The types offered when adding a credential to a staff member." },
      { key: "employment_types", title: "Employment types", help: "Full time, part time, PRN and so on, offered on each staff record." },
      { key: "credential_warning_days", title: "Warn before a credential expires", help: "Expiring credentials show on the Today page and the schedule this far ahead.", unit: "days", min: 1, max: 365 },
      { key: "login_link_valid_hours", title: "Setup and reset links last", help: "How long a one-time sign-in link works.", unit: "hours", min: 1, max: 168 },
      { key: "password_min_length", title: "Shortest password", help: "For staff choosing a password (8 to 64).", unit: "characters", min: 8, max: 64 },
    ],
  },
  {
    id: "homes",
    title: "Homes and money",
    icon: Wallet,
    intro: "Expense approval and the categories for expenses and home issues.",
    items: [
      { key: "expense_approval_dollars", title: "Expenses need approval above", help: "Smaller expenses are approved at once. 0 means every expense waits for approval.", unit: "dollars", min: 0, max: 100000 },
      { key: "expense_categories", title: "Expense categories", help: "Offered when staff add a home expense." },
      { key: "issue_categories", title: "Home issue categories", help: "Offered when staff report a home issue." },
    ],
  },
];

/* Business rules, grouped by area, each group saved on its own. */
export default async function SettingsPage() {
  await requireManager();
  const settings = await getSettings();
  const grouped = new Set(GROUPS.flatMap(group => group.items.map(item => item.key)));
  const others = (Object.keys(settingDefs) as SettingKey[]).filter(key => !grouped.has(key));
  const groups: Group[] = others.length
    ? [...GROUPS, { id: "other", title: "Other", icon: Settings2, intro: "Rules not yet placed in a group.", items: others.map(key => ({ key, title: settingDefs[key].label, help: "" })) }]
    : GROUPS;

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Settings" title="Business rules" description="These rules drive the Today page, daily notes, the medication record, incidents and the schedule. Each group saves on its own." />
      <SettingsNav current="/app/settings" />

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Rule groups">
          <ul className="sticky top-4 space-y-1">
            {groups.map(group => (
              <li key={group.id}>
                <a href={`#${group.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-mute hover:bg-panel hover:text-ink">
                  <group.icon className="h-4 w-4" /> {group.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.id} id={group.id} className="card scroll-mt-4 overflow-hidden">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky text-brand-deep"><group.icon className="h-4 w-4" /></span>
                  <div>
                    <h2 className="text-lg font-bold">{group.title}</h2>
                    <p className="text-sm text-mute">{group.intro}</p>
                  </div>
                </div>
                {group.link && (
                  <Link href={group.link[0]} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-deep">
                    {group.link[1]} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </header>
              <SettingsGroupForm action={saveSettings} submitLabel={`Save ${group.title.toLowerCase()}`}>
                {group.items.map(item => {
                  const def = settingDefs[item.key] as { kind: "number" | "list" | "text" };
                  const value = settings[item.key];
                  return (
                    <div key={item.key} className={def.kind === "list" ? "px-5 py-4" : "grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center"}>
                      <div className={def.kind === "list" ? "mb-3" : undefined}>
                        <label htmlFor={item.key} className="text-sm font-semibold">{item.title}</label>
                        {item.help && <p className="text-xs text-mute">{item.help}</p>}
                      </div>
                      {item.choices ? (
                        <ChoicePicker name={item.key} initial={value as string[]} choices={item.choices} />
                      ) : item.roles ? (
                        <RolePicker name={item.key} initial={value as string[]} />
                      ) : def.kind === "list" ? (
                        <ListEditor name={item.key} initial={value as string[]} />
                      ) : def.kind === "text" ? (
                        <input id={item.key} name={item.key} className="field font-mono" defaultValue={String(value)} />
                      ) : (
                        <div className="flex items-center overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand">
                          <input id={item.key} name={item.key} type="number" min={item.min} max={item.max} required className="w-full border-0 bg-transparent px-3.5 py-2.5 text-sm font-semibold outline-none" defaultValue={String(value)} />
                          {item.unit && <span className="shrink-0 border-l border-line bg-panel/60 px-3 py-2.5 text-xs text-mute">{item.unit}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </SettingsGroupForm>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
