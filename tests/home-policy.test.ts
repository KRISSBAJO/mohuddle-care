import assert from "node:assert/strict";
import { test } from "node:test";
import { mayDeleteExpense, mayManageHome, mayReviewExpense, needsApproval } from "../src/lib/home-policy";
import { monthRange, parseMoney, shiftMonth } from "../src/lib/format";

const home = { managerStaffId: "staff-marcus" };
const coordinator = { id: "u-angela", role: "coordinator", staffId: "staff-angela" };
const manager = { id: "u-marcus", role: "dsp", staffId: "staff-marcus" };
const dsp = { id: "u-jamal", role: "dsp", staffId: "staff-jamal" };

test("small expenses are approved on entry; larger ones and a zero threshold wait", () => {
  assert.equal(needsApproval(10_000, 100), false);
  assert.equal(needsApproval(10_001, 100), true);
  assert.equal(needsApproval(500, 0), true);
});

test("coordinators and the home manager review expenses, never their own", () => {
  assert.equal(mayReviewExpense(coordinator, { submittedBy: "u-jamal" }, home), true);
  assert.equal(mayReviewExpense(manager, { submittedBy: "u-jamal" }, home), true);
  assert.equal(mayReviewExpense(manager, { submittedBy: "u-jamal" }, { managerStaffId: "someone-else" }), false);
  assert.equal(mayReviewExpense(dsp, { submittedBy: "u-marcus" }, home), false);
  assert.equal(mayReviewExpense(coordinator, { submittedBy: "u-angela" }, home), false, "no self-approval");
});

test("a submitter may withdraw a waiting expense, not an approved one", () => {
  assert.equal(mayDeleteExpense(dsp, { submittedBy: "u-jamal", status: "pending" }, home), true);
  assert.equal(mayDeleteExpense(dsp, { submittedBy: "u-jamal", status: "approved" }, home), false);
  assert.equal(mayDeleteExpense(coordinator, { submittedBy: "u-jamal", status: "approved" }, home), true);
  assert.equal(mayManageHome(manager, home), true);
  assert.equal(mayManageHome(dsp, home), false);
});

test("money and months parse safely", () => {
  assert.equal(parseMoney("$1,234.50"), 123_450);
  assert.equal(parseMoney("12"), 1_200);
  assert.equal(parseMoney("12.345"), null);
  assert.equal(parseMoney("-5"), null);
  assert.equal(parseMoney("abc"), null);
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-11", 2), "2027-01");
});
