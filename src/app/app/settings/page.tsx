import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, MessagesSquare, FolderOpen, UsersRound, ClipboardList, KeyRound, Pill, Settings2, ShieldAlert, Palmtree, Stethoscope, Timer, Wallet, type LucideIcon } from "lucide-react";
import { ChoicePicker, LibraryPicker, ListEditor, RolePicker, SettingsGroupForm } from "@/components/app/SettingsForms";
import { Select } from "@/components/app/Select";
import { SettingsNav } from "@/components/app/SettingsNav";
import { PageHeader } from "@/components/app/ui";
import { saveSettings } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { storedSettings, settingDefs, type SettingKey } from "@/server/settings";
import { handoverLibrary } from "@/server/handover-library";
import { currentBilling, planAllows } from "@/server/billing";
import { BillingBadge } from "@/components/owner/BillingBadge";
import { PLAN_FEATURES } from "@/lib/billing";
import { zoneLabel } from "@/lib/format";

export const metadata = { title: "Settings" };

type Item = { key: SettingKey; title: string; help: string; unit?: string; min?: number; max?: number; roles?: boolean; choices?: [string, string][]; options?: [string, string][]; date?: boolean; library?: boolean };
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
      { key: "daily_log_due_hour", title: "End-of-day deadline", help: "The Today page lists people still without a note for the day until this hour (0 to 23).", unit: `:00 ${zoneLabel().replace(" time", "")}`, min: 0, max: 23 },
      { key: "daily_log_summary_min_chars", title: "Shortest shift summary", help: "Stops one-word summaries such as \"fine\". 0 turns the check off.", unit: "characters", min: 0, max: 500 },
      { key: "required_daily_checks", title: "Checks every note must confirm", help: "Staff tick each one before they can save." },
      { key: "adl_items", title: "Personal care tasks", help: "The rows in the personal care section." },
      { key: "prompt_levels", title: "Levels of support", help: "From least to most help. Used for personal care and plan goals." },
      { key: "activity_types", title: "Activity types", help: "What staff can tick in the activities section." },
      { key: "log_locations", title: "Where support was given", help: "The choices for where each shift happened." },
      { key: "assistant_enabled", title: "Ask Mohuddle", help: "A button on every page: staff ask about their shifts, hours and what is due, open pages, get help, and clock in or take breaks by voice or typing. Actions always ask first.", options: [["on", "On"], ["off", "Off"]] },
      { key: "scribe_enabled", title: "Speak your note", help: "Staff talk through the shift and a model on this server fills in the note for them to check and sign. Nothing is recorded or sent to another company.", options: [["on", "On"], ["off", "Off"]] },
      { key: "scribe_speech", title: "Speech model", help: "Small is fastest. Medium and turbo hear accents and names better but take longer, and must be installed on the server.", options: [["small", "Small (fastest)"], ["medium", "Medium"], ["turbo", "Turbo (most accurate)"]] },
      { key: "scribe_model", title: "Note model", help: "The Ollama model that drafts the note, such as qwen3.5:4b. It must be installed on the server." },
      { key: "cp_note_min_chars", title: "Shortest Community Participation note", help: "The note box on a Community Participation note. 0 turns the check off.", unit: "characters", min: 0, max: 500 },
      { key: "cp_cost_centers", title: "Community Participation cost centers", help: "Optional. Leave empty to hide the cost center box." },
      { key: "note_writer_edit", title: "Writers change their own notes", help: "Approved notes are always locked. A note sent back to its writer can always be fixed.", options: [["until_approved", "Until the note is approved"], ["when_returned", "Only when a reviewer sends it back"]] },
      { key: "note_review_roles", title: "Who reviews notes", help: "They approve notes, send them back to the writer, and edit them with a reason. Home managers review notes for their own home too. Nobody approves their own note.", roles: true },
      { key: "note_review_checks", title: "What flags a note", help: "Flagged notes are marked in the review list so they get a closer look.", choices: [["late", "Written after the day"], ["no_punch", "No clock punch for those times"], ["outside_punch", "Times outside the clock punch"], ["attention", "Behaviour, seizure or low mood"], ["resubmitted", "Sent back and resubmitted"], ["copied", "Same words as another note"], ["early", "Written before the shift ended"]] },
      { key: "note_copy_percent", title: "Copied note when this similar", help: "Compared with the same writer's notes from the last 14 days, for any person. Short notes are not compared.", unit: "%", min: 50, max: 100 },
      { key: "note_early_minutes", title: "Early note when signed this long before the shift ends", help: "Writing during a shift is fine; a note finished long before the end describes time that has not happened yet.", unit: "minutes", min: 0, max: 720 },
      { key: "note_punch_tolerance_minutes", title: "Times may differ from the punch by", help: "More than this between the note's times and the clock punch flags the note.", unit: "minutes", min: 0, max: 240 },
      { key: "note_bulk_flagged", title: "Bulk approval", help: "Whether approving many notes at once also approves the flagged ones.", options: [["skip", "Leave flagged notes to approve one by one"], ["allow", "Approve flagged notes too"]] },
    ],
  },
  {
    id: "medication",
    title: "Medication and health",
    icon: Pill,
    intro: "When a dose counts as late on the medication record, the Today page and home rounds.",
    items: [
      { key: "med_late_minutes", title: "A dose is late after", help: "Minutes after its scheduled time with nothing recorded.", unit: "minutes", min: 5, max: 240 },
      { key: "med_record_scope", title: "Who may record medicines", help: "Direct support staff can record a dose only at a home where they are clocked in or on shift at the time of the dose. Nurses, coordinators and administrators can record at any home.", options: [["at_home", "Staff at the home they are working at"], ["anyone", "Anyone in the agency"]] },
      { key: "prn_effect_minutes", title: "Ask how an as-needed dose worked", help: "After this long, the dose shows that its effect is still to record. 0 means right away.", unit: "minutes after", min: 0, max: 480 },
      { key: "weight_change_percent", title: "Weight change worth telling", help: "A gain or loss of this much, compared with the earliest weight in the period below.", unit: "%", min: 1, max: 50 },
      { key: "weight_change_days", title: "Weight change period", help: "How far back to compare.", unit: "days", min: 7, max: 365 },
    ],
  },
  {
    id: "incident-reports",
    title: "Incident reports",
    icon: ShieldAlert,
    intro: "The lists on the Reportable Event Form, and how fast tier 1 events must reach the state.",
    items: [
      { key: "incident_tier1_hours", title: "Tier 1 to DIDD Investigations within", help: "Tier 1 events also need the form filed within the incident filing time.", unit: "hours", min: 1, max: 24 },
      { key: "incident_notify_parties", title: "Notification list", help: "Each row on the form's notification table: who was told, when, and any comments." },
      { key: "incident_locations", title: "Event locations", help: "Where the event happened." },
      { key: "waiver_types", title: "Waiver types", help: "The person's waiver, recorded on the form." },
      { key: "mco_options", title: "Managed care organisations", help: "The person's health plan, filled in from their insurance where it can be." },
    ],
  },
  {
    id: "time",
    title: "Time clock",
    icon: Timer,
    intro: "Clocking in and out: where staff must be, what they confirm, and what the handover must cover.",
    items: [
      { key: "clock_in_requirements", title: "To clock in", help: "Location: on their phone, near the home. If a phone cannot share its location they can still clock in; it is flagged and the home manager is told. Handover: read and acknowledge the last handover at the home. Statements: tick each statement below.", choices: [["location", "Be at the home"], ["handover", "Read the last handover"], ["statements", "Tick the statements"]] },
      { key: "clock_out_blocking", title: "Must be done before clock-out", help: "Anything not chosen still shows as a warning and is flagged for a manager.", choices: [["handover", "Handover note"], ["checks", "Handover ticks"], ["incident", "Incident reported"], ["notes", "Daily notes written"], ["doses", "Doses recorded"]] },
      { key: "self_approval", title: "Managers deciding their own time", help: "Whether a coordinator or administrator who also works shifts may approve their own punch fixes, time off and timesheet, and mark their own flagged punches reviewed. Off means another manager decides.", options: [["off", "Another manager decides"], ["on", "They may decide their own"]] },
      { key: "clock_early_minutes", title: "Clock in early by up to", help: "Earlier than this, the shift cannot be clocked in to yet.", unit: "minutes", min: 0, max: 120 },
      { key: "clock_pay_early_from", title: "Early clock-ins are paid from", help: "The real punch time is always kept; this only changes the hours counted.", options: [["shift", "The shift start"], ["punch", "When they clocked in"]] },
      { key: "clock_late_grace_minutes", title: "Still on time within", help: "Up to this late counts as on time and is not recorded as late.", unit: "minutes", min: 0, max: 120 },
      { key: "clock_late_exception_minutes", title: "Late is an exception after", help: "Between on time and this, the punch is marked late but not sent for review. From this on, it is an exception and the manager is told.", unit: "minutes", min: 0, max: 240 },
      { key: "clock_early_leave_minutes", title: "Leaving early needs a reason after", help: "Clocking out more than this before the shift ends asks why and is an exception.", unit: "minutes", min: 0, max: 240 },
      { key: "clock_geofence_meters", title: "Distance from the home", help: "Phones further away than this must give a reason, and the punch is flagged. Each home's location is set on its details.", unit: "meters", min: 25, max: 5000 },
      { key: "clock_overstay_minutes", title: "Staying late needs a reason after", help: "Clocking out later than this past the shift end asks why.", unit: "minutes", min: 0, max: 240 },
      { key: "clock_no_show_minutes", title: "No-show after", help: "The manager is told when a shift has no clock-in this long after it starts.", unit: "minutes", min: 5, max: 240 },
      { key: "remind_shift_start_minutes", title: "Remind before a shift starts", help: "A phone notification to the staff member. 0 turns it off.", unit: "minutes", min: 0, max: 240 },
      { key: "remind_shift_end_minutes", title: "Remind before a shift ends", help: "To finish notes, doses and the handover. 0 turns it off.", unit: "minutes", min: 0, max: 240 },
      { key: "remind_still_clocked_minutes", title: "Still clocked in after the shift", help: "The staff member is reminded to clock out this long after the shift ends. Managers hear later, at the forgotten clock-out time.", unit: "minutes", min: 0, max: 240 },
      { key: "break_meal_minutes", title: "Meal break length", help: "Used for the break countdown and reminder.", unit: "minutes", min: 5, max: 120 },
      { key: "break_rest_minutes", title: "Rest break length", help: "Used for the break countdown and reminder.", unit: "minutes", min: 5, max: 60 },
      { key: "remind_break_end_minutes", title: "Remind before a break ends", help: "0 turns it off.", unit: "minutes", min: 0, max: 30 },
      { key: "clock_forgot_hours", title: "Forgotten clock-out after", help: "Staff and managers are told. A manager closes it with the right time.", unit: "hours", min: 1, max: 24 },
      { key: "handover_min_chars", title: "Shortest handover note", help: "0 turns the length check off.", unit: "characters", min: 0, max: 1000 },
      { key: "handover_checks", title: "Handover ticks", help: "What outgoing staff confirm at clock out, and incoming staff read and acknowledge at clock in. Tick items from the Mohuddle library and add your own. Homes can add more on their details.", library: true },
      { key: "clock_in_statements", title: "Statements at clock in", help: "Staff tick each one before they can clock in." },
      { key: "notify_roles_time", title: "Told about time", help: "No-shows, forgotten clock-outs, punches away from the home and correction requests.", roles: true },
    ],
  },
  {
    id: "pay",
    title: "Pay periods",
    icon: Wallet,
    intro: "How hours become timesheets: the pay period, overtime, rounding, holidays and the payroll export. Mohuddle counts hours; pay is worked out by your payroll provider.",
    link: ["/app/settings/differentials", "Pay differentials"],
    items: [
      { key: "pay_period_type", title: "Pay period", help: "Changing this only affects periods not yet started. Locked periods stay as they were.", options: [["weekly", "Every week"], ["biweekly", "Every two weeks"], ["semimonthly", "Twice a month (1st–15th, 16th–end)"], ["monthly", "Every month"]] },
      { key: "pay_period_anchor", title: "A period start date", help: "For weekly or every-two-weeks pay: the first day of any one pay period. Other periods count from it.", date: true },
      { key: "workweek_starts_on", title: "Workweek starts", help: "Overtime is counted per workweek, a fixed 7 days. 1 is Monday, 7 is Sunday.", unit: "day of week", min: 1, max: 7 },
      { key: "overtime_after_hours", title: "Overtime after", help: "Federal law pays overtime after 40 hours in a workweek. Tennessee has no daily overtime.", unit: "hours a week", min: 1, max: 80 },
      { key: "overtime_warning_hours", title: "Warn about overtime at", help: "Staff and the people told about time are warned once a week when someone reaches this.", unit: "hours", min: 1, max: 80 },
      { key: "time_rounding_minutes", title: "Rounding", help: "Each punch is rounded to the nearest step, up or down, so it evens out. The real times are always kept.", options: [["0", "No rounding"], ["5", "Nearest 5 minutes"], ["6", "Nearest 6 minutes (tenth of an hour)"], ["15", "Nearest 15 minutes"]] },
      { key: "paid_holidays", title: "Holidays", help: "One per line, starting with the date. Hours worked on these days are shown separately for holiday pay." },
      { key: "overtime_pay_percent", title: "Overtime pay", help: "Of the regular rate, which includes differentials. Federal law requires at least 150.", unit: "%", min: 100, max: 300 },
      { key: "holiday_pay_percent", title: "Holiday pay", help: "For hours worked on a listed holiday. 100 means no extra.", unit: "%", min: 100, max: 300 },
      { key: "payroll_export_columns", title: "Payroll export columns", help: "In order. Allowed: employee_number, first_name, last_name, email, period_start, period_end, regular_hours, overtime_hours, total_hours, holiday_hours, adjustment_hours, time_off_hours, hourly_rate, gross_pay, status. Rates and pay are only filled in for administrators." },
    ],
  },
  {
    id: "time-off",
    title: "Time off",
    icon: Palmtree,
    intro: "The kinds of time off staff can ask for, and how leave is earned.",
    link: ["/app/time?tab=timeoff", "Time off requests"],
    items: [
      { key: "time_off_types", title: "Paid types", help: "Paid time off shows on the timesheet and in the payroll file." },
      { key: "time_off_unpaid_types", title: "Unpaid types", help: "Recorded so the schedule and managers know, but not paid." },
      { key: "time_off_balance_types", title: "Types that use the balance", help: "Must match paid types above exactly. Others, such as jury duty, are paid without using the balance." },
      { key: "pto_accrual_hours_worked", title: "Earn one hour per", help: "Leave is earned when a pay period is locked. 0 turns earning off; balances can still be set by hand.", unit: "hours worked", min: 0, max: 200 },
      { key: "pto_max_balance_hours", title: "Most leave held", help: "Earning stops at this balance.", unit: "hours", min: 0, max: 2000 },
      { key: "time_off_notice_days", title: "Notice needed", help: "Requests with less notice are marked short notice for the manager. Sick leave is never short notice.", unit: "days", min: 0, max: 90 },
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
      { key: "digest_hour", title: "Morning summary at", help: "A short summary to managers: notes not written, doses missed, no-shows, Tier 1 incidents, open shifts, appointments and reviews waiting. -1 turns it off.", unit: `:00 ${zoneLabel().replace(" time", "")}`, min: -1, max: 23 },
      { key: "digest_roles", title: "Who gets the morning summary", help: "It goes to the bell and, when switched on, their phone.", roles: true },
      { key: "notify_roles_weight", title: "Weight", help: "A weight outside the person's suggested range, or a fast change (set under Medication and health).", roles: true },
    ],
  },
  {
    id: "chat",
    title: "Chat",
    icon: MessagesSquare,
    intro: "Messages between staff on the website and the phone app. Every home gets a group, and managers post in Announcements. Deleted messages are hidden from everyone but kept for audits.",
    items: [
      { key: "chat_enabled", title: "Chat", help: "Turns chat on or off for the whole agency, on the website and the phone app.", options: [["on", "On"], ["off", "Off"]] },
      { key: "chat_direct", title: "One-to-one chats", help: "Who may start a private chat with one other person. Home groups and Announcements are always there.", options: [["anyone", "Anyone"], ["managers", "Coordinators and administrators only"]] },
      { key: "chat_groups", title: "New groups", help: "Who may create a group and choose its members.", options: [["anyone", "Anyone"], ["managers", "Coordinators and administrators only"]] },
      { key: "chat_attachments", title: "Photos, files and voice notes", help: "Whether people can send them in chat. Each file can be up to the agency upload limit.", options: [["on", "Allowed"], ["off", "Text only"]] },
      { key: "chat_edit_minutes", title: "Editing a sent message", help: "How long after sending the writer can still change it. It then shows as edited.", unit: "minutes", min: 0, max: 1440 },
      { key: "chat_delete_hours", title: "Deleting for everyone", help: "How long after sending the writer can delete a message for everyone. Managers can always remove a message. A copy is kept for audits.", unit: "hours", min: 0, max: 168 },
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
      { key: "email_links", title: "Email links to people", help: "Setup and password links for logins, and document request links for staff, are emailed to the person as well as shown to you to copy.", options: [["on", "On"], ["off", "Off"]] },
      { key: "password_min_length", title: "Shortest password", help: "For staff choosing a password (8 to 64).", unit: "characters", min: 8, max: 64 },
      { key: "session_idle_minutes", title: "Sign out when idle after", help: "A \"Still there?\" warning shows two minutes before. Typing, tapping and scrolling all count as using the app.", unit: "minutes", min: 5, max: 480 },
      { key: "session_max_hours", title: "Sign in again after", help: "Even when someone is active, they sign in again after this long.", unit: "hours", min: 1, max: 336 },
      { key: "phone_session_days", title: "Phone app sign-in lasts", help: "After this long the Mohuddle phone app asks for the password again. A lost phone can be signed out sooner from the staff member's page.", unit: "days", min: 1, max: 90 },
      { key: "phone_lock_minutes", title: "Phone app locks after", help: "When the app has been away this long it asks for the phone's fingerprint, face or passcode before showing anything.", unit: "minutes", min: 1, max: 60 },
      { key: "phone_pin_length", title: "Phone app PIN", help: "Staff choose a PIN after their first sign-in and unlock with it. A 6-digit PIN is much harder to guess than a 4-digit one. The password always works too.", options: [["6", "6 digits"], ["4", "4 digits"], ["either", "Staff choose 4 or 6"]] },
      { key: "phone_biometrics", title: "Fingerprint and face unlock", help: "Lets staff unlock the phone app with the phone's own fingerprint or face check, instead of typing the PIN.", options: [["on", "Allowed"], ["off", "PIN or password only"]] },
      { key: "phone_push_detail", title: "Phone app notifications show", help: "Notifications to the phone app travel through Expo, Apple and Google, which can read them, and show on a locked screen. Private sends only \"You have a new alert\"; staff open the app to see it.", options: [["private", "Private: no details"], ["title", "The title only"], ["full", "Title and details"]] },
      { key: "phone_pin_attempts", title: "Wrong PINs allowed", help: "After this many wrong PINs in a row the phone app signs out, and the password is needed to sign in again.", unit: "tries", min: 3, max: 10 },
      { key: "shared_device_signout", title: "Shared devices", help: "At sign-in, staff can mark a device as shared, such as a home's tablet. It then signs out right after clocking out.", options: [["on", "Sign out after clocking out"], ["off", "Stay signed in"]] },
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
  const settings = await storedSettings();
  const [billing, library] = await Promise.all([currentBilling(), handoverLibrary()]);
  // Features the plan leaves out stay off, whatever is chosen here.
  const offByPlan: Partial<Record<SettingKey, boolean>> = { scribe_enabled: !(await planAllows("scribe")), assistant_enabled: !(await planAllows("assistant")) };
  const grouped = new Set(GROUPS.flatMap(group => group.items.map(item => item.key)));
  const others = (Object.keys(settingDefs) as SettingKey[]).filter(key => !grouped.has(key));
  const groups: Group[] = others.length
    ? [...GROUPS, { id: "other", title: "Other", icon: Settings2, intro: "Rules not yet placed in a group.", items: others.map(key => ({ key, title: settingDefs[key].label, help: "" })) }]
    : GROUPS;

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Settings" title="Business rules" description="These rules drive the Today page, daily notes, the medication record, incidents and the schedule. Each group saves on its own." />
      <SettingsNav current="/app/settings" />
      {billing?.plan && (
        <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-sm font-bold">Mohuddle plan: {billing.plan.name}</p>
            <p className="text-xs text-mute">Includes {PLAN_FEATURES.filter(feature => billing.plan!.features.includes(feature.key)).map(feature => feature.label).join(", ") || "the core app"}. To change plan, contact Mohuddle.</p>
          </div>
          <BillingBadge status={billing.billing.status} state={billing.state} />
        </section>
      )}

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
                        {offByPlan[item.key] && <p className="mt-1 text-xs font-semibold text-[#8a5a10]">Not in your Mohuddle plan, so it stays off.</p>}
                      </div>
                      {item.choices ? (
                        <ChoicePicker name={item.key} initial={value as string[]} choices={item.choices} />
                      ) : item.library ? (
                        <LibraryPicker name={item.key} initial={value as string[]} library={library} />
                      ) : item.roles ? (
                        <RolePicker name={item.key} initial={value as string[]} />
                      ) : def.kind === "list" ? (
                        <ListEditor name={item.key} initial={value as string[]} />
                      ) : item.options ? (
                        <Select id={item.key} name={item.key} defaultValue={String(value)} options={item.options.map(([optionValue, text]) => ({ value: optionValue, label: text }))} />
                      ) : item.date ? (
                        <input id={item.key} name={item.key} type="date" required className="field" defaultValue={String(value)} />
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
