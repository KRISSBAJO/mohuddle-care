import assert from "node:assert/strict";
import { test } from "node:test";
import { base32Decode, base32Encode, checkCode, codeAt, newSecret, stepOf } from "../src/lib/totp";

// RFC 6238, appendix B: the SHA-1 secret "12345678901234567890" and its 8-digit codes.
const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

test("codes match the RFC 6238 test vectors", () => {
  assert.equal(codeAt(rfcSecret, Math.floor(59 / 30), 8), "94287082");
  assert.equal(codeAt(rfcSecret, Math.floor(1111111109 / 30), 8), "07081804");
  assert.equal(codeAt(rfcSecret, Math.floor(1234567890 / 30), 8), "89005924");
  assert.equal(codeAt(rfcSecret, Math.floor(2000000000 / 30), 8), "69279037");
});

test("base32 round-trips, and new secrets are 32 characters", () => {
  const bytes = Buffer.from("any bytes at all \u0000ÿ");
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  assert.match(newSecret(), /^[A-Z2-7]{32}$/);
});

test("a code works for its 30 seconds and one step either side, not further", () => {
  const secret = newSecret();
  const now = Date.UTC(2026, 9, 15, 12, 0, 10);
  const step = stepOf(now);
  assert.equal(checkCode(secret, codeAt(secret, step), now), step);
  assert.equal(checkCode(secret, codeAt(secret, step - 1), now), step - 1);
  assert.equal(checkCode(secret, codeAt(secret, step + 1), now), step + 1);
  assert.equal(checkCode(secret, codeAt(secret, step - 2), now), null);
  assert.equal(checkCode(secret, "12345", now), null);
  assert.equal(checkCode(secret, `${codeAt(secret, step).slice(0, 3)} ${codeAt(secret, step).slice(3)}`, now), step, "Spaces are fine");
});
