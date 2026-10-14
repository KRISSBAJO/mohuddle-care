ALTER TABLE "homes" ADD COLUMN "staffed_kinds" jsonb DEFAULT '["day","evening","overnight"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "open_days" jsonb DEFAULT '[1,2,3,4,5,6,7]'::jsonb NOT NULL;--> statement-breakpoint
-- Sensible starting points by home type. Coordinators change them on each home's page.
UPDATE "homes" SET "staffed_kinds" = '["day"]'::jsonb, "open_days" = '[1,2,3,4,5]'::jsonb WHERE "type" = 'day_program';--> statement-breakpoint
UPDATE "homes" SET "staffed_kinds" = '[]'::jsonb WHERE "type" IN ('family_model', 'supported_living');
