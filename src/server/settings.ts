import "server-only";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { planAllows } from "./billing";
import { db, schema } from "./db";

/*
 * Business rules are dashboard settings stored in the database, never fixed in code.
 * This file only names them, gives a safe default, and checks what comes back.
 */
export const settingDefs = {
  credential_warning_days: {
    label: "Warn about expiring credentials this many days ahead",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(365),
    fallback: 30,
  },
  daily_log_due_hour: {
    label: "Daily logs are due by this hour (0 to 23, agency time)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(23),
    fallback: 22,
  },
  chat_enabled: {
    label: "Chat between staff (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  chat_direct: {
    label: "Who may start a one-to-one chat (anyone or managers)",
    kind: "text",
    schema: z.enum(["anyone", "managers"]),
    fallback: "anyone",
  },
  chat_groups: {
    label: "Who may create a group chat (anyone or managers)",
    kind: "text",
    schema: z.enum(["anyone", "managers"]),
    fallback: "anyone",
  },
  chat_attachments: {
    label: "Photos, files and voice notes in chat (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  chat_mention_all: {
    label: "Who may @everyone in a group (admins: group admins, coordinators and administrators; anyone; off)",
    kind: "text",
    schema: z.enum(["admins", "anyone", "off"]),
    fallback: "admins",
  },
  chat_polls: {
    label: "Who may start a poll in a group (anyone; admins: group admins, coordinators and administrators; off)",
    kind: "text",
    schema: z.enum(["anyone", "admins", "off"]),
    fallback: "anyone",
  },
  chat_edit_minutes: {
    label: "Minutes after sending that a chat message can be edited (0 to 1440)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(1440),
    fallback: 15,
  },
  chat_delete_hours: {
    label: "Hours after sending that a chat message can be deleted for everyone (0 to 168)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(168),
    fallback: 48,
  },
  med_record_scope: {
    label: "Who may record medicines (at_home: direct support staff only at a home they are working at; anyone)",
    kind: "text",
    schema: z.enum(["at_home", "anyone"]),
    fallback: "at_home",
  },
  self_approval: {
    label: "Managers may approve their own punch fixes, time off and timesheets (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "off",
  },
  prn_effect_minutes: {
    label: "Ask how an as-needed dose worked this many minutes after it is given (0 to 480)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(480),
    fallback: 60,
  },
  med_late_minutes: {
    label: "A medication counts as late after this many minutes",
    kind: "number",
    schema: z.coerce.number().int().min(5).max(240),
    fallback: 60,
  },
  incident_report_hours: {
    label: "Reportable incidents must be filed within this many hours",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(72),
    fallback: 24,
  },
  shift_coverage_minimum: {
    label: "Minimum staff per home per shift",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(10),
    fallback: 1,
  },
  overtime_weekly_hours: {
    label: "Flag staff scheduled for more than this many hours in a week",
    kind: "number",
    schema: z.coerce.number().int().min(8).max(100),
    fallback: 40,
  },
  min_rest_hours: {
    label: "Flag fewer than this many hours of rest between one person's shifts",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(24),
    fallback: 8,
  },
  login_link_valid_hours: {
    label: "Setup and password-reset links stay valid for this many hours",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(168),
    fallback: 72,
  },
  password_min_length: {
    label: "Minimum password length for staff logins (8 to 64)",
    kind: "number",
    schema: z.coerce.number().int().min(8).max(64),
    fallback: 10,
  },
  required_daily_checks: {
    label: "Required checks on every daily log (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: [
      "Personal care supported",
      "Meals and fluids offered",
      "Medications reviewed",
      "Home safety walk",
      "Goal activity offered",
    ],
  },
  shift_note_grace_hours: {
    label: "Staff must finish their daily notes within this many hours after their shift ends",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(48),
    fallback: 2,
  },
  daily_log_summary_min_chars: {
    label: "The shift summary on a daily log must be at least this many characters (0 to 500)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(500),
    fallback: 60,
  },
  note_review_roles: {
    label: "Login roles that review and approve notes (admin, coordinator, nurse, dsp). Home managers review their own home too.",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator"],
  },
  note_writer_edit: {
    label: "Writers can change their own note: until it is approved, or only when a reviewer sends it back (until_approved or when_returned)",
    kind: "text",
    schema: z.enum(["until_approved", "when_returned"]),
    fallback: "until_approved",
  },
  note_review_checks: {
    label: "What flags a note for a closer look (late, no_punch, outside_punch, attention, resubmitted, copied, early)",
    kind: "list",
    schema: z.array(z.enum(["late", "no_punch", "outside_punch", "attention", "resubmitted", "copied", "early"])),
    fallback: ["late", "no_punch", "outside_punch", "attention", "resubmitted", "copied", "early"],
  },
  note_copy_percent: {
    label: "A note this similar (in percent) to another by the same writer is flagged as copied (50 to 100)",
    kind: "number",
    schema: z.coerce.number().int().min(50).max(100),
    fallback: 85,
  },
  note_early_minutes: {
    label: "A note signed more than this many minutes before the shift ends is flagged as early (0 to 720)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(720),
    fallback: 60,
  },
  note_punch_tolerance_minutes: {
    label: "A note's times may differ from the clock punch by up to this many minutes before it is flagged (0 to 240)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 15,
  },
  note_bulk_flagged: {
    label: "Bulk approval of flagged notes (skip or allow)",
    kind: "text",
    schema: z.enum(["skip", "allow"]),
    fallback: "skip",
  },
  cp_note_min_chars: {
    label: "The note on a Community Participation note must be at least this many characters (0 to 500)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(500),
    fallback: 40,
  },
  cp_cost_centers: {
    label: "Cost centers for Community Participation notes (one per line, optional)",
    kind: "list",
    schema: z.array(z.string().min(1)),
    fallback: [],
  },
  log_locations: {
    label: "Where support was given, for daily logs (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["At home", "In the community", "Day program", "Work site", "Family home", "Hospital or clinic"],
  },
  adl_items: {
    label: "Personal care tasks recorded on each daily log (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Bathing or shower", "Toileting", "Dressing", "Oral care", "Grooming", "Eating", "Mobility and transfers"],
  },
  prompt_levels: {
    label: "Levels of support, least to most (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(2),
    fallback: ["Independent", "Verbal prompt", "Gestural prompt", "Modelled", "Partial physical help", "Full physical help"],
  },
  activity_types: {
    label: "Activity types staff can tick on a daily log (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Community outing", "Day program", "Work or volunteering", "Exercise", "Faith community", "Shopping or errands", "Leisure at home", "Household chores", "Cooking", "Family or friends visit", "Medical appointment", "Phone or video call"],
  },
  appointment_types: {
    label: "Appointment types (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Primary care", "Dentist", "Psychiatry", "Neurology", "Eye doctor", "Hearing", "Physical therapy", "Occupational therapy", "Speech therapy", "Lab work", "Podiatry", "Specialist", "Hospital follow-up"],
  },
  appointment_reminder_days: {
    label: "Remind the escort and home manager this many days before an appointment",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(14),
    fallback: 2,
  },
  appointment_document_hours: {
    label: "Appointments must be documented within this many hours of their time",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(168),
    fallback: 24,
  },
  notify_roles_appointments: {
    label: "Login roles told about appointments (admin, coordinator, nurse, dsp)",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator", "nurse"],
  },
  notify_roles_notes: {
    label: "Login roles told about overdue daily notes (admin, coordinator, nurse, dsp)",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator"],
  },
  notify_roles_weight: {
    label: "Login roles told about weight outside the range or changing fast (admin, coordinator, nurse, dsp)",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator", "nurse"],
  },
  weight_change_percent: {
    label: "Tell someone when weight changes by this percent or more (1 to 50)",
    kind: "number",
    schema: z.coerce.number().min(1).max(50),
    fallback: 5,
  },
  weight_change_days: {
    label: "Over this many days (7 to 365)",
    kind: "number",
    schema: z.coerce.number().int().min(7).max(365),
    fallback: 30,
  },
  digest_hour: {
    label: "Hour of the morning summary for managers, 0 to 23 in agency time (-1 turns it off)",
    kind: "number",
    schema: z.coerce.number().int().min(-1).max(23),
    fallback: 7,
  },
  digest_roles: {
    label: "Login roles that get the morning summary (admin, coordinator, nurse, dsp)",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator"],
  },
  notify_roles_incidents: {
    label: "Login roles told about incidents (admin, coordinator, nurse, dsp)",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator"],
  },
  document_link_days: {
    label: "Document request links stop working after this many days",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(60),
    fallback: 14,
  },
  notify_roles_documents: {
    label: "Login roles told about documents (admin, coordinator, nurse, dsp)",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator"],
  },
  care_team_roles: {
    label: "Care team roles for people supported (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: [
      "Independent Support Coordinator (ISC)",
      "Primary care physician",
      "Psychiatrist",
      "Neurologist",
      "Dentist",
      "Nutritionist or dietitian",
      "Behavior analyst",
      "Physical therapist",
      "Occupational therapist",
      "Speech therapist",
      "Nurse case manager",
      "Pharmacy",
      "Guardian or conservator",
      "Family",
      "Day program",
      "Employer or job coach",
      "Other",
    ],
  },
  insurance_types: {
    label: "Insurance types (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Medicaid / TennCare", "Medicare", "Medicare Advantage", "Private insurance", "Dental", "Vision", "Other"],
  },
  goal_services: {
    label: "Where plan goals are recorded (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Daily notes", "CP - Community Participation", "Personal assistance", "Day services", "Employment supports", "Behavior supports"],
  },
  communication_options: {
    label: "Ways people communicate (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Speaks in full sentences", "Speaks a few words", "Signs or gestures", "Picture cards or board", "Speech device", "Non-verbal, reads body language", "Hearing impaired", "Vision impaired"],
  },
  mobility_options: {
    label: "Mobility levels (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Walks independently", "Walks with standby help", "Uses a cane or walker", "Uses a wheelchair, self-propels", "Uses a wheelchair, pushed by staff", "Needs a lift or two-person transfer"],
  },
  diet_options: {
    label: "Diets (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Regular", "Diabetic", "Low sodium", "Heart healthy", "Mechanical soft", "Pureed", "Thickened liquids", "Gluten free", "Vegetarian", "Tube feeding"],
  },
  task_categories: {
    label: "Task categories (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Appointment to book", "Paperwork", "Repair", "Purchase", "Follow-up", "Training", "Family contact", "Other"],
  },
  expense_approval_dollars: {
    label: "Home expenses above this many dollars need approval (0 means every expense does)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(100000),
    fallback: 100,
  },
  expense_categories: {
    label: "Expense categories for homes (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Groceries", "Household supplies", "Repairs and maintenance", "Utilities", "Transportation", "Activities and outings", "Medical supplies", "Other"],
  },
  issue_categories: {
    label: "Home issue categories (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Repairs", "Safety", "Supplies", "Vehicle", "Utilities", "Neighbours", "Phones and IT", "Other"],
  },
  clock_in_requirements: {
    label: "What staff must do to clock in (location, handover, statements)",
    kind: "list",
    schema: z.array(z.enum(["location", "handover", "statements"])),
    fallback: ["location", "handover", "statements"],
  },
  clock_out_blocking: {
    label: "What stops a clock-out until done (handover, checks, incident, notes, doses)",
    kind: "list",
    schema: z.array(z.enum(["handover", "checks", "incident", "notes", "doses"])),
    fallback: ["handover", "checks", "incident"],
  },
  clock_early_minutes: {
    label: "Staff can clock in this many minutes before their shift",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(120),
    fallback: 15,
  },
  clock_late_grace_minutes: {
    label: "Clocking in this many minutes after the start still counts as on time",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(120),
    fallback: 7,
  },
  clock_late_exception_minutes: {
    label: "Clocking in this many minutes late is an exception for a manager to review",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 30,
  },
  clock_early_leave_minutes: {
    label: "Clocking out more than this many minutes before the shift ends needs a reason",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 15,
  },
  email_links: {
    label: "Email setup, password and document links to people as well as showing them on screen (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  assistant_enabled: {
    label: "Ask Mohuddle: staff can ask questions and clock in, out and take breaks by voice or typing (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  scribe_enabled: {
    label: "Let staff speak their notes and have a local model draft them (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  scribe_model: {
    label: "The Ollama model that drafts notes from what staff said",
    kind: "text",
    schema: z.string().trim().min(1).max(80),
    fallback: "qwen3.5:4b",
  },
  scribe_speech: {
    label: "The speech model: small (fastest), medium or turbo (most accurate)",
    kind: "text",
    schema: z.enum(["small", "medium", "turbo"]),
    fallback: "small",
  },
  clock_pay_early_from: {
    label: "When someone clocks in early, pay from",
    kind: "text",
    schema: z.enum(["shift", "punch"]),
    fallback: "shift",
  },
  clock_geofence_meters: {
    label: "Staff must be within this many meters of the home to clock in or out",
    kind: "number",
    schema: z.coerce.number().int().min(25).max(5000),
    fallback: 250,
  },
  clock_overstay_minutes: {
    label: "Clocking out this many minutes after the shift ends needs a reason",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 15,
  },
  clock_no_show_minutes: {
    label: "A shift with no clock-in this many minutes after it starts is a no-show",
    kind: "number",
    schema: z.coerce.number().int().min(5).max(240),
    fallback: 15,
  },
  remind_shift_start_minutes: {
    label: "Remind staff this many minutes before their shift starts (0 turns it off)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 15,
  },
  remind_shift_end_minutes: {
    label: "Remind staff this many minutes before their shift ends to finish notes and handover (0 turns it off)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 15,
  },
  remind_still_clocked_minutes: {
    label: "Tell staff they are still clocked in this many minutes after their shift ends (0 turns it off)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(240),
    fallback: 20,
  },
  break_meal_minutes: {
    label: "Length of a meal break in minutes",
    kind: "number",
    schema: z.coerce.number().int().min(5).max(120),
    fallback: 30,
  },
  break_rest_minutes: {
    label: "Length of a rest break in minutes",
    kind: "number",
    schema: z.coerce.number().int().min(5).max(60),
    fallback: 15,
  },
  remind_break_end_minutes: {
    label: "Remind staff this many minutes before their break ends (0 turns it off)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(30),
    fallback: 5,
  },
  session_idle_minutes: {
    label: "Sign people out after this many minutes without using the app (5 to 480)",
    kind: "number",
    schema: z.coerce.number().int().min(5).max(480),
    fallback: 30,
  },
  session_max_hours: {
    label: "Everyone signs in again after this many hours, even if active (1 to 336)",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(336),
    fallback: 12,
  },
  phone_session_days: {
    label: "The phone app asks for the password again after this many days (1 to 90)",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(90),
    fallback: 30,
  },
  phone_lock_minutes: {
    label: "The phone app locks after this many minutes away (1 to 60)",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(60),
    fallback: 5,
  },
  phone_pin_length: {
    label: "Phone app PIN length: 6, 4, or either (staff choose)",
    kind: "text",
    schema: z.enum(["6", "4", "either"]),
    fallback: "6",
  },
  phone_biometrics: {
    label: "Phone app may unlock with fingerprint or face (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  phone_push_detail: {
    label: "What phone app notifications show (private, title or full)",
    kind: "text",
    schema: z.enum(["private", "title", "full"]),
    fallback: "private",
  },
  phone_pin_attempts: {
    label: "Wrong PINs before the phone app signs out (3 to 10)",
    kind: "number",
    schema: z.coerce.number().int().min(3).max(10),
    fallback: 5,
  },
  shared_device_signout: {
    label: "On devices marked shared, sign out after clocking out (on or off)",
    kind: "text",
    schema: z.enum(["on", "off"]),
    fallback: "on",
  },
  clock_forgot_hours: {
    label: "Still clocked in this many hours after the shift ends counts as a forgotten clock-out",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(24),
    fallback: 2,
  },
  handover_min_chars: {
    label: "Shortest handover note at clock out",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(1000),
    fallback: 40,
  },
  handover_checks: {
    label: "Handover ticks at clock out, for every home (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)),
    fallback: ["Medications counted and locked away", "House secure: doors and windows checked", "Vehicle keys returned and fuel noted", "Petty cash counted", "Kitchen clean and food stored safely", "Fire exits clear"],
  },
  clock_in_statements: {
    label: "Statements staff tick at clock in (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)),
    fallback: ["I am fit for duty, rested and not impaired.", "I will follow each person's support plan and the medication record."],
  },
  notify_roles_time: {
    label: "Login roles told about no-shows, forgotten clock-outs and time to review",
    kind: "list",
    schema: z.array(z.enum(["admin", "coordinator", "nurse", "dsp"])),
    fallback: ["admin", "coordinator"],
  },
  pay_period_type: {
    label: "How often staff are paid",
    kind: "text",
    schema: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
    fallback: "biweekly",
  },
  pay_period_anchor: {
    label: "The first day of any one pay period (for weekly or every two weeks)",
    kind: "text",
    schema: z.iso.date(),
    fallback: "2026-01-05",
  },
  workweek_starts_on: {
    label: "The workweek for overtime starts on (1 = Monday ... 7 = Sunday)",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(7),
    fallback: 7,
  },
  overtime_after_hours: {
    label: "Hours worked in a workweek before overtime starts",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(80),
    fallback: 40,
  },
  overtime_warning_hours: {
    label: "Warn staff and managers when someone has worked this many hours in the workweek",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(80),
    fallback: 36,
  },
  time_rounding_minutes: {
    label: "Round each punch to the nearest (0, 5, 6 or 15 minutes)",
    kind: "number",
    schema: z.coerce.number().int().refine(value => [0, 5, 6, 15].includes(value), "Use 0, 5, 6 or 15."),
    fallback: 0,
  },
  paid_holidays: {
    label: "Holidays, one per line as YYYY-MM-DD and a name",
    kind: "list",
    schema: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}\b/, "Start each line with a date, for example 2026-11-26 Thanksgiving.")),
    fallback: ["2026-01-01 New Year's Day", "2026-05-25 Memorial Day", "2026-07-03 Independence Day (observed)", "2026-09-07 Labor Day", "2026-11-26 Thanksgiving", "2026-12-25 Christmas Day"],
  },
  payroll_export_columns: {
    label: "Columns in the payroll export, in order",
    kind: "list",
    schema: z.array(z.enum(["employee_number", "first_name", "last_name", "email", "period_start", "period_end", "regular_hours", "overtime_hours", "total_hours", "holiday_hours", "adjustment_hours", "time_off_hours", "hourly_rate", "gross_pay", "status"])).min(1),
    fallback: ["employee_number", "last_name", "first_name", "period_start", "period_end", "regular_hours", "overtime_hours", "holiday_hours", "total_hours"],
  },
  overtime_pay_percent: {
    label: "Overtime is paid at this percent of the regular rate",
    kind: "number",
    schema: z.coerce.number().int().min(100).max(300),
    fallback: 150,
  },
  holiday_pay_percent: {
    label: "Hours worked on a holiday are paid at this percent (100 means no extra)",
    kind: "number",
    schema: z.coerce.number().int().min(100).max(300),
    fallback: 150,
  },
  time_off_types: {
    label: "Paid time off types (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Vacation / PTO", "Sick", "Bereavement", "Jury duty"],
  },
  time_off_unpaid_types: {
    label: "Unpaid time off types (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)),
    fallback: ["Unpaid leave"],
  },
  time_off_balance_types: {
    label: "Paid types that use the leave balance (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)),
    fallback: ["Vacation / PTO", "Sick"],
  },
  pto_accrual_hours_worked: {
    label: "Staff earn one hour of leave for this many hours worked (0 turns earning off)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(200),
    fallback: 30,
  },
  pto_max_balance_hours: {
    label: "Leave balance stops growing at this many hours",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(2000),
    fallback: 80,
  },
  time_off_notice_days: {
    label: "Ask for time off at least this many days ahead (sick leave excepted)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(90),
    fallback: 14,
  },
  incident_tier1_hours: {
    label: "Tier 1 events must reach DIDD Investigations within this many hours",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(24),
    fallback: 4,
  },
  incident_notify_parties: {
    label: "Who can be recorded as notified about an incident (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: [
      "Adult Protective Services (APS) / Child Protective Services (CPS)",
      "Case manager / Independent Support Coordinator (ISC)",
      "Chief Officer / Administrator on Duty (AOD)",
      "DIDD Investigator",
      "Law enforcement",
      "Legal representative",
      "BlueCare",
      "UHC",
      "WellPoint",
      "Circle of support",
      "ETRO",
      "MTRO",
      "TBI",
    ],
  },
  incident_locations: {
    label: "Where incidents happen (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Residence", "Day program", "Community", "Work site", "Vehicle", "Family home", "Hospital or clinic", "Other"],
  },
  waiver_types: {
    label: "Waiver types (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Statewide Waiver", "Comprehensive Aggregate Cap (CAC) Waiver", "Self-Determination Waiver", "ECF CHOICES", "Not on a waiver"],
  },
  mco_options: {
    label: "Managed care organisations (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["BlueCare", "United Healthcare", "WellPoint"],
  },
  employment_types: {
    label: "Ways staff are employed (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["Full time", "Part time", "PRN / as needed", "Contractor"],
  },
  credential_types: {
    label: "Credential types tracked for staff (one per line)",
    kind: "list",
    schema: z.array(z.string().min(1)).min(1),
    fallback: ["CPR and First Aid", "DIDD Core Training", "Background Check", "Medication Administration", "Driver Licence"],
  },
} as const;

