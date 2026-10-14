CREATE TABLE "weight_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"individual_id" uuid NOT NULL,
	"recorded_on" date NOT NULL,
	"pounds" real NOT NULL,
	"height_inches" real,
	"bmi" real,
	"comments" text DEFAULT '' NOT NULL,
	"staff_id" uuid,
	"signed_name" text DEFAULT '' NOT NULL,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "height_inches" real;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "weight_low" real;--> statement-breakpoint
ALTER TABLE "individuals" ADD COLUMN "weight_high" real;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_individual_id_individuals_id_fk" FOREIGN KEY ("individual_id") REFERENCES "public"."individuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weight_records_person" ON "weight_records" USING btree ("individual_id","recorded_on");