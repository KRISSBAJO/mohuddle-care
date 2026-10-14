CREATE TABLE "shift_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"weekdays" jsonb DEFAULT '[1,2,3,4,5,6,7]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "shift_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "staffed_patterns" jsonb;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "pattern_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_pattern_id_shift_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."shift_patterns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Default patterns: weekdays in three 8-hour shifts, weekends in two 12-hour shifts. Admins change these in Settings.
INSERT INTO "shift_patterns" ("name", "start_time", "end_time", "weekdays", "sort_order") VALUES
  ('Weekday day', '07:00', '15:00', '[1,2,3,4,5]', 1),
  ('Weekday evening', '15:00', '23:00', '[1,2,3,4,5]', 2),
  ('Weekday overnight', '23:00', '07:00', '[1,2,3,4,5]', 3),
  ('Weekend day', '07:00', '19:00', '[6,7]', 4),
  ('Weekend night', '19:00', '07:00', '[6,7]', 5);--> statement-breakpoint
-- Existing shifts whose times and weekday match a pattern take that pattern.
UPDATE "shifts" s SET "pattern_id" = p."id" FROM "shift_patterns" p
WHERE to_char(s."starts_at" AT TIME ZONE 'America/Chicago', 'HH24:MI') = p."start_time"
  AND to_char(s."ends_at" AT TIME ZONE 'America/Chicago', 'HH24:MI') = p."end_time"
  AND p."weekdays" @> to_jsonb(extract(isodow from s."starts_at" AT TIME ZONE 'America/Chicago')::int);--> statement-breakpoint
-- Homes staffed around the clock keep every pattern. Others keep the patterns that start in the parts of the day they had.
UPDATE "homes" SET "staffed_patterns" = CASE
  WHEN "staffed_kinds" @> '["day","evening","overnight"]'::jsonb THEN NULL
  ELSE (SELECT coalesce(jsonb_agg(p."id"), '[]'::jsonb) FROM "shift_patterns" p WHERE
    ("staffed_kinds" ? 'day' AND p."start_time" >= '05:00' AND p."start_time" < '14:00')
    OR ("staffed_kinds" ? 'evening' AND p."start_time" >= '14:00' AND p."start_time" < '21:00')
    OR ("staffed_kinds" ? 'overnight' AND (p."start_time" >= '21:00' OR p."start_time" < '05:00')))
END;
