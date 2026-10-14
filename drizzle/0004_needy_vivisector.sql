CREATE TYPE "public"."expense_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."issue_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TABLE "home_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT 'company_card' NOT NULL,
	"submitted_by" uuid,
	"status" "expense_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"title" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"priority" "issue_priority" DEFAULT 'normal' NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"reported_by" uuid,
	"assigned_to" uuid,
	"due_on" date,
	"resolution" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "manager_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "monthly_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "home_expenses" ADD CONSTRAINT "home_expenses_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_expenses" ADD CONSTRAINT "home_expenses_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_expenses" ADD CONSTRAINT "home_expenses_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_issues" ADD CONSTRAINT "home_issues_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_issues" ADD CONSTRAINT "home_issues_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_issues" ADD CONSTRAINT "home_issues_assigned_to_staff_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_expenses_home_day" ON "home_expenses" USING btree ("home_id","spent_on");--> statement-breakpoint
CREATE INDEX "home_issues_home_status" ON "home_issues" USING btree ("home_id","status");--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_manager_staff_id_staff_id_fk" FOREIGN KEY ("manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;