import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

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

export const homes = pgTable("homes", {
  id: id(),
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
  createdAt: createdAt(),
});

export const staff = pgTable("staff", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: staffRole("role").notNull().default("dsp"),
  email: text("email").notNull().unique(),
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
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("dsp"),
  // Null until the person opens their setup link and chooses a password.
  passwordHash: text("password_hash"),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/* One-time links for first sign-in and password resets. Only a hash of the token is stored. */
export const loginTokens = pgTable("login_tokens", {
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
  active: boolean("active").notNull().default(true),
  // Set when support ends. The record and its history stay; active is false while discharged.
  dischargedAt: date("discharged_at"),
  dischargeReason: text("discharge_reason").notNull().default(""),
  createdAt: createdAt(),
});

export const planGoals = pgTable("plan_goals", {
  id: id(),
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
  extra: jsonb("extra").$type<{ id: string; label: string; value: string | string[]; unit: string; scope: "all" | "home" | "person" }[]>().notNull().default(emptyList()),
  // Optional sections that were switched on for this person when the note was written.
  sections: jsonb("sections").$type<string[]>().notNull().default(emptyList()),
  signedName: text("signed_name").notNull().default(""),
  signedAt: timestamp("signed_at", { withTimezone: true }),
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
    createdAt: createdAt(),
  },
  table => [index("note_requirements_home").on(table.homeId), index("note_requirements_person").on(table.individualId)],
);

/* Data on each plan goal for one shift: offered or not, how much help, and how it went. */
export const dailyLogGoals = pgTable(
  "daily_log_goals",
  {
    id: id(),
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
  individualId: uuid("individual_id")
    .notNull()
    .references(() => individuals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dose: text("dose").notNull(),
  route: text("route").notNull().default("oral"),
  times: jsonb("times").$type<string[]>().notNull().default(emptyList()),
  prescriber: text("prescriber").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
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
  },
  table => [uniqueIndex("med_admin_once").on(table.medicationId, table.scheduledFor)],
);

export const incidents = pgTable("incidents", {
  id: id(),
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
  createdAt: createdAt(),
});

export const tasks = pgTable("tasks", {
  id: id(),
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
  kind: text("kind").notNull().default("contact"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  interest: text("interest").notNull().default(""),
  message: text("message").notNull().default(""),
  handled: boolean("handled").notNull().default(false),
  createdAt: createdAt(),
});

/* Business rules live here, not in code. See src/server/settings.ts for the keys and defaults. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
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
 * Doctor, dentist, therapy and other appointments for a person. Booking records who goes with them;
 * after the visit staff document what was said, any changes, and whether a follow-up is needed.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
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
  title: text("title").notNull(),
  category: text("category").$type<"staff" | "person" | "business">().notNull().default("staff"),
  typeId: uuid("type_id").references(() => documentTypes.id, { onDelete: "set null" }),
  body: text("body").notNull().default(""),
  sourceKey: text("source_key"),
  sourceName: text("source_name").notNull().default(""),
  sourcePages: integer("source_pages"),
  initialEach: boolean("initial_each").notNull().default(true),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/* The evidence for one signature: who, how, when, from where, and a fingerprint of what they signed. */
export const signatures = pgTable("signatures", {
  id: id(),
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
