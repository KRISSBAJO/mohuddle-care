import "server-only";
import { inArray } from "drizzle-orm";
import { z } from "zod";
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
    label: "Daily logs are due by this hour (0 to 23, Central time)",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(23),
    fallback: 22,
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
  return out as Settings;
}

export async function saveSetting(key: SettingKey, raw: unknown) {
  const def = settingDefs[key];
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${def.label}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  await db
    .insert(schema.settings)
    .values({ key, value: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data, updatedAt: new Date() } });
}
