import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";

// RelyKit is switched on with a test key, and every request is caught below: nothing leaves this machine.
process.env.EMAIL_PROVIDER = "relykit";
process.env.RELYKIT_API_KEY = "test-only-key";
process.env.RELYKIT_URL = "http://relykit.invalid";
process.env.EMAIL_FROM = "Mohuddle <noreply@send.example.invalid>";

const skip = process.env.RUN_DB_TESTS !== "1";

test("an email goes to RelyKit as the agency, is recorded, and test addresses never leave", { skip }, async () => {
  const { asAgency, db, pool, schema, systemPool } = await import("../src/server/db");
  const { agencyIdBySlug } = await import("../src/server/agency");
  const { sendEmail, isReservedAddress } = await import("../src/server/email");
  const milestone = await agencyIdBySlug("milestone");
  assert.ok(milestone);
  const realFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: object = { id: "msg_test_1", status: "queued" };
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status: 201, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const subject = `EMAILTEST ${Date.now()}`;
  try {
    assert.equal(isReservedAddress("pat@example.test"), true);
    assert.equal(isReservedAddress("pat@sub.example.com"), true);
    assert.equal(isReservedAddress("pat@milestonecare.net"), false);

    await asAgency(milestone, async () => {
      // A test address is refused before RelyKit is asked.
      const blocked = await sendEmail("test", "pat@example.test", { subject, text: "x", html: "<p>x</p>" });
      assert.equal(blocked.status, "failed");
      assert.equal(calls.length, 0);

      const sent = await sendEmail("test", "Staff.Member@Milestone-Recipient.org", { subject, text: "Hello", html: "<p>Hello</p>" });
      assert.equal(sent.status, "queued");
      assert.equal(calls.length, 1);
      const request = calls[0];
      assert.equal(request.url, "http://relykit.invalid/emails");
      const headers = request.init.headers as Record<string, string>;
      assert.equal(headers.authorization, "Bearer test-only-key");
      assert.ok(headers["Idempotency-Key"]);
      const body = JSON.parse(String(request.init.body));
      assert.equal(body.from, '"Milestone via Mohuddle" <noreply@send.example.invalid>');
      assert.deepEqual(body.to, ["staff.member@milestone-recipient.org"]);
      assert.equal(body.subject, subject);

      // An address RelyKit has suppressed comes back accepted but cancelled: recorded as failed.
      reply = { id: "msg_test_2", status: "cancelled", last_error: "suppressed: bounced" };
      const cancelled = await sendEmail("test", "bounced@milestone-recipient.org", { subject, text: "x", html: "x" });
      assert.equal(cancelled.status, "failed");

      const rows = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.subject, subject));
      assert.equal(rows.length, 3, "Every attempt is recorded");
      assert.deepEqual(rows.map(row => row.status).sort(), ["failed", "failed", "queued"]);
      assert.ok(rows.every(row => row.agencyId === milestone));
    });
  } finally {
    globalThis.fetch = realFetch;
    await systemPool.query("delete from email_messages where subject like $1", ["EMAILTEST %"]);
    await pool.end();
    await systemPool.end();
  }

});
