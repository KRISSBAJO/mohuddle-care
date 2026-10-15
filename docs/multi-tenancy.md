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

1. **A new table gets `agencyId: agencyId()`,** and its migration ends with:
   ```sql
   SELECT mohuddle_tenant_guards();
   ```
   That turns on the table's row rule and index. It also makes every link to or from another agency table check that both rows belong to the same agency, so a record can never point at another agency's record, even by a known id. `tests/tenancy.integration.test.ts` fails if a table or link was missed.
2. **Uniqueness is per agency.** Write `uniqueIndex(...).on(table.agencyId, table.thing)`, and give upserts the same target.
3. **Code without a session must say which agency it runs as.** This covers jobs, webhooks and public forms: wrap them in `asAgency` or `forEachAgency`. If you forget, nothing breaks loudly: reads come back empty.
4. **Use `systemDb` sparingly,** and never for ordinary reads. It sees every agency.
5. **Don't hard-code agency facts in app screens.** Read them with `currentAgency()`. `src/lib/site.ts` is only for Milestone's public website.
6. **New files go under `agencyKey(...)`** (`agencies/<id>/...`) in storage.
7. **Dates use the agency's time zone.** Use the helpers in `src/lib/format.ts` (`dateKey`, `zonedTime`, `fmt`), or `zone()` for anything else. Never write a zone name in code. On the server, `zone()` follows `asAgency`, or else the signed `ms_zone` cookie set at sign-in (`src/server/zone.ts`). In the browser it follows `ZoneSync` in the layout. A browser component on a page reached without signing in (a private link) takes the zone as a prop instead.
8. **Scripts use `scripts/agency-db.ts`.** It runs as one agency (`AGENCY=slug`, default `milestone`).

## Switching agency and the owner console

- **Switcher.** Someone who works for more than one agency switches from the menu under their name, top right. A switch ends the session and starts one in the other agency. The mobile app uses `GET` and `POST /api/me/agencies` for the same thing.
- **Owner console (`/owner`).** Only logins flagged as owners can open it. The flag is set with `pnpm tsx scripts/make-owner.ts email` (add `--remove` to take it away); the app itself can never grant it. An owner still signs in through one of their agencies. The console:
  - creates agencies with the defaults in `src/lib/agency-defaults.ts`, the signing templates and the daily-note sections;
  - adds administrators and issues new setup links;
  - edits an agency's profile;
  - turns an agency off, which signs everyone there out and stops its reminders;
  - holds the demo requests from the Mohuddle page (`product_enquiries`, which no agency can see).

## Agency addresses

With `AGENCY_ADDRESSES=on`, each agency is used at its own address, built from `APP_URL`:

- **On this machine:** `milestone.localhost:3400`. Browsers treat any name ending in `.localhost` as this computer, so it needs no setup.
- **When live:** `milestone.mohuddle.com`.

How it works:

- **An agency's address** opens its app. Its sign-in page names the agency, and only that agency's logins can sign in there.
- **The shared sign-in page,** `app.<host>`, signs someone in and sends them to the agency they used last.
- **The agency switcher** sends them to the other agency's address.

The browser keeps a separate session for each address, so a sign-in moves between addresses with a one-time pass. The pass lives in `session_handoffs`, works once and expires after two minutes, at `/auth/handoff`. A session for one agency is ignored on another agency's address. Setup links and private document links use the agency's address. The main address (`localhost:3400`, later `mohuddle.com`) works as before. With the setting off, everything stays at `APP_URL`.

Going live needs DNS for `*.mohuddle.com`, a certificate that covers it, and `APP_URL=https://mohuddle.com`.

## Email

Mohuddle sends through RelyKit (`src/server/email.ts`). Nothing leaves the server unless `EMAIL_PROVIDER=relykit` and `RELYKIT_API_KEY` are set. Otherwise each email is only written to the log.

- **Sender and replies:** emails go out as "Agency via Mohuddle" from `EMAIL_FROM`, which must be on a domain verified in RelyKit. Replies go to the agency's office email.
- **Never sent:** test addresses (`.test`, `.example`, `example.com` and similar) are never handed to RelyKit.
- **Record:** every email is recorded in `email_messages`, by kind and status. The body is never stored, because it can carry a one-time link.
- **What is emailed:**
  - setup and password links for new logins
  - links for agency administrators added in the owner console
  - staff document requests

  Each agency switches these on or off in Settings ("Email links to people"). The link is always shown on screen too.
- **"Forgot your password?"** emails a link and always gives the same answer, so it never reveals which emails have a login. It sends at most 3 emails to one address an hour.

## Owner console: health, activity and support visits

- **`/owner/health`:** reminders, email, push, the note scribe, the database, the server, and recent errors. The history is kept in memory since the server last started.
- **`/owner/activity`:** every console action, kept in `owner_events`, which no agency can see.
- **Support visits.** From an agency's page, with a reason, an owner opens the agency as an administrator for an hour. The agency's administrators are notified with who, why and until when, and the visit goes in both the owner activity log and the agency's audit log.
  - The support place (`users.support_until`) gets no notifications.
  - It is not a place to sign in or switch to, and it is not listed as an administrator.
  - It stops working when the hour ends, or at "End visit".

## Not done yet

- **Going live** with agency addresses: wildcard DNS and certificate, and moving Milestone's public website to its own domain so `mohuddle.com` is Mohuddle's.
- **Changing an agency's time zone** takes effect for each person at their next sign-in or switch, since it travels in their session's cookie.
- **Links without a foreign key** (a note event's note, a document's request item) are not checked this way. They are only ever set by the app, inside one agency.
