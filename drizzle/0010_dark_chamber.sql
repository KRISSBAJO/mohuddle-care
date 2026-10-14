CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'completed', 'cancelled', 'missed');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"individual_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"clinic" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"prep" text DEFAULT '' NOT NULL,
	"transport" text DEFAULT '' NOT NULL,
	"escort_staff_id" uuid,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"status_reason" text DEFAULT '' NOT NULL,
	"seen_by" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"diagnosis_changes" text DEFAULT '' NOT NULL,
	"medication_changes" text DEFAULT '' NOT NULL,
	"orders" text DEFAULT '' NOT NULL,
	"follow_up_needed" boolean DEFAULT false NOT NULL,
	"follow_up_by" date,
	"follow_up_notes" text DEFAULT '' NOT NULL,
	"follow_up_of" uuid,
	"next_appointment_id" uuid,
	"documented_by" uuid,
	"documented_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'info' NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_escort_staff_id_staff_id_fk" FOREIGN KEY ("escort_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_follow_up_of_appointments_id_fk" FOREIGN KEY ("follow_up_of") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_next_appointment_id_appointments_id_fk" FOREIGN KEY ("next_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_documented_by_users_id_fk" FOREIGN KEY ("documented_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_person" ON "appointments" USING btree ("individual_id");--> statement-breakpoint
CREATE INDEX "appointments_when" ON "appointments" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_once" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_unread" ON "notifications" USING btree ("user_id","read_at");