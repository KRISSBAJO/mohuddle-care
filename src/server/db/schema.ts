import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const emptyList = () => sql`'[]'::jsonb`;

export const homes = pgTable("homes", {
  id: id(),
  name: text("name").notNull(),
  type: homeType("type").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default("Nashville"),
  capacity: integer("capacity").notNull().default(4),
  phone: text("phone").notNull().default(""),
  active: boolean("active").notNull().default(true),
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
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

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
