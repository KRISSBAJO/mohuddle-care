import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

/* Roles decide what a signed-in person may do inside the Hub. */
export const userRole = pgEnum("user_role", ["admin", "coordinator", "nurse", "dsp"]);
export const homeType = pgEnum("home_type", ["group_home", "family_model", "supported_living", "day_program"]);
export const staffRole = pgEnum("staff_role", ["dsp", "coordinator", "residential_manager", "nurse", "admin"]);
export const serviceType = pgEnum("service_type", [
  "day_services",
  "supported_living",
  "family_model",
  "foster_care",
  "supported_employment",
  "personal_assistance",
  "residential_rehabilitation",
  "respite",
  "semi_independent",
]);
export const goalStatus = pgEnum("goal_status", ["active", "met", "paused"]);
export const shiftKind = pgEnum("shift_kind", ["day", "evening", "overnight"]);
export const shiftStatus = pgEnum("shift_status", ["open", "scheduled", "confirmed", "completed", "missed"]);
export const mood = pgEnum("mood", ["great", "good", "okay", "low", "distressed"]);
export const medStatus = pgEnum("med_status", ["due", "given", "refused", "missed", "held"]);
export const incidentCategory = pgEnum("incident_category", [
  "injury",
  "medication_error",
  "behavioural",
  "allegation",
  "elopement",
  "property",
  "other",
]);
export const incidentSeverity = pgEnum("incident_severity", ["low", "moderate", "high", "critical"]);
export const incidentStatus = pgEnum("incident_status", ["open", "under_review", "closed"]);
export const taskPriority = pgEnum("task_priority", ["low", "normal", "high"]);
export const taskStatus = pgEnum("task_status", ["open", "done"]);
export const expenseStatus = pgEnum("expense_status", ["pending", "approved", "rejected"]);
export const issuePriority = pgEnum("issue_priority", ["low", "normal", "high", "urgent"]);
export const issueStatus = pgEnum("issue_status", ["open", "in_progress", "resolved"]);
export const appointmentStatus = pgEnum("appointment_status", ["scheduled", "completed", "cancelled", "missed"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const emptyList = () => sql`'[]'::jsonb`;
const emptyMap = () => sql`'{}'::jsonb`;

/* ---------- Agencies ---------- */

/*
 * One agency (tenant) using Mohuddle. Every other table, except logins, carries an agency_id, and
 * Postgres row rules show the app only the rows of the agency it is working for (see drizzle/0029).
 */
export const agencies = pgTable("agencies", {
  id: id(),
  // The agency's own web address: slug.mohuddle.com.
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  cityStateZip: text("city_state_zip").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Chicago"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/*
 * The agency a row belongs to. Filled in from the connection's agency, which the app sets for every
 * query (src/server/db/index.ts), so inserts do not pass it. With no agency set, inserts fail.
 */
const agencyId = () =>
  uuid("agency_id")
    .notNull()
    .default(sql`nullif(current_setting('app.agency_id', true), '')::uuid`)
    .references(() => agencies.id);

/*
 * A person's sign-in: one email and password, whichever agencies they work for. Each agency they
 * belong to has its own row in users, with its own role. Not visible to other agencies.
 */
export const logins = pgTable("logins", {
  id: id(),
  email: text("email").notNull().unique(),
  // Null until the person opens their setup link and chooses a password.
  passwordHash: text("password_hash"),
  hasPassword: boolean("has_password").generatedAlwaysAs(sql`password_hash is not null`),
  // Runs Mohuddle itself: may open the owner console. Set only by scripts/make-owner.ts, never in the app.
  isOwner: boolean("is_owner").notNull().default(false),
  // An owner's name in the console, and their authenticator app: the secret (encrypted), when it was
  // switched on, and hashes of unused backup codes. Owners must use it to open the console.
  ownerName: text("owner_name").notNull().default(""),
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  backupCodes: jsonb("backup_codes").$type<string[]>().notNull().default(emptyList()),
  createdAt: createdAt(),
});

/*
 * A one-time pass that carries a sign-in to an agency's own web address, where the browser keeps a
 * separate session. It works once, within two minutes. Only a hash is stored, and the app's role
 * cannot see these.
 */
export const sessionHandoffs = pgTable("session_handoffs", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull(),
  agencyId: uuid("agency_id_for").notNull(),
  shared: boolean("shared").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/*
 * What owners did in the owner console: created or changed an agency, added an administrator, issued
 * a link, opened an agency for support. Mohuddle's own record; agencies cannot see it.
 */
export const ownerEvents = pgTable(
  "owner_events",
  {
    id: id(),
    loginId: uuid("login_id").references(() => logins.id, { onDelete: "set null" }),
    ownerName: text("owner_name").notNull(),
    action: text("action").notNull(),
    agencyId: uuid("agency_id_for").references(() => agencies.id, { onDelete: "set null" }),
    detail: text("detail").notNull().default(""),
    at: createdAt(),
  },
  table => [index("owner_events_at").on(table.at), index("owner_events_agency").on(table.agencyId, table.at)],
);

/* ---------- Plans and billing (Mohuddle's own; agencies cannot see these tables) ---------- */

/* A plan agencies can be on: its monthly price and the features it includes. Managed in the owner console. */
export const plans = pgTable("plans", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  baseCents: integer("base_cents").notNull().default(0),
  unitCents: integer("unit_cents").notNull().default(0),
  unit: text("unit").$type<"person" | "staff" | "home" | "none">().notNull().default("person"),
  features: jsonb("features").$type<string[]>().notNull().default(emptyList()),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

/* Each agency's plan and where it stands: trial, paying, complimentary or cancelled. */
export const agencyBilling = pgTable("agency_billing", {
  agencyId: uuid("agency_id_for")
    .primaryKey()
    .references(() => agencies.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  status: text("status").$type<"trial" | "active" | "complimentary" | "cancelled">().notNull().default("trial"),
  trialEndsOn: date("trial_ends_on"),
  paidUntil: date("paid_until"),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* A payment an owner recorded, and how far it pays for. */
export const billingPayments = pgTable(
  "billing_payments",
  {
    id: id(),
    agencyId: uuid("agency_id_for")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    paidOn: date("paid_on").notNull(),
    coversUntil: date("covers_until").notNull(),
    method: text("method").notNull().default("invoice"),
    note: text("note").notNull().default(""),
    recordedBy: text("recorded_by").notNull().default(""),
    createdAt: createdAt(),
  },
  table => [index("billing_payments_agency").on(table.agencyId, table.paidOn)],
);

/* Mohuddle-wide rules the owner sets, such as the trial length. Not an agency's settings. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/*
 * A signed-in owner on the admin address: separate from any agency's session. Only a hash of the
 * token is kept. Agencies cannot see these.
 */
export const ownerSessions = pgTable("owner_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  loginId: uuid("login_id")
    .notNull()
    .references(() => logins.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: createdAt(),
});

/*
 * Requests for a Mohuddle demo, from the product page. They belong to Mohuddle, not to any agency,
 * so the app's role cannot see them; only the owner console reads them.
 */
export const productEnquiries = pgTable("product_enquiries", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  agencyName: text("agency_name").notNull().default(""),
  message: text("message").notNull().default(""),
  handled: boolean("handled").notNull().default(false),
  createdAt: createdAt(),
});

export const homes = pgTable("homes", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  type: homeType("type").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default("Nashville"),
  capacity: integer("capacity").notNull().default(4),
  phone: text("phone").notNull().default(""),
  active: boolean("active").notNull().default(true),
  // Which shifts must always have someone on, and which weekdays the home runs (1 = Monday ... 7 = Sunday).
  // The schedule reports a coverage gap only for these.
  staffedKinds: jsonb("staffed_kinds").$type<("day" | "evening" | "overnight")[]>().notNull().default(sql`'["day","evening","overnight"]'::jsonb`),
  // Shift patterns this home must have staffed. Null means every active pattern, including new ones.
  staffedPatterns: jsonb("staffed_patterns").$type<string[] | null>(),
  openDays: jsonb("open_days").$type<number[]>().notNull().default(sql`'[1,2,3,4,5,6,7]'::jsonb`),
  // The person responsible for the home day to day, usually its residential manager.
  managerStaffId: uuid("manager_staff_id").references((): AnyPgColumn => staff.id, { onDelete: "set null" }),
  // Spending limit per calendar month, in cents. Null means no budget set.
  monthlyBudgetCents: integer("monthly_budget_cents"),
  zip: text("zip").notNull().default(""),
  county: text("county").notNull().default(""),
  licenseNumber: text("license_number").notNull().default(""),
  openedOn: date("opened_on"),
  // Practical notes for staff: parking, how to get in, quiet hours. Never door codes or passwords.
  notes: text("notes").notNull().default(""),
  // The state's regional office for the home: east, middle or west. Used on incident reports.
  region: text("region").notNull().default(""),
  // Where the home is, for checking staff are there when they clock in and out.
  latitude: real("latitude"),
  longitude: real("longitude"),
  // Handover ticks for this home, on top of the agency-wide list in Settings.
  handoverChecks: jsonb("handover_checks").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

export const staff = pgTable(
  "staff",
  {
    id: id(),
    agencyId: agencyId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    role: staffRole("role").notNull().default("dsp"),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    homeId: uuid("home_id").references(() => homes.id, { onDelete: "set null" }),
    hiredAt: date("hired_at"),
    // HR basics: payroll number, how they are employed, where they live and who to call for them.
    employeeNumber: text("employee_number").notNull().default(""),
    employmentType: text("employment_type").notNull().default(""),
    address: text("address").notNull().default(""),
    emergencyContact: text("emergency_contact").notNull().default(""),
    emergencyPhone: text("emergency_phone").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  table => [uniqueIndex("staff_agency_email").on(table.agencyId, table.email)],
);

/* Someone's place in one agency: their role there and their staff record. Signs in with a login. */
export const users = pgTable(
  "users",
  {
    id: id(),
    agencyId: agencyId(),
    loginId: uuid("login_id")
      .notNull()
      .references(() => logins.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("dsp"),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    // A Mohuddle owner's support visit: an administrator place that works only until this time, gets
    // no notifications and is not anyone's staff record. Null for everyone else.
    supportUntil: timestamp("support_until", { withTimezone: true }),
    reason: text("support_reason").notNull().default(""),
    createdAt: createdAt(),
  },
  table => [uniqueIndex("users_agency_email").on(table.agencyId, table.email), uniqueIndex("users_agency_login").on(table.agencyId, table.loginId)],
);

export const sessions = pgTable("sessions", {
  agencyId: agencyId(),
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // When the session was last used, for signing out idle devices; and whether the device is shared.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  shared: boolean("shared").notNull().default(false),
  // Set for a sign-in from the Mohuddle phone app: the phone's name, shown so a lost phone can be signed out.
  device: text("device"),
  createdAt: createdAt(),
});

/* Phones and browsers that asked for notifications. One row per device; dead ones are removed when a push fails. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    agencyId: agencyId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    device: text("device").notNull().default(""),
    createdAt: createdAt(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  },
  table => [index("push_subscriptions_user").on(table.userId), uniqueIndex("push_subscriptions_device").on(table.userId, table.endpoint)],
);

/* One-time links for first sign-in and password resets. Only a hash of the token is stored. */
export const loginTokens = pgTable("login_tokens", {
  agencyId: agencyId(),
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const credentials = pgTable("credentials", {
  id: id(),
  agencyId: agencyId(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  issuedAt: date("issued_at"),
  expiresAt: date("expires_at"),
  note: text("note").notNull().default(""),
});

export const individuals = pgTable("individuals", {
  id: id(),
  agencyId: agencyId(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dob: date("dob"),
  homeId: uuid("home_id").references(() => homes.id, { onDelete: "set null" }),
  serviceType: serviceType("service_type").notNull(),
  admittedAt: date("admitted_at"),
  guardianName: text("guardian_name").notNull().default(""),
  guardianPhone: text("guardian_phone").notNull().default(""),
  emergencyContact: text("emergency_contact").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  allergies: text("allergies").notNull().default(""),
  diagnoses: text("diagnoses").notNull().default(""),
  supportNotes: text("support_notes").notNull().default(""),
  // Who they are, beyond the record: how to address them, communicate with them and support them well.
  preferredName: text("preferred_name").notNull().default(""),
  gender: text("gender").notNull().default(""),
  pronouns: text("pronouns").notNull().default(""),
  primaryLanguage: text("primary_language").notNull().default(""),
  communication: text("communication").notNull().default(""),
  mobility: text("mobility").notNull().default(""),
  diet: text("diet").notNull().default(""),
  likes: text("likes").notNull().default(""),
  // Their Medicaid waiver, for state reports such as the Reportable Event Form.
  waiverType: text("waiver_type").notNull().default(""),
  // For the weight chart: height for BMI, and the suggested weight range from their doctor or plan.
  heightInches: real("height_inches"),
  weightLow: real("weight_low"),
  weightHigh: real("weight_high"),
  active: boolean("active").notNull().default(true),
  // Set when support ends. The record and its history stay; active is false while discharged.
  dischargedAt: date("discharged_at"),
  dischargeReason: text("discharge_reason").notNull().default(""),
  createdAt: createdAt(),
});

export const planGoals = pgTable("plan_goals", {
  id: id(),
  agencyId: agencyId(),
  individualId: uuid("individual_id")
    .notNull()
    .references(() => individuals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  targetDate: date("target_date"),
  status: goalStatus("status").notNull().default("active"),
  // As written in the ISP: the measurable step, how often it is worked on, and which note records it.
  measurableStep: text("measurable_step").notNull().default(""),
  frequencyCount: integer("frequency_count"),
  frequencyPeriod: text("frequency_period").$type<"day" | "week" | "month">(),
  effectiveDate: date("effective_date"),
  documentedOn: text("documented_on").notNull().default("Daily notes"),
  setupNotes: text("setup_notes").notNull().default(""),
  createdAt: createdAt(),
});

/* Named shift times admins set up, such as "Weekday day 07:00-15:00" or "Weekend night 19:00-07:00". */
export const shiftPatterns = pgTable("shift_patterns", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  start: text("start_time").notNull(),
  end: text("end_time").notNull(),
  // ISO weekdays the pattern runs on: 1 = Monday ... 7 = Sunday. The day is the day the shift starts.
  weekdays: jsonb("weekdays").$type<number[]>().notNull().default(sql`'[1,2,3,4,5,6,7]'::jsonb`),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const shifts = pgTable("shifts", {
  id: id(),
  agencyId: agencyId(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  // Worked out from the start time. Only used for colour and grouping; the pattern carries the name.
  kind: shiftKind("kind").notNull(),
  patternId: uuid("pattern_id").references(() => shiftPatterns.id, { onDelete: "set null" }),
  status: shiftStatus("status").notNull().default("scheduled"),
  note: text("note").notNull().default(""),
});

export const dailyLogs = pgTable("daily_logs", {
  id: id(),
  agencyId: agencyId(),
  individualId: uuid("individual_id")
    .notNull()
    .references(() => individuals.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  logDate: date("log_date").notNull(),
  mood: mood("mood").notNull().default("good"),
  checks: jsonb("checks").$type<string[]>().notNull().default(emptyList()),
  meals: text("meals").notNull().default(""),
  activities: text("activities").notNull().default(""),
  health: text("health").notNull().default(""),
  behaviours: text("behaviours").notNull().default(""),
  goalProgress: text("goal_progress").notNull().default(""),
  // The shift summary. Older logs used it for "anything else for the next shift".
  notes: text("notes").notNull().default(""),
  // A full shift note, in the shape reviewers expect from a Therap T-Log. Older logs leave these empty.
  shift: shiftKind("shift"),
  // The scheduled shift this note is for, and its pattern name at the time of writing.
  shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "set null" }),
  shiftName: text("shift_name").notNull().default(""),
  timeIn: text("time_in").notNull().default(""),
  timeOut: text("time_out").notNull().default(""),
  location: text("location").notNull().default(""),
  presentation: text("presentation").notNull().default(""),
  adl: jsonb("adl").$type<Record<string, string>>().notNull().default(emptyMap()),
  mealIntake: jsonb("meal_intake").$type<Record<string, string>>().notNull().default(emptyMap()),
  fluidsOz: integer("fluids_oz"),
  sleepHours: real("sleep_hours"),
  sleepQuality: text("sleep_quality").notNull().default(""),
  bowelMovements: integer("bowel_movements"),
  incontinence: integer("incontinence"),
  vitals: jsonb("vitals").$type<Partial<Record<"bpSys" | "bpDia" | "pulse" | "temp" | "weight" | "pain", number>>>().notNull().default(emptyMap()),
  seizure: boolean("seizure").notNull().default(false),
  seizureNotes: text("seizure_notes").notNull().default(""),
  behaviourOccurred: boolean("behaviour_occurred").notNull().default(false),
  antecedent: text("antecedent").notNull().default(""),
  intervention: text("intervention").notNull().default(""),
  behaviourOutcome: text("behaviour_outcome").notNull().default(""),
  activityTypes: jsonb("activity_types").$type<string[]>().notNull().default(emptyList()),
  familyContact: text("family_contact").notNull().default(""),
  appointments: text("appointments").notNull().default(""),
  // Free-text notes per personal care task, and the newer sleep and bowel details.
  adlNotes: jsonb("adl_notes").$type<Record<string, string>>().notNull().default(emptyMap()),
  sleepNotes: text("sleep_notes").notNull().default(""),
  stoolType: text("stool_type").notNull().default(""),
  continenceNotes: text("continence_notes").notNull().default(""),
  // Answers to extra items set for everyone, the home or the person. Labels are kept so old notes still read right.
  extra: jsonb("extra")
    .$type<{ id: string; label: string; value: string | string[]; unit: string; scope: "all" | "home" | "person"; followUp?: { prompt: string; note: string; docs: { label: string; done: boolean }[] } }[]>()
    .notNull()
    .default(emptyList()),
  // The optional hourly timeline: a line per hour, with the doses due in it as they stood when signed.
  timeline: jsonb("timeline").$type<{ hour: string; note: string; meds: string[] }[]>().notNull().default(emptyList()),
  // Optional sections that were switched on for this person when the note was written.
  sections: jsonb("sections").$type<string[]>().notNull().default(emptyList()),
  signedName: text("signed_name").notNull().default(""),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  // Review: every note starts as submitted; a reviewer approves it or returns it to the writer.
  reviewStatus: text("review_status").$type<"submitted" | "returned" | "approved">().notNull().default("submitted"),
  reviewedBy: uuid("reviewed_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  returnReason: text("return_reason").notNull().default(""),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/*
 * What daily notes must cover, beyond the core. Scope "all" is the agency default; "home" and "person"
 * add to it or switch sections off. Sections switch built-in parts on or off; items are extra questions.
 */
export const noteRequirements = pgTable(
  "note_requirements",
  {
    id: id(),
    agencyId: agencyId(),
    scope: text("scope").$type<"all" | "home" | "person">().notNull(),
    homeId: uuid("home_id").references(() => homes.id, { onDelete: "cascade" }),
    individualId: uuid("individual_id").references(() => individuals.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"section" | "item">().notNull(),
    section: text("section").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    required: boolean("required").notNull().default(false),
    label: text("label").notNull().default(""),
    fieldType: text("field_type").notNull().default(""),
    options: jsonb("options").$type<string[]>().notNull().default(emptyList()),
    unit: text("unit").notNull().default(""),
    help: text("help").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    // For yes or no questions: the answer that opens a follow-up ("Yes" or "No"), what to ask, and the
    // documents that answer needs, such as an incident report. Empty means no follow-up.
    followUpOn: text("follow_up_on").notNull().default(""),
    followUpPrompt: text("follow_up_prompt").notNull().default(""),
    followUpDocs: jsonb("follow_up_docs").$type<string[]>().notNull().default(emptyList()),
    createdAt: createdAt(),
  },
  table => [index("note_requirements_home").on(table.homeId), index("note_requirements_person").on(table.individualId)],
);

/*
 * A Community Participation note: one outing or activity in the community, with its billable time.
 * Separate from the shift note, as DIDD providers bill and review them separately.
 */
export const communityNotes = pgTable(
  "community_notes",
  {
    id: id(),
    agencyId: agencyId(),
    individualId: uuid("individual_id")
      .notNull()
      .references(() => individuals.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    noteDate: date("note_date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    minutes: integer("minutes").notNull(),
    trips: integer("trips"),
    costCenter: text("cost_center").notNull().default(""),
    otherParty: text("other_party").notNull().default(""),
    selection: text("selection").notNull().default(""),
    location: text("location").notNull().default(""),
    activity: text("activity").notNull().default(""),
    note: text("note").notNull().default(""),
    learning: text("learning").notNull().default(""),
    // Another staff member who was there, if any. Optional; they do not sign.
    withStaffId: uuid("with_staff_id").references(() => staff.id, { onDelete: "set null" }),
    signedName: text("signed_name").notNull().default(""),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    // Review: every note starts as submitted; a reviewer approves it or returns it to the writer.
    reviewStatus: text("review_status").$type<"submitted" | "returned" | "approved">().notNull().default("submitted"),
    reviewedBy: uuid("reviewed_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    returnReason: text("return_reason").notNull().default(""),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  table => [index("community_notes_person").on(table.individualId, table.noteDate), index("community_notes_review").on(table.reviewStatus)],
);

/* Everything that happened to a note after it was signed: edits with what changed, returns, resubmissions and approvals. */
export const noteEvents = pgTable(
  "note_events",
  {
    id: id(),
    agencyId: agencyId(),
    noteKind: text("note_kind").$type<"daily" | "community">().notNull(),
    noteId: uuid("note_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").$type<"edited" | "returned" | "resubmitted" | "approved" | "reopened">().notNull(),
    note: text("note").notNull().default(""),
    changes: jsonb("changes").$type<{ field: string; before: string; after: string }[]>().notNull().default(emptyList()),
    createdAt: createdAt(),
  },
  table => [index("note_events_note").on(table.noteKind, table.noteId)],
);

/* One weighing, signed by whoever recorded it. Height and BMI are kept as they were that day. */
export const weightRecords = pgTable(
  "weight_records",
  {
    id: id(),
    agencyId: agencyId(),
    individualId: uuid("individual_id")
      .notNull()
      .references(() => individuals.id, { onDelete: "cascade" }),
    recordedOn: date("recorded_on").notNull(),
    pounds: real("pounds").notNull(),
    heightInches: real("height_inches"),
    bmi: real("bmi"),
    comments: text("comments").notNull().default(""),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    signedName: text("signed_name").notNull().default(""),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  table => [index("weight_records_person").on(table.individualId, table.recordedOn)],
);

/* Data on each plan goal for one shift: offered or not, how much help, and how it went. */
export const dailyLogGoals = pgTable(
  "daily_log_goals",
  {
    id: id(),
    agencyId: agencyId(),
    logId: uuid("log_id")
      .notNull()
      .references(() => dailyLogs.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => planGoals.id, { onDelete: "cascade" }),
    offered: text("offered").notNull(),
    promptLevel: text("prompt_level").notNull().default(""),
    outcome: text("outcome").notNull().default(""),
    attempts: integer("attempts"),
    successes: integer("successes"),
    note: text("note").notNull().default(""),
  },
  table => [uniqueIndex("daily_log_goal_once").on(table.logId, table.goalId), index("daily_log_goals_goal").on(table.goalId)],
);

export const medications = pgTable("medications", {
  id: id(),
  agencyId: agencyId(),
  individualId: uuid("individual_id")
    .notNull()
    .references(() => individuals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dose: text("dose").notNull(),
  route: text("route").notNull().default("oral"),
  times: jsonb("times").$type<string[]>().notNull().default(emptyList()),
  prescriber: text("prescriber").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  // A controlled medicine (on a count sheet). The phone app only records these with a signal.
  controlled: boolean("controlled").notNull().default(false),
  // Given as needed (PRN) instead of at set times: when to use it, the least time between doses and
  // the most doses in 24 hours. These have no times and no scheduled doses.
  asNeeded: boolean("as_needed").notNull().default(false),
  prnUse: text("prn_use").notNull().default(""),
  prnMinHours: integer("prn_min_hours"),
  prnMaxPerDay: integer("prn_max_per_day"),
  active: boolean("active").notNull().default(true),
  // Doses are only generated from startedAt onwards. A change stops this row and starts a new one,
  // so past administration records keep the dose that was actually given.
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  stopReason: text("stop_reason").notNull().default(""),
});

export const medAdministrations = pgTable(
  "med_administrations",
  {
    id: id(),
    agencyId: agencyId(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    individualId: uuid("individual_id")
      .notNull()
      .references(() => individuals.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    status: medStatus("status").notNull().default("due"),
    note: text("note").notNull().default(""),
    // An as-needed dose: the note holds why it was given, and the effect is recorded afterwards.
    prn: boolean("prn").notNull().default(false),
    effect: text("effect").notNull().default(""),
    effectAt: timestamp("effect_at", { withTimezone: true }),
  },
  table => [uniqueIndex("med_admin_once").on(table.medicationId, table.scheduledFor)],
);

export const incidents = pgTable("incidents", {
  id: id(),
  agencyId: agencyId(),
  individualId: uuid("individual_id").references(() => individuals.id, { onDelete: "set null" }),
  homeId: uuid("home_id").references(() => homes.id, { onDelete: "set null" }),
  reportedBy: uuid("reported_by").references(() => staff.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  category: incidentCategory("category").notNull(),
  severity: incidentSeverity("severity").notNull().default("low"),
  description: text("description").notNull(),
  actionsTaken: text("actions_taken").notNull().default(""),
  reportable: boolean("reportable").notNull().default(false),
  status: incidentStatus("status").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  // Reportable incidents: when the report was filed with the state, its reference and who filed it.
  stateFiledAt: timestamp("state_filed_at", { withTimezone: true }),
  stateReference: text("state_reference").notNull().default(""),
  stateFiledBy: uuid("state_filed_by").references(() => users.id, { onDelete: "set null" }),
  // The state's Reportable Event Form. Older incidents leave these empty.
  responsibleProvider: text("responsible_provider").notNull().default(""),
  reportingProvider: text("reporting_provider").notNull().default(""),
  personAlias: text("person_alias").notNull().default(""),
  waiverType: text("waiver_type").notNull().default(""),
  mco: text("mco").notNull().default(""),
  mcoNumber: text("mco_number").notNull().default(""),
  eventLocation: text("event_location").notNull().default(""),
  eventAddress: text("event_address").notNull().default(""),
  eventCity: text("event_city").notNull().default(""),
  eventState: text("event_state").notNull().default(""),
  eventZip: text("event_zip").notNull().default(""),
  eventRegion: text("event_region").notNull().default(""),
  // When the time of the event is unknown, when it was discovered instead.
  occurredUnknown: boolean("occurred_unknown").notNull().default(false),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }),
  witnessType: text("witness_type").$type<"" | "witnessed" | "discovered">().notNull().default(""),
  witnessedBy: text("witnessed_by").notNull().default(""),
  eventTypes: jsonb("event_types").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  otherEventText: text("other_event_text").notNull().default(""),
  injuredParties: jsonb("injured_parties").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  interventions: jsonb("interventions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  prnGivenBy: text("prn_given_by").notNull().default(""),
  injury: text("injury").$type<"" | "yes" | "no">().notNull().default(""),
  injuryDetails: text("injury_details").notNull().default(""),
  involvement: jsonb("involvement").$type<Record<string, "yes" | "no">>().notNull().default(sql`'{}'::jsonb`),
  notifications: jsonb("notifications").$type<{ party: string; at: string | null; name: string; comments: string }[]>().notNull().default(sql`'[]'::jsonb`),
  // The most urgent tier among the event types: tier1, tier2, reportable, or empty.
  tier: text("tier").$type<"" | "tier1" | "tier2" | "reportable">().notNull().default(""),
  createdAt: createdAt(),
});

export const tasks = pgTable("tasks", {
  id: id(),
  agencyId: agencyId(),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  assignedTo: uuid("assigned_to").references(() => staff.id, { onDelete: "set null" }),
  homeId: uuid("home_id").references(() => homes.id, { onDelete: "set null" }),
  individualId: uuid("individual_id").references(() => individuals.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  priority: taskPriority("priority").notNull().default("normal"),
  status: taskStatus("status").notNull().default("open"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  category: text("category").notNull().default(""),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  completedBy: uuid("completed_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  completionNote: text("completion_note").notNull().default(""),
  createdAt: createdAt(),
});

/* A running conversation on a task: updates, questions and answers. */
export const taskComments = pgTable(
  "task_comments",
  {
    id: id(),
    agencyId: agencyId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  table => [index("task_comments_task").on(table.taskId)],
);

export const enquiries = pgTable("enquiries", {
  id: id(),
  agencyId: agencyId(),
  kind: text("kind").notNull().default("contact"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  interest: text("interest").notNull().default(""),
  message: text("message").notNull().default(""),
  handled: boolean("handled").notNull().default(false),
  createdAt: createdAt(),
});

/*
 * Every email Mohuddle sent, or tried to: who to, what kind, and what the provider said. The body is
 * never kept, as it can carry a one-time link.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    agencyId: agencyId(),
    kind: text("kind").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    status: text("status").$type<"sent" | "queued" | "failed" | "skipped">().notNull(),
    provider: text("provider").notNull(),
    providerId: text("provider_id"),
    detail: text("detail").notNull().default(""),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [index("email_messages_when").on(table.createdAt), index("email_messages_to").on(table.toAddress, table.createdAt)],
);

/* Business rules live here, not in code. See src/server/settings.ts for the keys and defaults. */
export const settings = pgTable(
  "settings",
  {
    agencyId: agencyId(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [primaryKey({ name: "settings_pkey", columns: [table.agencyId, table.key] })],
);

export const auditLog = pgTable("audit_log", {
  id: id(),
  agencyId: agencyId(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull().default(""),
  at: createdAt(),
});

/*
 * Money spent for a home. Amounts are cents. Small amounts are approved on entry; larger ones wait
 * for a coordinator or the home manager, set by expense_approval_dollars. Nobody reviews their own.
 */
export const homeExpenses = pgTable(
  "home_expenses",
  {
    id: id(),
    agencyId: agencyId(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    spentOn: date("spent_on").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    vendor: text("vendor").notNull().default(""),
    description: text("description").notNull().default(""),
    paymentMethod: text("payment_method").notNull().default("company_card"),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    status: expenseStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: createdAt(),
  },
  table => [index("home_expenses_home_day").on(table.homeId, table.spentOn)],
);

/* Problems with a home itself: repairs, safety, supplies, the van. Not incidents involving a person. */
export const homeIssues = pgTable(
  "home_issues",
  {
    id: id(),
    agencyId: agencyId(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    details: text("details").notNull().default(""),
    category: text("category").notNull(),
    priority: issuePriority("priority").notNull().default("normal"),
    status: issueStatus("status").notNull().default("open"),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => staff.id, { onDelete: "set null" }),
    dueOn: date("due_on"),
    resolution: text("resolution").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("home_issues_home_status").on(table.homeId, table.status)],
);

/* Follow-up notes on an incident. The original account is never edited; anything learned later is added here. */
export const incidentNotes = pgTable(
  "incident_notes",
  {
    id: id(),
    agencyId: agencyId(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("note"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  table => [index("incident_notes_incident").on(table.incidentId, table.createdAt)],
);

/*
 * Photos taken for an incident, such as an injury or damage, usually from the phone app. The file is
 * in private storage (as documents are) and only reached through the Hub after a permission check.
 */
export const incidentPhotos = pgTable(
  "incident_photos",
  {
    id: id(),
    agencyId: agencyId(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    caption: text("caption").notNull().default(""),
    takenBy: uuid("taken_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [index("incident_photos_incident").on(table.incidentId, table.createdAt)],
);

/*
 * Doctor, dentist, therapy and other appointments for a person. Booking records who goes with them;
 * after the visit staff document what was said, any changes, and whether a follow-up is needed.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    agencyId: agencyId(),
    individualId: uuid("individual_id")
      .notNull()
      .references(() => individuals.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull().default(""),
    clinic: text("clinic").notNull().default(""),
    address: text("address").notNull().default(""),
    phone: text("phone").notNull().default(""),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    reason: text("reason").notNull().default(""),
    prep: text("prep").notNull().default(""),
    transport: text("transport").notNull().default(""),
    escortStaffId: uuid("escort_staff_id").references(() => staff.id, { onDelete: "set null" }),
    status: appointmentStatus("status").notNull().default("scheduled"),
    statusReason: text("status_reason").notNull().default(""),
    // Filled in after the visit.
    seenBy: text("seen_by").notNull().default(""),
    summary: text("summary").notNull().default(""),
    diagnosisChanges: text("diagnosis_changes").notNull().default(""),
    medicationChanges: text("medication_changes").notNull().default(""),
    orders: text("orders").notNull().default(""),
    followUpNeeded: boolean("follow_up_needed").notNull().default(false),
    followUpBy: date("follow_up_by"),
    followUpNotes: text("follow_up_notes").notNull().default(""),
    followUpOf: uuid("follow_up_of").references((): AnyPgColumn => appointments.id, { onDelete: "set null" }),
    nextAppointmentId: uuid("next_appointment_id").references((): AnyPgColumn => appointments.id, { onDelete: "set null" }),
    documentedBy: uuid("documented_by").references(() => users.id, { onDelete: "set null" }),
    documentedAt: timestamp("documented_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [index("appointments_person").on(table.individualId), index("appointments_when").on(table.scheduledAt)],
);

/*
 * In-app notifications. Each is for one login. dedupeKey stops the same reminder being sent twice,
 * so the reminder sweep can run as often as it likes.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    agencyId: agencyId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href").notNull().default(""),
    tone: text("tone").$type<"info" | "warn" | "bad" | "good">().notNull().default("info"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  table => [uniqueIndex("notifications_once").on(table.userId, table.dedupeKey), index("notifications_user_unread").on(table.userId, table.readAt)],
);

/*
 * The kinds of document the agency keeps: for staff (I-9, CPR card), for people supported (ISP,
 * insurance card) and for the business (licences, insurance). Admins add and change these.
 */
export const documentTypes = pgTable("document_types", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  category: text("category").$type<"staff" | "person" | "business">().notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  // Staff: every staff member in these roles must have one (no roles means everyone). People: everyone. Business: the agency.
  required: boolean("required").notNull().default(false),
  roles: jsonb("roles").$type<string[]>().notNull().default(emptyList()),
  // Business documents can belong to the agency or to each home (a fire inspection, say).
  perHome: boolean("per_home").notNull().default(false),
  expires: boolean("expires").notNull().default(false),
  validityMonths: integer("validity_months"),
  reminderDays: integer("reminder_days").notNull().default(30),
  needsApproval: boolean("needs_approval").notNull().default(true),
  // When an approved staff document has dates, the matching staff credential is updated too.
  credentialType: text("credential_type").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/* A stored file and what it is. Replaced versions stay, marked superseded, so the history is kept. */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    agencyId: agencyId(),
    typeId: uuid("type_id").references(() => documentTypes.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    ownerKind: text("owner_kind").$type<"staff" | "person" | "business">().notNull(),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
    individualId: uuid("individual_id").references(() => individuals.id, { onDelete: "cascade" }),
    homeId: uuid("home_id").references(() => homes.id, { onDelete: "cascade" }),
    status: text("status").$type<"submitted" | "approved" | "rejected" | "superseded" | "archived">().notNull().default("submitted"),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    issuedOn: date("issued_on"),
    expiresOn: date("expires_on"),
    notes: text("notes").notNull().default(""),
    reviewNote: text("review_note").notNull().default(""),
    source: text("source").$type<"upload" | "request_link" | "staff_portal">().notNull().default("upload"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedByName: text("uploaded_by_name").notNull().default(""),
    requestItemId: uuid("request_item_id"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [
    index("documents_staff").on(table.staffId),
    index("documents_person").on(table.individualId),
    index("documents_type").on(table.typeId),
    index("documents_expiry").on(table.expiresOn),
  ],
);

/*
 * A request for documents, sent as a private link (which expires) and to the staff member's Hub.
 * Only a hash of the link's token is stored. Whoever has the link can upload; nobody can view.
 */
export const documentRequests = pgTable("document_requests", {
  id: id(),
  agencyId: agencyId(),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
  // A request about a person we support goes to someone outside, such as a guardian signing consent.
  individualId: uuid("individual_id").references(() => individuals.id, { onDelete: "cascade" }),
  recipientName: text("recipient_name").notNull().default(""),
  recipientRelation: text("recipient_relation").notNull().default(""),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  dueOn: date("due_on"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const documentRequestItems = pgTable(
  "document_request_items",
  {
    id: id(),
    agencyId: agencyId(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => documentRequests.id, { onDelete: "cascade" }),
    typeId: uuid("type_id").references(() => documentTypes.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    // Upload a file, or read and sign a template.
    kind: text("kind").$type<"upload" | "sign">().notNull().default("upload"),
    templateId: uuid("template_id").references((): AnyPgColumn => signTemplates.id, { onDelete: "set null" }),
    status: text("status").$type<"pending" | "submitted" | "approved" | "rejected">().notNull().default("pending"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    reviewNote: text("review_note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  table => [index("document_request_items_request").on(table.requestId)],
);

/*
 * Documents to be read and signed: written in the Hub (sections, each initialled) or an uploaded PDF
 * (each page initialled). The signed copy is filed under the chosen document type.
 */
export const signTemplates = pgTable("sign_templates", {
  id: id(),
  agencyId: agencyId(),
  title: text("title").notNull(),
  category: text("category").$type<"staff" | "person" | "business">().notNull().default("staff"),
  typeId: uuid("type_id").references(() => documentTypes.id, { onDelete: "set null" }),
  body: text("body").notNull().default(""),
  sourceKey: text("source_key"),
  sourceName: text("source_name").notNull().default(""),
  sourcePages: integer("source_pages"),
  initialEach: boolean("initial_each").notNull().default(true),
  // On an uploaded PDF: where to initial, sign, date and print the name (see src/lib/sign-fields.ts).
  // When there are none, every page is initialled and a signature page is added.
  fields: jsonb("fields").$type<{ id: string; kind: "signature" | "initials" | "date" | "name"; page: number; x: number; y: number; w: number; h: number }[]>().notNull().default(emptyList()),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/* The evidence for one signature: who, how, when, from where, and a fingerprint of what they signed. */
export const signatures = pgTable("signatures", {
  id: id(),
  agencyId: agencyId(),
  templateId: uuid("template_id").references(() => signTemplates.id, { onDelete: "set null" }),
  templateVersion: integer("template_version").notNull().default(1),
  requestItemId: uuid("request_item_id").references(() => documentRequestItems.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  individualId: uuid("individual_id").references(() => individuals.id, { onDelete: "set null" }),
  signerName: text("signer_name").notNull(),
  signerRelation: text("signer_relation").notNull().default(""),
  method: text("method").$type<"drawn" | "typed">().notNull(),
  typedName: text("typed_name").notNull().default(""),
  typedInitials: text("typed_initials").notNull().default(""),
  initialsCount: integer("initials_count").notNull().default(0),
  contentHash: text("content_hash").notNull(),
  signedHash: text("signed_hash").notNull().default(""),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
});

/* The people around someone we support: coordinators, clinicians, guardians, pharmacy and so on. */
export const personContacts = pgTable(
  "person_contacts",
  {
    id: id(),
    agencyId: agencyId(),
    individualId: uuid("individual_id")
      .notNull()
      .references(() => individuals.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    name: text("name").notNull(),
    organization: text("organization").notNull().default(""),
    phone: text("phone").notNull().default(""),
    altPhone: text("alt_phone").notNull().default(""),
    email: text("email").notNull().default(""),
    fax: text("fax").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  table => [index("person_contacts_person").on(table.individualId)],
);

/* Insurance cover for a person: Medicaid or TennCare, Medicare, private and so on, in order of billing. */
export const personInsurance = pgTable(
  "person_insurance",
  {
    id: id(),
    agencyId: agencyId(),
    individualId: uuid("individual_id")
      .notNull()
      .references(() => individuals.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    rank: text("rank").$type<"primary" | "secondary" | "tertiary">().notNull().default("primary"),
    payer: text("payer").notNull().default(""),
    plan: text("plan").notNull().default(""),
    memberId: text("member_id").notNull().default(""),
    groupNumber: text("group_number").notNull().default(""),
    policyHolder: text("policy_holder").notNull().default(""),
    phone: text("phone").notNull().default(""),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  table => [index("person_insurance_person").on(table.individualId)],
);


/* ---------- Time clock ---------- */

export type LocationState = "ok" | "outside" | "unavailable" | "home_not_set" | "not_checked";

/*
 * One stretch of work: clock in to clock out. The times staff punched are kept as they were; a manager
 * correction changes the row but the before and after are kept in time_entry_changes.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    agencyId: agencyId(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    homeId: uuid("home_id").references(() => homes.id, { onDelete: "set null" }),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    // Who ended it: the staff member, or a manager closing a forgotten clock-out.
    closedBy: text("closed_by").$type<"staff" | "manager">(),
    inLatitude: real("in_latitude"),
    inLongitude: real("in_longitude"),
    inAccuracy: integer("in_accuracy"),
    inDistance: integer("in_distance"),
    inLocation: text("in_location").$type<LocationState>().notNull().default("not_checked"),
    outLatitude: real("out_latitude"),
    outLongitude: real("out_longitude"),
    outAccuracy: integer("out_accuracy"),
    outDistance: integer("out_distance"),
    outLocation: text("out_location").$type<LocationState>().notNull().default("not_checked"),
    // Why they clocked in without a shift, away from the home, or without a location.
    inNote: text("in_note").notNull().default(""),
    unscheduled: boolean("unscheduled").notNull().default(false),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overstayReason: text("overstay_reason").notNull().default(""),
    // The statements ticked at clock in, as worded then.
    statements: jsonb("statements").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    attestedName: text("attested_name").notNull().default(""),
    // What was still undone at clock out, such as notes or doses, as they read then.
    warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Reasons a manager should look: away from the home, unscheduled, late, forgot to clock out, edited.
    flags: jsonb("flags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    reviewedBy: uuid("reviewed_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    userAgent: text("user_agent").notNull().default(""),
    ip: text("ip").notNull().default(""),
    createdAt: createdAt(),
  },
  table => [index("time_entries_staff").on(table.staffId, table.clockInAt), index("time_entries_home").on(table.homeId, table.clockInAt), index("time_entries_shift").on(table.shiftId)],
);

/* Breaks within a stretch of work. Meal breaks are unpaid; rest breaks are paid. */
export const timeBreaks = pgTable(
  "time_breaks",
  {
    id: id(),
    agencyId: agencyId(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"meal" | "rest">().notNull().default("meal"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
  },
  table => [index("time_breaks_entry").on(table.entryId)],
);

/* What the outgoing staff member hands over at clock out: a note, a line per person, and the ticks. */
export const handovers = pgTable(
  "handovers",
  {
    id: id(),
    agencyId: agencyId(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").references(() => timeEntries.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    people: jsonb("people").$type<{ individualId: string; name: string; note: string }[]>().notNull().default(sql`'[]'::jsonb`),
    checks: jsonb("checks").$type<{ label: string; done: boolean; comment: string }[]>().notNull().default(sql`'[]'::jsonb`),
    incident: text("incident").$type<"none" | "reported" | "not_reported">().notNull().default("none"),
    createdAt: createdAt(),
  },
  table => [index("handovers_home").on(table.homeId, table.createdAt)],
);

/* Who read a handover, and when: the incoming staff acknowledge it before they clock in. */
export const handoverReads = pgTable(
  "handover_reads",
  {
    id: id(),
    agencyId: agencyId(),
    handoverId: uuid("handover_id")
      .notNull()
      .references(() => handovers.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").references(() => timeEntries.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    // What the person taking over said when they acknowledged it, such as "fridge not cleaned". Empty when all was as handed over.
    remark: text("remark").notNull().default(""),
  },
  table => [uniqueIndex("handover_read_once").on(table.handoverId, table.staffId)],
);

/* Every manager change to a time entry, with the values before and after and the reason. */
export const timeEntryChanges = pgTable(
  "time_entry_changes",
  {
    id: id(),
    agencyId: agencyId(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    before: jsonb("before").$type<Record<string, string | null>>().notNull().default(sql`'{}'::jsonb`),
    after: jsonb("after").$type<Record<string, string | null>>().notNull().default(sql`'{}'::jsonb`),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  table => [index("time_entry_changes_entry").on(table.entryId)],
);

/* A staff member asking for a fix: a missed punch, a wrong time, or a whole shift not clocked. */
export const timeCorrections = pgTable(
  "time_corrections",
  {
    id: id(),
    agencyId: agencyId(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").references(() => timeEntries.id, { onDelete: "set null" }),
    homeId: uuid("home_id").references(() => homes.id, { onDelete: "set null" }),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<"pending" | "approved" | "declined">().notNull().default("pending"),
    decidedBy: uuid("decided_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    createdAt: createdAt(),
  },
  table => [index("time_corrections_staff").on(table.staffId), index("time_corrections_status").on(table.status)],
);

/* ---------- Pay periods and timesheets ---------- */

/* A pay period once someone has looked at it. Locked periods cannot change; fixes go in as adjustments. */
export const payPeriods = pgTable(
  "pay_periods",
  {
    id: id(),
    agencyId: agencyId(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").$type<"open" | "locked">().notNull().default("open"),
    lockedBy: uuid("locked_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  table => [uniqueIndex("pay_period_start").on(table.agencyId, table.startDate)],
);

export type SheetSnapshot = { regular: number; overtime: number; total: number; holiday: number; adjustments: number; punches: number };

/* One person's hours for one pay period: they sign it, a manager approves it, then the period is locked. */
export const timesheets = pgTable(
  "timesheets",
  {
    id: id(),
    agencyId: agencyId(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    status: text("status").$type<"open" | "signed" | "approved">().notNull().default("open"),
    signedName: text("signed_name").notNull().default(""),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Set when a manager sends it back to be checked again.
    returnNote: text("return_note").notNull().default(""),
    approvalNote: text("approval_note").notNull().default(""),
    // The totals as they stood when signed and when approved, in minutes.
    signedTotals: jsonb("signed_totals").$type<SheetSnapshot | null>(),
    approvedTotals: jsonb("approved_totals").$type<SheetSnapshot | null>(),
    createdAt: createdAt(),
  },
  table => [uniqueIndex("timesheet_once").on(table.periodId, table.staffId), index("timesheets_staff").on(table.staffId)],
);

/* Extra or fewer minutes on a timesheet, such as a fix for a locked period, with the reason. */
export const timeAdjustments = pgTable(
  "time_adjustments",
  {
    id: id(),
    agencyId: agencyId(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    minutes: integer("minutes").notNull(),
    overtime: boolean("overtime").notNull().default(false),
    relatesTo: date("relates_to"),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [index("time_adjustments_sheet").on(table.periodId, table.staffId)],
);

/* ---------- Pay rates, differentials and time off ---------- */

/* A staff member's hourly rate from a date. Old rates stay, so past periods are worked out at the rate then. */
export const payRates = pgTable(
  "pay_rates",
  {
    id: id(),
    agencyId: agencyId(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    centsPerHour: integer("cents_per_hour").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [index("pay_rates_staff").on(table.staffId, table.effectiveFrom)],
);

/* Extra pay per hour: certain hours (nights), certain days (weekends), or at a certain home. */
export const payDifferentials = pgTable("pay_differentials", {
  id: id(),
  agencyId: agencyId(),
  name: text("name").notNull(),
  kind: text("kind").$type<"hours" | "days" | "home">().notNull(),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  days: jsonb("days").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  homeId: uuid("home_id").references(() => homes.id, { onDelete: "cascade" }),
  centsPerHour: integer("cents_per_hour").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/* A request for time off. Paid time off counts on the timesheet; some types draw from the leave balance. */
export const timeOffRequests = pgTable(
  "time_off_requests",
  {
    id: id(),
    agencyId: agencyId(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    paid: boolean("paid").notNull(),
    usesBalance: boolean("uses_balance").notNull().default(false),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    minutes: integer("minutes").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").$type<"pending" | "approved" | "declined" | "cancelled">().notNull().default("pending"),
    decidedBy: uuid("decided_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    openedShifts: integer("opened_shifts").notNull().default(0),
    createdAt: createdAt(),
  },
  table => [index("time_off_staff").on(table.staffId, table.startDate), index("time_off_status").on(table.status)],
);

/* Every change to a staff member's leave balance: earned, used, or set by hand. The balance is the sum. */
export const leaveLedger = pgTable(
  "leave_ledger",
  {
    id: id(),
    agencyId: agencyId(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"accrual" | "used" | "adjustment">().notNull(),
    minutes: integer("minutes").notNull(),
    onDate: date("on_date").notNull(),
    note: text("note").notNull().default(""),
    requestId: uuid("request_id").references(() => timeOffRequests.id, { onDelete: "cascade" }),
    periodId: uuid("period_id").references(() => payPeriods.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  table => [index("leave_ledger_staff").on(table.staffId)],
);
