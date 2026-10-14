CREATE TABLE "handover_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"entry_id" uuid,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"entry_id" uuid,
	"staff_id" uuid,
	"note" text NOT NULL,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incident" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" text DEFAULT 'meal' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"entry_id" uuid,
	"home_id" uuid,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"home_id" uuid,
	"shift_id" uuid,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"closed_by" text,
	"in_latitude" real,
	"in_longitude" real,
	"in_accuracy" integer,
	"in_distance" integer,
	"in_location" text DEFAULT 'not_checked' NOT NULL,
	"out_latitude" real,
	"out_longitude" real,
	"out_accuracy" integer,
	"out_distance" integer,
	"out_location" text DEFAULT 'not_checked' NOT NULL,
	"in_note" text DEFAULT '' NOT NULL,
	"unscheduled" boolean DEFAULT false NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"overstay_reason" text DEFAULT '' NOT NULL,
	"statements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attested_name" text DEFAULT '' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"user_agent" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "latitude" real;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "longitude" real;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "handover_checks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "handover_reads" ADD CONSTRAINT "handover_reads_handover_id_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reads" ADD CONSTRAINT "handover_reads_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_reads" ADD CONSTRAINT "handover_reads_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_breaks" ADD CONSTRAINT "time_breaks_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_corrections" ADD CONSTRAINT "time_corrections_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_changes" ADD CONSTRAINT "time_entry_changes_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_changes" ADD CONSTRAINT "time_entry_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "handover_read_once" ON "handover_reads" USING btree ("handover_id","staff_id");--> statement-breakpoint
CREATE INDEX "handovers_home" ON "handovers" USING btree ("home_id","created_at");--> statement-breakpoint
CREATE INDEX "time_breaks_entry" ON "time_breaks" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "time_corrections_staff" ON "time_corrections" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "time_corrections_status" ON "time_corrections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "time_entries_staff" ON "time_entries" USING btree ("staff_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "time_entries_home" ON "time_entries" USING btree ("home_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "time_entries_shift" ON "time_entries" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "time_entry_changes_entry" ON "time_entry_changes" USING btree ("entry_id");