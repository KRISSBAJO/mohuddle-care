import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { SESSION_COOKIE } from "../src/lib/session-cookie";

async function main() {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3400");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Preview checks only run against localhost.");
  assert.notEqual(process.env.NODE_ENV, "production", "Use a development database.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token + process.env.SESSION_SECRET).digest("hex");
  try {
    const { rows: users } = await pool.query("select id from users where active and role='admin' limit 1");
    assert.ok(users[0], "Seed the local demo first.");
    await pool.query("insert into sessions(token_hash,user_id,expires_at) values($1,$2,$3)", [tokenHash, users[0].id, new Date(Date.now() + 600_000)]);
    const unauthenticated = await fetch(new URL("/app", url), { redirect: "manual" });
    assert.equal(unauthenticated.status, 307);
    assert.ok(unauthenticated.headers.get("location")?.includes("/login"));
    const { rows: people } = await pool.query("select id from individuals limit 1");
    const { rows: incidents } = await pool.query("select id from incidents limit 1");
    const routes = ["/", "/careers", "/privacy", "/app", "/app/individuals", "/app/individuals/new", "/app/daily-logs", "/app/daily-logs/new", "/app/medications", "/app/schedule", "/app/incidents", "/app/incidents/new", "/app/tasks", "/app/homes", "/app/staff", "/app/enquiries", "/app/settings"];
    if (people[0]) routes.push(`/app/individuals/${people[0].id}`, `/app/individuals/${people[0].id}/edit`);
    if (incidents[0]) routes.push(`/app/incidents/${incidents[0].id}`);
    routes.push("/app/account");
    const { rows: staff } = await pool.query("select id from staff where active limit 1");
    const { rows: homes } = await pool.query("select id from homes where active limit 1");
    const { rows: meds } = await pool.query("select id, individual_id from medications where active limit 1");
    if (staff[0]) routes.push(`/app/staff/${staff[0].id}`);
    if (homes[0]) routes.push(`/app/homes/${homes[0].id}`);
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
    console.log(`Verified ${routes.length} routes and unauthenticated Hub protection.`);
  } finally {
    await pool.query("delete from sessions where token_hash=$1", [tokenHash]);
    await pool.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
