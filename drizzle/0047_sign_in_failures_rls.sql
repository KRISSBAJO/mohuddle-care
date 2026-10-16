-- Mohuddle's own table: row rules on with no policy, so the agency-scoped role can never read it.
ALTER TABLE "sign_in_failures" ENABLE ROW LEVEL SECURITY;
