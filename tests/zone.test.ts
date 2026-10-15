import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey, DEFAULT_ZONE, fmt, setZoneSource, zone, zonedTime, zoneLabel } from "../src/lib/format";

// The zone helpers need no database, but the server module checks its settings when loaded.
process.env.DATABASE_URL ??= "postgres://unused@127.0.0.1:1/unused";
process.env.SESSION_SECRET ??= "test-only-session-secret-not-used-anywhere";

test("dates follow the agency's time zone, and Central when none is known", () => {
  setZoneSource(undefined);
  assert.equal(zone(), DEFAULT_ZONE);
  // 05:30 UTC on 1 July is still 30 June in Los Angeles, but already 1 July in Chicago.
  const moment = new Date("2026-07-01T05:30:00Z");
  assert.equal(dateKey(moment), "2026-07-01");
  try {
    setZoneSource(() => "America/Los_Angeles");
    assert.equal(dateKey(moment), "2026-06-30");
    assert.equal(zonedTime("2026-07-01", "09:00").toISOString(), "2026-07-01T16:00:00.000Z");
    assert.equal(fmt.time(new Date("2026-07-01T16:00:00Z")), "9:00 AM");
    assert.equal(zoneLabel(), "Pacific time");
    setZoneSource(() => "America/Phoenix");
    assert.equal(zoneLabel(), "Mountain time");
    // Daylight saving: New York in winter is five hours behind UTC.
    setZoneSource(() => "America/New_York");
    assert.equal(zonedTime("2026-01-15", "09:00").toISOString(), "2026-01-15T14:00:00.000Z");
  } finally {
    setZoneSource(undefined);
  }
});

test("the zone cookie is only believed when Mohuddle signed it", async () => {
  const { readZone, signedZone } = await import("../src/server/zone");
  assert.equal(readZone(signedZone("America/Denver")), "America/Denver");
  assert.equal(readZone(signedZone("America/Denver").replace("Denver", "Chicago")), null, "A changed zone fails its signature");
  assert.equal(readZone("America/Denver"), null);
  assert.equal(readZone(signedZone("Not/AZone")), null, "Even signed, it must be a real time zone");
  assert.equal(readZone(undefined), null);
});
