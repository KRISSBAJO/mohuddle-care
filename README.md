# Mohuddle / Milestone

Public website and staff operations app ("Mohuddle") for Milestone Home Healthcare Service, a
Nashville provider of person-centered support for adults and children with intellectual and
developmental disabilities. Mohuddle now supports multiple agencies, with Milestone as the first
agency. The code includes a web app, an Expo phone app, and a separate platform-owner console.

## What is here

- **Website** at `/`: landing page, careers page, privacy page. Contact and careers forms store
  messages in the database; coordinators read them in the Hub.
- **Hub** at `/app` (sign in at `/login`): the daily running of the organisation.
  - Today: who is on shift, late medications, open incidents, missing daily logs, expiring
    credentials, open shifts and tasks due.
  - People we support: profile, support notes, plan goals, medications, log history, incidents.
  - Daily logs with required checks set by the office.
  - Medication administration record for any day.
  - Weekly schedule per home with open-shift warnings and self-confirmation.
  - Incident reports with state-reportable deadlines.
  - Tasks, homes, staff and credentials, website messages.
  - Settings: the business rules (warning windows, due hours, required checks, credential
    types) live in the database and drive every screen. They are never fixed in code.
  - Care plans, goal progress, health and weight records, care-team contacts and appointments.
  - Detailed daily and community notes, supervisor review, returns for correction and edit history.
  - Scheduled, controlled and as-needed medicines, with dose limits and effectiveness follow-up.
  - Clock-in/out, location checks, breaks, handovers, punch corrections, time off and approvals.
  - Signed timesheets, locked pay periods, pay rates, differentials, leave balances and payroll exports.
  - EVV visit CSV exports for handoff to a vendor; there is no direct vendor submission integration.
  - Private document uploads, requests, templates, PDF signing and credential expiry reminders.
  - Browser and phone notifications, timed reminders and a morning digest.
  - **Speak your note:** self-hosted speech transcription and note drafting. Staff review and sign.
  - **Ask Mohuddle:** operational questions, navigation and confirmed clock actions.
- **Product website** at `/mohuddle`: platform features, privacy explanation and demo enquiries.
- **Owner console** at `/owner` (the `admin` address when agency addresses are enabled): agencies,
  plans, subscription standing, manually recorded payments, support visits, activity and health.
- **Phone app** in `mobile/`: Expo / React Native for iPhone and Android, with staff workflows,
  manager approvals, secure sessions, PIN/biometric lock, push and offline regular-dose recording.
  See [mobile/README.md](mobile/README.md) for setup and device limitations.

Roles: `admin` and `coordinator` manage everything; `nurse` and `dsp` write logs, record
medications, report incidents and confirm their own shifts.

## Staff logins

There is no self sign-up. A coordinator or administrator opens a staff member's page and
chooses **Create login and get link**. The Hub shows a one-time link once; hand it to the
person privately. They open it, choose a password and are signed in. The same page gives a
password reset link, changes access and turns a login off. Links last for the hours set in
Settings, and only a hash of each link is stored.

Coordinators manage direct support and nurse logins. Only administrators grant or manage
coordinator and administrator access. Nobody can turn off or change their own login. Everyone
can change their own password under **My account**.

Email delivery through RelyKit is implemented. Set `EMAIL_PROVIDER=relykit`, `RELYKIT_API_KEY`
and a verified `EMAIL_FROM` to send; the default `console` provider only logs messages.
Agency settings control emailed setup/reset and document-request links. Links remain available
to copy privately. Password recovery uses a neutral response and rate limits.

Owners have a separate sign-in and session, with authenticator-based two-factor authentication
required by default. Owner access is granted by `scripts/make-owner.ts`, never through the app.

## Editing and history

- **Staff:** edit details, record or remove credentials, and mark someone as left. Leaving
  turns their login off and opens their upcoming shifts and tasks for others.
- **Homes:** edit details and capacity, close a home once nobody lives there, and reopen it.
  Closing removes its upcoming shifts. Past records stay.
