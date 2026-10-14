CREATE TABLE "community_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"individual_id" uuid NOT NULL,
	"staff_id" uuid,
	"note_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"minutes" integer NOT NULL,
	"trips" integer,
	"cost_center" text DEFAULT '' NOT NULL,
	"other_party" text DEFAULT '' NOT NULL,
	"selection" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"activity" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"learning" text DEFAULT '' NOT NULL,
	"with_staff_id" uuid,
	"signed_name" text DEFAULT '' NOT NULL,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_notes" ADD CONSTRAINT "community_notes_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notes" ADD CONSTRAINT "community_notes_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notes" ADD CONSTRAINT "community_notes_with_staff_id_staff_id_fk" FOREIGN KEY ("with_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_notes_person" ON "community_notes" USING btree ("individual_id","note_date");