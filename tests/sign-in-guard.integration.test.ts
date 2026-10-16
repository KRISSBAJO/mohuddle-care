import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { like } from "drizzle-orm";

const skip = process.env.RUN_DB_TESTS !== "1";

test("wrong passwords pause sign-in for that email, and a right one clears them", { skip }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "Use a development database only.");
  const { schema, systemDb, pool, systemPool } = await import("../src/server/db");
  const { DEFAULT_SIGN_IN_LIMITS, signInFailed, signInPaused, signInSucceeded } = await import("../src/server/sign-in-guard");
  const tag = randomBytes(4).toString("hex");
  const email = `guard-${tag}@example.test`;
  const home = `198.51.100.${Math.floor(Math.random() * 200)}`;
  const away = (n: number) => `203.0.113.${n}`;
  const { tries, perPlace } = DEFAULT_SIGN_IN_LIMITS;
  try {
    assert.equal(await signInPaused(email, home), null);
    for (let n = 0; n < tries - 1; n++) await signInFailed(email, home);
    assert.equal(await signInPaused(email, home), null, "one short of the limit still signs in");
    await signInFailed(email, home);
    assert.match((await signInPaused(email.toUpperCase(), home)) ?? "", /Too many wrong tries/, "paused, whatever the case of the email");

    // Someone guessing from elsewhere does not lock the person out at their own place, until the looser limit.
    assert.equal(await signInPaused(email, away(1)), null);
    await signInSucceeded(email, home);
    assert.equal(await signInPaused(email, home), null, "a right password clears this place's wrong tries");

    for (let n = 0; n < tries * 4; n++) await signInFailed(email, away(n % 50));
    assert.ok(await signInPaused(email, home), "many places at once pause the email everywhere");

    // One place trying many emails.
    const place = away(250);
    for (let n = 0; n < perPlace; n++) await signInFailed(`guard-${tag}-${n}@example.test`, place);
    assert.ok(await signInPaused(`guard-${tag}-new@example.test`, place), "one place guessing many emails is paused");
    assert.equal(await signInPaused(`guard-${tag}-new@example.test`, away(251)), null, "other places are not");
  } finally {
    await systemDb.delete(schema.signInFailures).where(like(schema.signInFailures.email, `guard-${tag}%`));
    await pool.end();
    await systemPool.end();
  }
});