- **Medications:** a change never edits the old order. It stops it with a reason and starts a
  new one, so past medication records keep the dose that was actually given. Stopping
  removes upcoming doses only.

## Stack

Next.js 16 (App Router, server actions), React 19, Tailwind 4, Drizzle ORM on PostgreSQL 16,
argon2 password hashing with database-backed sessions. Each agency has its own time zone
(Central / America/Chicago by default). PostgreSQL row-level security and agency-aware foreign
keys isolate agency records. See [docs/multi-tenancy.md](docs/multi-tenancy.md).

The phone app uses Expo / React Native. Speech runs through faster-whisper and note drafting
through Ollama; see [docs/note-scribe.md](docs/note-scribe.md) and
[docs/ask-mohuddle.md](docs/ask-mohuddle.md). Uploads support private local or S3-compatible storage.

## Run it

```bash
cp .env.example .env        # then set real values
pnpm install
pnpm db:up                  # PostgreSQL in Docker on 127.0.0.1:15450
pnpm db:migrate
pnpm db:seed                # demo data and a sign-in (see .env.example)
pnpm dev                    # http://localhost:3400
```

Use Node.js 22 and pnpm 10.29.3. On PowerShell, use `Copy-Item .env.example .env`
instead of the first command. Keep secrets out of version control. Seeding is for a local demo,
not a production database.

With `AGENCY_ADDRESSES=on`, Milestone uses `milestone.localhost:3400`, shared sign-in uses
`app.localhost:3400`, and the owner console uses `admin.localhost:3400`.

The phone app has its own npm lockfile: `cd mobile`, `npm ci`, then `npm run web`.
A real phone needs `EXPO_PUBLIC_API_URL` pointing to a reachable server, not phone-local localhost.

`pnpm test` runs the default suite with the `react-server` condition already supplied by the
script. `pnpm typecheck` and `pnpm lint` check the web project; the phone app is checked separately
with `npm run typecheck` and `npm run lint` from `mobile/`.

## Preview and regression checks

The local preview runs at http://localhost:3400. The fictional seed account is
`admin@milestonecare.net` with password `Milestone-demo-2026` unless overridden in `.env`.

On Windows, `powershell -File scripts/start-preview.ps1` also starts the preview directly
with the installed runtime if the system's package-manager launcher stalls.

The public site uses original illustrative care imagery, documented with the generation
prompts in `public/images/README.md`. The Hub includes daily priorities, progress, quick
actions, and a searchable people directory. Forms retain drafts when validation fails.
The Mohuddle trust section uses original generated care-review artwork; its prompt and provenance
are in `public/illustrations/README.md`.

`pnpm check:preview` checks all seeded screens against the running local server and verifies
that anonymous visitors are redirected to sign in. It uses a temporary local session and
removes it afterward. Each request has a 90-second timeout, with the failing route named rather
than waiting indefinitely. This is a page-render smoke check, not a complete browser interaction test.

To include the PostgreSQL integration tests from PowerShell:

```powershell
$env:RUN_DB_TESTS='1'
pnpm test
Remove-Item Env:RUN_DB_TESTS
```

These include agency isolation and foreign-key guards, medications, owner access, email,
signature rendering and sign-in protection. Tests use temporary fixtures; run against a development
database. Regular tests also cover scheduling, payroll, note review, signing, assistant requests,
shift ownership and daylight-saving boundaries.

To test phone API access against the running local server and seeded accounts:

```powershell
$env:RUN_API_TESTS='1'
pnpm test
Remove-Item Env:RUN_API_TESTS
```

If a demo staff member has changed their password, set `API_TEST_STAFF_EMAIL` and
`API_TEST_STAFF_PASSWORD` to a valid care-staff test account. Tests do not reset staff passwords.

## Production build and deployment

