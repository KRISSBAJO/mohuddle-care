import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { SESSION_COOKIE } from "../src/lib/session-cookie";
import { agencyDb } from "./agency-db";

async function main() {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3400");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Preview checks only run against localhost.");
  assert.notEqual(process.env.NODE_ENV, "production", "Use a development database.");
  // Works as one agency, like the app: it signs in as that agency's admin and sees only its records.
  const { pool } = agencyDb();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token + process.env.SESSION_SECRET).digest("hex");
  try {
    const { rows: users } = await pool.query("select id from users where active and role='admin' limit 1");
    assert.ok(users[0], "Seed the local demo first.");
    await pool.query("insert into sessions(token_hash,user_id,expires_at) values($1,$2,$3)", [tokenHash, users[0].id, new Date(Date.now() + 600_000)]);
    const unauthenticated = await fetch(new URL("/app", url), { redirect: "manual" });
    assert.equal(unauthenticated.status, 307);
    assert.ok(unauthenticated.headers.get("location")?.includes("/login"));
    // The owner console, when this admin is a Mohuddle owner (scripts/make-owner.ts).
    const owner = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const { rows: ownerRows } = await owner.query("select l.is_owner from users u join logins l on l.id = u.login_id where u.id = $1", [users[0].id]).finally(() => owner.end());
    const ownerRoutes = ownerRows[0]?.is_owner ? ["/owner", "/owner/enquiries", "/owner/health"] : [];
    const { rows: people } = await pool.query("select id from individuals limit 1");
    const { rows: incidents } = await pool.query("select id from incidents order by status");
    const routes = [...ownerRoutes, "/", "/careers", "/privacy", "/app", "/app/individuals", "/app/individuals/new", "/app/daily-logs", "/app/daily-logs/new", "/app/medications", "/app/schedule", "/app/incidents", "/app/incidents/new", "/app/tasks", "/app/homes", "/app/staff", "/app/enquiries", "/app/settings"];
    if (people[0]) {
      const person = `/app/individuals/${people[0].id}`;
      routes.push(person, `${person}/edit`);
      for (const tab of ["plan", "medications", "health", "logs", "incidents", "tasks", "profile", "not-a-tab"]) routes.push(`${person}?tab=${tab}`);
      routes.push(`${person}?tab=medications&days=28&end=2026-09-30`, `${person}?tab=medications&days=99&end=not-a-date`, `${person}?tab=logs&mood=concern&per=25&page=9`, `${person}?tab=logs&mood=nonsense&page=-3`);
    }
    for (const incident of incidents) routes.push(`/app/incidents/${incident.id}`);
    const { rows: logs } = await pool.query("select id from daily_logs order by created_at desc limit 2");
    for (const log of logs) routes.push(`/app/daily-logs/${log.id}`);
    routes.push("/app/daily-logs/new?individual=not-a-person");
    const { rows: visits } = await pool.query("select id from appointments order by scheduled_at desc limit 3");
    for (const visit of visits) routes.push(`/app/appointments/${visit.id}`);
    routes.push("/app/appointments", "/app/appointments?view=document", "/app/appointments?view=followup&q=neuro", "/app/appointments?view=past&home=bad", "/app/appointments?book=1", "/app/notifications", "/app/notifications?show=unread");
    if (people[0]) routes.push(`/app/individuals/${people[0].id}?tab=appointments`);
    routes.push("/app?tab=shifts", "/app?tab=care", "/app?tab=incidents", "/app?tab=team", "/app?tab=nonsense");
    routes.push("/app/documents", "/app/documents?tab=review", "/app/documents?tab=staff", "/app/documents?tab=people", "/app/documents?tab=business", "/app/documents?tab=requests", "/app/documents?tab=signing", "/app/documents?tab=types", "/app/documents?q=cpr", "/app/my-documents", "/forgot-password", "/docs/r/not-a-real-token-but-long-enough");
    if (people[0]) routes.push(`/app/individuals/${people[0].id}?tab=documents`);
    const { rows: pdfTemplates } = await pool.query("select id from sign_templates where source_key is not null limit 1");
    if (pdfTemplates[0]) routes.push(`/app/documents/templates/${pdfTemplates[0].id}`);
    if (people[0]) routes.push(`/app/individuals/${people[0].id}?tab=care-team`);
    routes.push("/app/tasks?view=open", "/app/tasks?view=overdue&group=assignee", "/app/tasks?view=done", "/app/tasks?view=unassigned&group=home&priority=high&q=book", "/app/tasks?person=bad&home=bad");
    const { rows: taskRows } = await pool.query("select id from tasks limit 1");
    if (taskRows[0]) routes.push(`/app/tasks/${taskRows[0].id}`);
    routes.push("/app/appointments/new", "/app/appointments/new?individual=bad&followUpOf=bad");
    const { rows: homeRows } = await pool.query("select id from homes limit 1");
    routes.push("/app/daily-logs?view=notes", "/app/daily-logs?view=notes&sort=mood&dir=asc&per=50&page=9&mood=concern&q=a", "/app/daily-logs?view=owed", "/app/daily-logs/home/none", "/app/daily-logs/home/none?days=99&end=bad&sort=bad");
    if (homeRows[0]) routes.push(`/app/daily-logs/home/${homeRows[0].id}`, `/app/daily-logs/home/${homeRows[0].id}?days=30&status=all&sort=last&dir=asc`);
    if (people[0]) {
      const days = `/app/daily-logs/person/${people[0].id}`;
      routes.push(days, `${days}?filter=gaps&dir=asc&per=62&from=2026-01-01`, `${days}?from=bad&to=2099-01-01&filter=nope`, `${days}/2026-10-11`);
    }
    if (visits[0]) routes.push(`/app/appointments/new?followUpOf=${visits[0].id}`);
    routes.push("/app/settings/notes", "/app/settings/shifts", "/app/daily-logs?view=owed", "/app/daily-logs?view=owed&day=2026-10-13&home=not-a-home", "/app/daily-logs/new?shift=not-a-shift", "/app/community-notes/new", "/app/community-notes/new?individual=not-a-person", "/app/daily-logs?view=review", "/app/daily-logs?view=review&status=all&kind=community&flagged=1", "/mohuddle", "/app/clock?done=in");
    if (people[0]) routes.push(`/app/daily-logs/new?individual=${people[0].id}`);
    routes.push("/app/incidents?status=active&sort=deadline&dir=desc&reportable=yes&period=all&per=10&page=3", "/app/incidents?q=headphones&severity=moderate&category=behavioural&home=none&attention=serious", "/app/homes/new", "/app/homes?view=table&sort=budget&dir=asc", "/app/homes?attention=late-meds&type=group_home&q=hill&per=6&page=4", "/app/homes?status=all&sort=vacancies", "/app/account", "/app/staff?q=a&role=dsp&login=none&cred=any&sort=expiry&dir=desc&per=10&page=2", "/app/staff?status=all&sort=home", "/app/individuals?q=e&attention=no-log&sort=lastLog&dir=desc&per=10&page=3", "/app/individuals?status=all&sort=age", "/app/schedule?view=staff", "/app/schedule?view=day&day=2026-10-14", "/app/schedule?week=2025-03-09", "/app/schedule?week=not-a-date");
    const { rows: staff } = await pool.query("select id from staff where active limit 1");
    const { rows: homes } = await pool.query("select id from homes where active limit 1");
    if (homes[0]) routes.push(`/app/homes/${homes[0].id}?tab=schedule`, `/app/homes/${homes[0].id}?tab=schedule&week=2025-01-06`, `/app/homes/${homes[0].id}?tab=schedule&week=junk`);
    const { rows: meds } = await pool.query("select id, individual_id from medications where active limit 1");
    routes.push("/app/staff/new");
    routes.push("/app/clock", "/app/clock?done=in", "/app/clock/in", "/app/clock/correction", "/app/clock/correction?entry=not-a-punch", "/app/time", "/app/time?tab=review", "/app/time?tab=punches", "/app/time?tab=punches&filter=flagged&staff=bad&home=bad&from=bad&page=9", "/app/time?tab=handovers", "/app/time?tab=nonsense", "/app/time?tab=timesheets", "/app/time?tab=timesheets&period=2026-01-05", "/app/time?tab=timesheets&period=bad", "/app/clock/timesheets", "/app/clock/timesheets/2026-09-28", "/app/clock/time-off", "/app/time?tab=timeoff", "/app/time?tab=reports", "/app/time?tab=reports&from=2026-09-01&to=2026-09-30", "/app/time?tab=reports&from=bad&to=2099-01-01", "/app/settings/differentials", "/app/incidents/new?home=bad", "/app/incidents/new?individual=not-a-person");
    if (people[0]) routes.push(`/app/incidents/new?individual=${people[0].id}`);
    if (homeRows[0]) routes.push(`/app/incidents/new?home=${homeRows[0].id}`);
    if (staff[0]) routes.push(`/app/time/sheets/2026-09-28/${staff[0].id}`);
    if (homeRows[0]) routes.push(`/app/homes/${homeRows[0].id}?tab=details`);
    if (staff[0]) {
      const member = `/app/staff/${staff[0].id}`;
      routes.push(member, `${member}/edit`);
      for (const tab of ["schedule", "time", "pay", "notes", "credentials", "documents", "account", "not-a-tab"]) routes.push(`${member}?tab=${tab}`);
    }
    if (homes[0]) routes.push(...["", "?tab=medications", "?tab=medications&day=2026-01-01", "?tab=expenses", "?tab=expenses&month=2025-12", "?tab=issues", "?tab=issues&show=all", "?tab=details", "?tab=bogus"].map(q => `/app/homes/${homes[0].id}${q}`));
    if (meds[0]) routes.push(`/app/individuals/${meds[0].individual_id}/medications/${meds[0].id}`);
    const deadLink = await fetch(new URL("/setup-password/not-a-real-link-token-000000", url));
    assert.equal(deadLink.status, 200);
    assert.ok((await deadLink.text()).includes("This link no longer works"), "An unknown setup link must be refused");
    console.log("PASS unknown setup link is refused");
    for (const route of routes) {
      const response = await fetch(new URL(route, url), { headers: { Cookie: `${SESSION_COOKIE}=${token}` }, redirect: "manual" });
      const html = await response.text();
      assert.equal(response.status, 200, `${route} must return 200`);
      assert.ok(!html.includes('id="__next_error__"'), `${route} must render without a server error`);
      assert.ok(html.includes("<h1"), `${route} must render its main content`);
      console.log(`PASS ${route}`);
    }
    for (const form of ["MHHS_Job_Application_Digital.pdf", "Foster-Home-Application-for-Parenting.pdf"]) {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const response = await fetch(new URL(`/forms/${form}`, url));
      assert.equal(response.status, 200, `${form} must download successfully`);
      assert.ok(response.headers.get("content-type")?.includes("application/pdf"));
      const served = Buffer.from(await response.arrayBuffer());
      const local = await readFile(resolve("public/forms", form));
      assert.ok(served.equals(local), `${form} must be served without modification`);
      assert.equal(served.subarray(0, 5).toString(), "%PDF-");
      console.log(`PASS original PDF ${form}`);
    }
    console.log(`Verified ${routes.length} routes and unauthenticated app protection.`);
  } finally {
    await pool.query("delete from sessions where token_hash=$1", [tokenHash]);
    await pool.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
