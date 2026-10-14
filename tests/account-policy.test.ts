import assert from "node:assert/strict";
import { test } from "node:test";
import { assertMayGrant, defaultLoginRole, mayManageLogin, passwordProblem, rolesActorMayGrant } from "../src/lib/account-policy";

const admin = { id: "a", role: "admin" as const };
const coordinator = { id: "c", role: "coordinator" as const };
const dsp = { id: "d", role: "dsp" as const };

test("coordinators can only grant direct support and nurse access", () => {
  assert.deepEqual(rolesActorMayGrant(coordinator), ["dsp", "nurse"]);
  assert.throws(() => assertMayGrant(coordinator, "admin"));
  assert.throws(() => assertMayGrant(coordinator, "coordinator"));
  assert.doesNotThrow(() => assertMayGrant(coordinator, "nurse"));
  assert.doesNotThrow(() => assertMayGrant(admin, "admin"));
  assert.throws(() => assertMayGrant(admin, "superuser"));
  assert.deepEqual(rolesActorMayGrant(dsp), []);
});

test("nobody manages their own login, and coordinators cannot touch admin or coordinator logins", () => {
  assert.equal(mayManageLogin(admin, { id: "a", role: "admin" }), false);
  assert.equal(mayManageLogin(admin, { id: "x", role: "admin" }), true);
  assert.equal(mayManageLogin(coordinator, { id: "x", role: "admin" }), false);
  assert.equal(mayManageLogin(coordinator, { id: "x", role: "coordinator" }), false);
  assert.equal(mayManageLogin(coordinator, { id: "x", role: "dsp" }), true);
  assert.equal(mayManageLogin(dsp, { id: "x", role: "dsp" }), false);
});

test("the default access follows the job", () => {
  assert.equal(defaultLoginRole("residential_manager"), "coordinator");
  assert.equal(defaultLoginRole("nurse"), "nurse");
  assert.equal(defaultLoginRole("dsp"), "dsp");
  assert.equal(defaultLoginRole("admin"), "admin");
});

test("password rules use the configured minimum", () => {
  assert.match(passwordProblem("short", "short", 10)!, /at least 10/);
  assert.match(passwordProblem("long enough pass", "long enough pasS", 10)!, /do not match/);
  assert.match(passwordProblem("aaaaaaaaaaaa", "aaaaaaaaaaaa", 10)!, /repeated/);
  assert.equal(passwordProblem("blue kettle at noon", "blue kettle at noon", 10), null);
});
