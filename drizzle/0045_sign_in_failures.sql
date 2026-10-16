CREATE TABLE "sign_in_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_failures_email" ON "sign_in_failures" USING btree ("email","at");--> statement-breakpoint
CREATE INDEX "sign_in_failures_ip" ON "sign_in_failures" USING btree ("ip","at");--> statement-breakpoint
-- Only the server's own connection reads and writes this; the agency-scoped role never needs it.
REVOKE ALL ON "sign_in_failures" FROM mohuddle_app;
