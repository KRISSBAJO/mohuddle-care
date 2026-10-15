# Milestone

Public website and staff operations app ("Mohuddle") for Milestone Home Healthcare Service, a
Nashville provider of person-centered support for adults and children with intellectual and
developmental disabilities.

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

Email delivery is not built yet, which is why links are copied by hand.

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
argon2 password hashing with database-backed sessions. Times are Central (America/Chicago).

## Run it

```bash
cp .env.example .env        # then set real values
pnpm install
pnpm db:up                  # PostgreSQL in Docker on 127.0.0.1:15450
pnpm db:migrate
pnpm db:seed                # demo data and a sign-in (see .env.example)
pnpm dev                    # http://localhost:3400
```

`pnpm test` runs the unit tests, `pnpm typecheck` and `pnpm lint` check the code.

## Preview and regression checks

The local preview runs at http://localhost:3400. The fictional seed account is
`admin@milestonecare.net` with password `Milestone-demo-2026` unless overridden in `.env`.

On Windows, `powershell -File scripts/start-preview.ps1` also starts the preview directly
with the installed runtime if the system's package-manager launcher stalls.

The public site uses original illustrative care imagery, documented with the generation
prompts in `public/images/README.md`. The Hub includes daily priorities, progress, quick
actions, and a searchable people directory. Forms retain drafts when validation fails.

`pnpm check:preview` checks all seeded screens against the running local server and verifies
that anonymous visitors are redirected to sign in. It uses a temporary local session and
removes it afterward.

To run the PostgreSQL medication regression test from PowerShell:

```powershell
$env:RUN_DB_TESTS='1'
$env:NODE_OPTIONS='--conditions=react-server'
pnpm test
Remove-Item Env:RUN_DB_TESTS, Env:NODE_OPTIONS
```

That test creates its own fictional fixture, checks dashboard dose generation, idempotency,
and uncapped late counts, then removes the fixture. Regular unit tests also cover shift
ownership, final-state protection, and daylight-saving transition boundaries.

## Not built yet

Email notifications, billing and claims, family portal, mobile app, and the real DIDD reporting
integration. Multi-agency is in progress: see docs/multi-tenancy.md. The seed data is fictional.

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