See [docs/deployment.md](docs/deployment.md) and `render.yaml` for the hosted test deployment.
The public frontend deploys to Vercel from `frontend/`. The Render backend is
[mohuddle-care.onrender.com](https://mohuddle-care.onrender.com); Vercel forwards sign-in, portal,
API and private-file requests there. Set Render's `APP_URL` to the public Vercel origin and keep
`AGENCY_ADDRESSES=off` until agency DNS is ready. The public address is `https://mohuddle.com`, registered in Vercel; `www.mohuddle.com`
redirects there. Website DNS now points to this deployment.

```bash
pnpm build
pnpm start                 # production server on port 3400
```

Next.js keeps development output in `.next/dev`, separate from the production build. Start a
production smoke-test server on another port if the preview is already using 3400:
`pnpm exec next start --port 3401`. A successful build does not verify external service delivery.

Before deploying, configure the deployment's own database, session secret, HTTPS `APP_URL`,
and trusted proxy client-IP header. Apply the migrations with `pnpm db:migrate` and arrange database
and file backups with a tested restore procedure. Do not seed demo accounts into production.
For a new database, `scripts/bootstrap-owner.ts` creates the first administrator and owner with
a private, 24-hour password setup link. It refuses databases that already have logins. See the
deployment guide for the command and follow-up authenticator setup.

- **Files:** configure private S3-compatible storage, or explicitly manage persistent private disk
  and backups. The default `.storage` directory is local development storage.
- **Email:** console mode sends nothing. Configure RelyKit and verify actual delivery.
- **Agency addresses:** wildcard DNS and TLS must cover agency, shared sign-in and admin addresses.
- **Reminders:** set `CRON_SECRET`. A long-lived server runs the built-in tick; a hosted scheduler
  can instead call `POST /api/cron/sweep` with the bearer secret. Verify reminder delivery.
- **AI:** hosted speech is on hold because of the additional server cost. The optional private
  runtime is prepared in [scripts/scribe/hosted/README.md](scripts/scribe/hosted/README.md), with
  local transcription and transport checks passing. Production speech remains disabled until a
  host is approved, both models are verified there, and the phone recording flow is tested.
- **Phone updates:** preview and production EAS channels are configured with native fingerprints.
  Compatible code and layout changes use OTA updates; see the phone README for publishing.
- **Push:** configure browser VAPID keys and native Expo/FCM/APNs credentials. Real phone push needs
  a development/store build, not Expo Go; see the mobile README.
- **Chat:** `pnpm start:hosted` runs the website and its WebSocket gateway in the existing Render
  service, sharing its `DATABASE_URL` and `SESSION_SECRET` without another paid service.
  `CHAT_SOCKET_URL` on the website must be the gateway's public `wss://` address
  ending in `/chat`. Vercel rewrites cannot carry WebSockets, so apps connect to the gateway directly.
  Without it chat still works, checking for news every few seconds. See [docs/deployment.md](docs/deployment.md#chat-live-connection).
  In groups: reply privately to a message (it opens the one-to-one chat, quoting it), tap a name to
  see who it is and message them, @everyone and polls (who may use them are agency settings,
  `chat_mention_all` and `chat_polls`), and every chat opens at an "unread messages" line. On a
  phone-sized screen the website's chat fills the screen like a chat app.
- **Ports:** the gateway uses 3401 locally (`CHAT_SOCKET_PORT`); use another port for a local
  production smoke test.
- **Operations:** verify owner two-factor setup, agency isolation, file access, service health and
  recovery on the target deployment before using real care records.

## Remaining scope and verification

Multi-agency, email integration, subscription plans and a phone app are implemented. Subscription
payments are recorded manually: there is no automated card charging. Healthcare claims, a family
portal, direct state-reporting submission and direct EVV-vendor submission are not implemented.

Phone punches require connectivity. Regular scheduled doses can queue offline; controlled and
as-needed medicines require a connection. PDF templates with placed signing fields use the website.
Microphone, camera, biometrics and native push still require physical-device release testing.

The seed data is fictional. Passing unit/integration checks does not establish production readiness,
load capacity or a full security/compliance assessment. Run the production build and smoke checks,
then validate the target deployment and device workflows.

## Mobile notes and draft recovery

The phone app now supports reading signed notes, auditable amendments, returned-note correction
and resubmission, eligible reviewer queues, and Community Participation notes. Review actions reuse
the website's validation and permissions; concurrent changes are checked before saving. Notes and
incident drafts are stored on the phone by account and agency. Incident photos are encrypted until
upload, and failed uploads can be retried without filing a second report.

Deploy the backend before publishing the matching OTA update. No native build is required for
these screens. See [mobile/README.md](mobile/README.md) for checks and physical-phone acceptance
steps. Notes also show unsigned drafts on their own list, independently of server refreshes.
Calendar/time selectors and expandable plain-text editors support writing without entering raw
date formats. A home must exist before an unscheduled care clock-in can be submitted.

The phone app includes personal weekly schedules, punch corrections, leave requests and timesheet
review/signing; a searchable people directory; appointment booking, documentation and follow-up;
health history, weights and care-team tools with nurse/manager permissions; and manager scheduling,
coverage checks and task assignment. These use the same domain rules as the website. Administrative
setup, payroll exports, home issues/expenses and staff credential management remain website workflows.
Speech still requires the separately configured engines; the previously deferred speech hosting has
not been enabled by these changes.

Office/admin work is a separate, non-care clock-in option. It is off until an administrator sets
the office address/map position and names the approved staff under Settings → Office / admin work.
Job title alone grants no access. Another administrator must grant the administrator's own staff
access. Starts require accurate GPS inside the office radius, a work description, and no due care
shift. Office punches have no care-home/person assignment, so they do not enter EVV care-visit
exports. They count as worked time in payroll, with a separate label and mandatory review by
another manager after clock-out. Self-approval and "Lock anyway" cannot bypass office review.
Missing GPS at clock-out is retained as an exception; it does not erase worked hours. Permissions,
location policy changes, clock events and review reasons are audited. GPS is evidence, not proof
against spoofing; manager review and separation of duties remain necessary.

## Original-site content audit — 12 October 2026

Compared the public pages and linked application documents on milestonehhs.com with this implementation.

| Content | Original source | Included here |
| --- | --- | --- |
| Nine services and their support features | [Our Services](https://milestonehhs.com/our-services/) | Homepage service cards, footer links, contact interests |
| Address, telephone, email, office hours | [Contact](https://milestonehhs.com/contact/) | Homepage contact section, footer, careers contact details |
| Counties, Nashville origin, mission, vision, listed state credentials | [About Us](https://milestonehhs.com/about-us/) | Homepage community, story and accountability sections; footer |
| Published privacy and non-discrimination commitments | [About Us](https://milestonehhs.com/about-us/) | Accountability section and privacy page |
| DSPs, coordinators, residential managers, nurses | [Join Our Team](https://milestonehhs.com/join-our-team/) | Careers opportunities |
| Employment and foster-parent minimum requirements | [Join Our Team](https://milestonehhs.com/join-our-team/) | Separate careers application cards |
| Original 14-page employment packet and office fax | [Employment PDF](https://milestonehhs.com/wp-content/uploads/2024/05/MHHS_Job_Application_Digital.pdf) | `public/forms/MHHS_Job_Application_Digital.pdf`, careers links, footer |
| Original 4-page foster-parent form | [Foster-parent PDF](https://milestonehhs.com/wp-content/uploads/2024/05/Foster-Home-Application-for-Parenting.pdf) | `public/forms/Foster-Home-Application-for-Parenting.pdf`, careers links |

The PDF files are byte-for-byte copies of the downloads linked by the original careers page.
Source URLs, page counts, file sizes and SHA-256 checksums are in `public/forms/provenance.json`.
They are blank original applications; the short online interest form does not replace them.
The original website does not publish application submission instructions, so the new careers
page directs applicants to ask the office instead of inventing an upload or email process.

Removed unsupported claims from the earlier new-site careers copy: paid training, guaranteed
on-call staffing, promotion/pay paths, employment schedules and role-specific locations.
The original theme's lorem ipsum, overseas locations, generic medical team, demo prices,
donation blocks and placeholder social links are not part of the verified business inventory.
