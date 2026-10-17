# Mohuddle test deployment

The server-rendered website, server actions and phone API form one Next.js application.
Render runs that application, with PostgreSQL on Renviq and email through RelyKit.
The speech worker and Ollama need separate runtime/model provisioning; they are not bundled
with the Node service. Until configured, voice drafting reports that it is unavailable.

`render.yaml` describes a paid Starter service and a 1 GB persistent private disk. Review its
current cost in Render before applying it. The disk keeps uploads across deployments. A free
ephemeral filesystem is unsuitable for document and incident-photo testing that must persist.
Private S3-compatible storage can replace the disk later.

## Environment

- `DATABASE_URL`: Renviq's direct, TLS-enabled connection string, stored only as a secret.
- `SESSION_SECRET`: a new deployment-specific random secret; keep it stable across redeploys.
- `CRON_SECRET`: a separate random secret for the reminder endpoint.
- For the initial working test: `APP_URL=https://mohuddle-care.onrender.com`,
  `PUBLIC_SITE=mohuddle`, `AGENCY_ADDRESSES=off`. After custom-domain verification, switch
  `APP_URL=https://care.mohuddle.com` and `AGENCY_ADDRESSES=on` together.
- `OWNER_TWO_FACTOR=required`, `STORAGE_DIR=/var/data/uploads`.
- For email: `EMAIL_PROVIDER=relykit`, a dedicated `RELYKIT_API_KEY`, and `EMAIL_FROM` on the
  exact RelyKit-verified domain. Console mode deliberately sends nothing.
  The current RelyKit key form grants full workspace access; keep the key private and separate
  from other apps. Prefer a send-only domain restriction if the provider adds that option.

The web service uses Node 22, installs with the frozen pnpm lockfile, builds with `pnpm build`,
migrates with `pnpm db:migrate`, and starts on Render's `$PORT`. `/api/health` returns 200 only
when the database and migration table are reachable; failures return a generic 503.

## Database privileges

The database login owns this application's schema. Migration 0029 creates the non-login
`mohuddle_app` role and grants the database login membership. Managed providers may need to
provision that role/membership through their control plane first. Do not remove row-level
security or use a superuser connection for ordinary application queries to work around this.
Migration 0029 already skips creating the role if it exists.

Use a new test database; do not copy the existing local database or its account passwords.
The development seed is not a production bootstrap. First-owner setup must use a private
one-time password setup link, followed by the owner's authenticator enrollment.

For an empty, migrated database, run `pnpm tsx scripts/bootstrap-owner.ts --env
.env.deployment.local --email owner@example.com --name "Owner Name" --link-file
output/owner-setup.private.txt` (keep this on one command line). The script refuses any database
with existing logins, creates the first owner and Milestone administrator, initializes the agency's
default forms and note requirements, and saves a 24-hour setup link to the private file without
printing the token. It never chooses a password or imports demo care records. Keep the link file
and deployment environment out of Git; the owner must set their own password and authenticator.

## Domains and verification

Use `care.mohuddle.com` for this test deployment, with `app.care.mohuddle.com`,
`admin.care.mohuddle.com` and `milestone.care.mohuddle.com` in the hosting service. Keep the
existing root and www website records, and follow Render's exact DNS instructions in GoDaddy.
Mail DNS records come from RelyKit and are
separate from website records. If the verified mail domain is `www.mohuddle.com`, DKIM hosts
must end in `._domainkey.www` in GoDaddy's `mohuddle.com` zone, and the return path is
`send.www`. Do not remove unrelated existing website or email records.

Verify HTTPS, the public homepage, login, anonymous Hub/API rejection, a first-owner sign-in,
an agency workflow, mail delivery, persistent upload access and reminder health after launch.

## Repositories and phone builds

- Web and server: https://github.com/KRISSBAJO/mohuddle-care
- Phone app: https://github.com/KRISSBAJO/mohuddle_care_mobile-

The web repository retains the `mobile/` source for paired development. Publish that directory
to the phone repository with `git subtree split --prefix=mobile`, then push the resulting
commit to the phone repository's `main` branch. No dependencies or build outputs are included.

The mobile repository has the Expo app at its root. Run `npm ci`, set `EXPO_PUBLIC_API_URL`,
and use its `eas.json` preview profile for an Android APK/internal iOS build. iOS signing needs
the existing Apple/Expo account setup. No signing credentials belong in Git.
