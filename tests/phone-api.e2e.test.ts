import "dotenv/config";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

/*
 * The phone API against a running server: every route refuses a request without a sign-in, manager
 * routes refuse care staff, and bad input is turned away. Needs the dev server and the demo data:
 *   RUN_API_TESTS=1 pnpm test   (API_BASE defaults to http://localhost:3400)
 * Signs in as the demo administrator and the demo direct support professional, and signs out after.
 */

const skip = process.env.RUN_API_TESTS !== "1";
const BASE = (process.env.API_BASE ?? "http://localhost:3400").replace(/\/$/, "");
const FAKE_ID = "00000000-0000-4000-8000-000000000000";
const ROOT = join(process.cwd(), "src", "app", "api", "v1");

/* Every phone route and the methods it answers, read from the files. */
function routes() {
  const found: { path: string; methods: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") {
        const source = readFileSync(full, "utf8");
        const methods = ["GET", "POST", "DELETE", "PUT", "PATCH"].filter(method => new RegExp(`export (const|async function) ${method}\\b|export \\{[^}]*\\b${method}\\b`).test(source));
        const path = "/" + relative(ROOT, dir).split(sep).join("/").replace(/\[[^\]]+\]/g, FAKE_ID);
        found.push({ path: path === "/" ? "" : path, methods });
      }
    }
  };
  walk(ROOT);
  return found;
}

async function call(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // Some answers, such as a photo, are not JSON.
  }
  return { status: response.status, json, headers: response.headers };
}

async function signIn(email: string) {
  const result = await call("/auth/sign-in", { body: { email, password: process.env.SEED_ADMIN_PASSWORD, device: "API test" } });
  return typeof result.json.token === "string" ? result.json.token : null;
}

test("every phone route refuses a request without a sign-in", { skip, timeout: 300_000 }, async () => {
  // Signing in needs no session, and signing out with none has nothing to do.
  const open = new Set(["/auth/sign-in", "/auth/sign-out"]);
  const byLink = new Set(["/documents/upload"]);
  const list = routes();
  assert.ok(list.length > 30, "found the phone routes");
  for (const route of list) {
    if (open.has(route.path)) continue;
    for (const method of route.methods) {
      const { status } = await call(route.path, { method, body: method === "GET" ? undefined : {} });
      // Uploads also come from a private request link with no sign-in: those must refuse, never fail.
      if (byLink.has(route.path)) assert.ok(status >= 400 && status < 500, `${method} /api/v1${route.path} answered ${status} without a sign-in`);
      else assert.equal(status, 401, `${method} /api/v1${route.path} answered ${status} without a sign-in`);
    }
  }
});

test("a made-up token is refused like no token", { skip, timeout: 60_000 }, async () => {
  const { status } = await call("/me", { token: "not-a-real-session-token" });
  assert.equal(status, 401);
});

test("the browser preview may call the API with a token, and nothing else is allowed across sites", { skip, timeout: 60_000 }, async () => {
  const response = await fetch(`${BASE}/api/v1/me`, { method: "OPTIONS", headers: { origin: "http://localhost:8098", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
  assert.ok(response.status < 300, `preflight answered ${response.status}`);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/i);
  // No cookies cross sites: the phone signs in with a token only.
  assert.notEqual(response.headers.get("access-control-allow-credentials"), "true");
});

test("care staff are refused the manager screens and decisions", { skip, timeout: 300_000 }, async () => {
  const staff = await signIn("jamal.carter@milestonecare.net");
  if (!staff) return assert.fail("The demo staff login did not sign in. Is the demo data there, with the demo password?");
  try {
    const me = await call("/me", { token: staff });
    assert.equal(me.status, 200);
    assert.equal((me.json.user as { canManage?: boolean }).canManage, false);
    for (const path of ["/team", "/team/approvals", `/team/incidents/${FAKE_ID}`]) {
      assert.equal((await call(path, { token: staff })).status, 403, `GET ${path}`);
    }
    // Decisions answer with a refusal, never success.
    const decisions: [string, unknown][] = [
      [`/team/time-off/${FAKE_ID}`, { approve: true }],
      [`/team/corrections/${FAKE_ID}`, { approve: true }],
      [`/team/punches/${FAKE_ID}`, {}],
      ["/team/timesheets", { periodId: FAKE_ID, staffId: FAKE_ID, action: "approve" }],
      [`/team/incidents/${FAKE_ID}`, { action: "review" }],
    ];
    for (const [path, body] of decisions) {
      const { status, json } = await call(path, { token: staff, body });
      assert.ok(status === 400 || status === 403, `POST ${path} answered ${status}`);
      assert.notEqual(json.ok, true);
    }
  } finally {
    await call("/auth/sign-out", { token: staff, body: {} });
  }
});

test("bad input is turned away with a plain message", { skip, timeout: 120_000 }, async () => {
  const admin = await signIn(process.env.SEED_ADMIN_EMAIL ?? "");
  if (!admin) return assert.fail("The demo administrator did not sign in.");
  try {
    const cases: [string, unknown][] = [
      ["/push", { token: "not-a-push-address" }],
      ["/clock/break", { action: "start", kind: "nap" }],
      ["/assistant", { text: "" }],
      ["/team/timesheets", { action: "approve" }],
      ["/meds/record", {}],
      ["/notes", {}],
    ];
    for (const [path, body] of cases) {
      const { status, json } = await call(path, { token: admin, body });
      assert.ok(status >= 400 && status < 500, `POST ${path} answered ${status}`);
      assert.equal(typeof json.error, "string", `POST ${path} explains why`);
      assert.doesNotMatch(String(json.error), /stack|at .*\(|SELECT|postgres/i, `POST ${path} leaks internals`);
    }
    const manager = await call("/team", { token: admin });
    assert.equal(manager.status, 200);
  } finally {
    await call("/auth/sign-out", { token: admin, body: {} });
  }
});
