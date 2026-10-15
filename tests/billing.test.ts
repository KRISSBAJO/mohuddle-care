import assert from "node:assert/strict";
import { test } from "node:test";
import { billingState, monthlyCents } from "../src/lib/billing";

const rules = { trialDays: 14, graceDays: 14, warnDays: 7 };
const at = (status: "trial" | "active" | "complimentary" | "cancelled", trialEndsOn: string | null, paidUntil: string | null, today: string) => billingState({ status, trialEndsOn, paidUntil }, today, rules);

test("a trial warns in its last week and is read-only the day after it ends, with no grace", () => {
  assert.equal(at("trial", "2026-11-30", null, "2026-11-01").mode, "ok");
  assert.equal(at("trial", "2026-11-30", null, "2026-11-23").mode, "ending");
  assert.equal(at("trial", "2026-11-30", null, "2026-11-30").mode, "ending");
  assert.equal(at("trial", "2026-11-30", null, "2026-12-01").mode, "read_only");
  assert.equal(at("trial", null, null, "2026-12-01").mode, "read_only", "A trial with no end date is not a free pass");
});

test("a paid period warns, then has grace days while past due, then is read-only", () => {
  assert.equal(at("active", null, "2026-11-30", "2026-11-01").mode, "ok");
  assert.equal(at("active", null, "2026-11-30", "2026-11-24").mode, "ending");
  const lapsed = at("active", null, "2026-11-30", "2026-12-05");
  assert.equal(lapsed.mode, "past_due");
  assert.equal("graceEndsOn" in lapsed ? lapsed.graceEndsOn : null, "2026-12-14");
  assert.equal(at("active", null, "2026-11-30", "2026-12-14").mode, "past_due");
  assert.equal(at("active", null, "2026-11-30", "2026-12-15").mode, "read_only");
  assert.equal(at("active", null, null, "2026-12-15").mode, "ok", "Paying with no end date set yet");
});

test("complimentary never ends; cancelled is read-only", () => {
  assert.equal(at("complimentary", null, "2020-01-01", "2026-12-15").mode, "ok");
  assert.equal(at("cancelled", null, "2030-01-01", "2026-12-15").mode, "read_only");
});

test("a plan's monthly price is its base plus each counted unit", () => {
  assert.equal(monthlyCents({ baseCents: 4900, unitCents: 600, unit: "person" }, 8), 9700);
  assert.equal(monthlyCents({ baseCents: 4900, unitCents: 600, unit: "none" }, 8), 4900);
});
