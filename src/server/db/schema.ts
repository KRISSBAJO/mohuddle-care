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
  kind: shiftKind("kind").notNull(),
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
  signedName: text("signed_name").notNull().default(""),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

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
  createdAt: createdAt(),
});

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
