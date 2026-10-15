# Multi-agency (tenancy)

Mohuddle serves many agencies from one database. Milestone is agency #1.

## How it works

- **`agencies`** holds each agency: its web address name (`slug`), name, legal name and contact details.
- **`logins`** holds one email and password per person, whichever agencies they work for.
- **`users`** is someone's place in one agency: their role there and their staff record. One login can have a row in several agencies.
- **Every other table has `agency_id`.** It fills itself in from the connection's agency, so inserts never pass it.
- **Postgres row rules** (migration `0029_agencies`) limit the app's role, `mohuddle_app`, to rows of the agency set on its connection (`app.agency_id`). With no agency set, nothing is visible and nothing can be written.

`src/server/db/index.ts` hands out connections already switched to `mohuddle_app` and the current agency:

- **Signed-in requests:** the agency comes from the session.
- **`asAgency(id, fn)`:** runs code as one agency. Timed jobs, private links and sign-in use it.
- **`systemDb` / `systemPool`:** the database owner, which row rules do not limit. Use them only before an agency is known (sign-in, setup links, private-link lookups) and for jobs that visit each agency in turn (`forEachAgency`).

## Rules for new code

1. **A new table gets `agencyId: agencyId()`.** Migration 0029 only set up the tables that existed then, so a new table also needs these lines in its migration:
   ```sql
   ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY agency_isolation ON "x" TO mohuddle_app
     USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
     WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
   CREATE INDEX "x_agency" ON "x" (agency_id);
   ```
   `tests/tenancy.integration.test.ts` fails if a table is missing any of this.
2. **Uniqueness is per agency.** Write `uniqueIndex(...).on(table.agencyId, table.thing)`, and give upserts the same target.
3. **Code without a session must say which agency it runs as.** This covers jobs, webhooks and public forms: wrap them in `asAgency` or `forEachAgency`. If you forget, nothing breaks loudly: reads come back empty.
4. **Use `systemDb` sparingly,** and never for ordinary reads. It sees every agency.
5. **Don't hard-code agency facts in app screens.** Read them with `currentAgency()`. `src/lib/site.ts` is only for Milestone's public website.
6. **New files go under `agencyKey(...)`** (`agencies/<id>/...`) in storage.
7. **Scripts use `scripts/agency-db.ts`.** It runs as one agency (`AGENCY=slug`, default `milestone`).

## Not done yet

- **Agency switcher.** Sign-in currently opens the agency whose address you are on, or else the one you used last.
- **Owner console.** Creating agencies, setting up their defaults, and a separate inbox for Mohuddle demo requests (today these still land in Milestone's enquiries).
- **Web addresses per agency** (`slug.mohuddle.com`) and hosting.
- **Per-agency time zones.** Times are still Central everywhere.
- **Hardening:** foreign keys that also match on `agency_id`, so a row can never point at another agency's row even by a guessed id.