export type SettingKey = keyof typeof settingDefs;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingDefs)[K]["schema"]> };

export async function getSettings(): Promise<Settings> {
  const keys = Object.keys(settingDefs) as SettingKey[];
  const rows = await db.select().from(schema.settings).where(inArray(schema.settings.key, keys));
  const stored = new Map(rows.map(row => [row.key, row.value]));
  const out = {} as Record<string, unknown>;
  for (const key of keys) {
    const def = settingDefs[key];
    const parsed = def.schema.safeParse(stored.get(key));
    out[key] = parsed.success ? parsed.data : def.fallback;
  }
  const settings = out as Settings;
  if (!(await planAllows("scribe"))) settings.scribe_enabled = "off";
  if (!(await planAllows("assistant"))) settings.assistant_enabled = "off";
  return settings;
}

/* The agency's own settings, before its plan switches anything off. For the settings page. */
export async function storedSettings(): Promise<Settings> {
  const keys = Object.keys(settingDefs) as SettingKey[];
  const rows = await db.select().from(schema.settings).where(inArray(schema.settings.key, keys));
  const stored = new Map(rows.map(row => [row.key, row.value]));
  const out = {} as Record<string, unknown>;
  for (const key of keys) {
    const parsed = settingDefs[key].schema.safeParse(stored.get(key));
    out[key] = parsed.success ? parsed.data : settingDefs[key].fallback;
  }
  return out as Settings;
}

export async function saveSetting(key: SettingKey, raw: unknown) {
  const def = settingDefs[key];
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${def.label}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  await db
    .insert(schema.settings)
    .values({ key, value: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.settings.agencyId, schema.settings.key], set: { value: parsed.data, updatedAt: new Date() } });
}
