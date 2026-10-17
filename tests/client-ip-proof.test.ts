import test from "node:test";
import assert from "node:assert/strict";
import { clientIpProof, verifiedClientIp } from "../src/lib/client-ip-proof";

test("visitor IP proof rejects tampered, expired, invalid and unsigned client headers", () => {
  const now = Date.now();
  const at = String(now);
  const key = "test-only-proxy-key-12345678901234567890";
  const headers = new Headers({ "x-mohuddle-client-ip": "192.0.2.1", "x-mohuddle-client-ip-at": at, "x-mohuddle-client-ip-signature": clientIpProof("192.0.2.1", at, key) });
  assert.equal(verifiedClientIp(headers, key, now), "192.0.2.1");
  assert.equal(verifiedClientIp(headers, "another-test-key-12345678901234567890", now), null);
  assert.equal(verifiedClientIp(headers, key, now + 301_000), null);
  headers.set("x-mohuddle-client-ip", "192.0.2.2");
  assert.equal(verifiedClientIp(headers, key, now), null);
  headers.set("x-mohuddle-client-ip", "invalid");
  assert.equal(verifiedClientIp(headers, key, now), null);
  assert.equal(verifiedClientIp(new Headers(), key, now), null);
});
