import assert from "node:assert/strict";
import { test } from "node:test";
import { agencyOrigin, readHost, sharedOrigin } from "../src/lib/agency-host";

test("an address says which agency, the shared sign-in, or the main site", () => {
  assert.deepEqual(readHost("milestone.mohuddle.com", "mohuddle.com"), { kind: "agency", slug: "milestone" });
  assert.deepEqual(readHost("Milestone.Mohuddle.com", "mohuddle.com"), { kind: "agency", slug: "milestone" });
  assert.deepEqual(readHost("app.mohuddle.com", "mohuddle.com"), { kind: "shared" });
  assert.deepEqual(readHost("mohuddle.com", "mohuddle.com"), { kind: "main" });
  assert.deepEqual(readHost("www.mohuddle.com", "mohuddle.com"), { kind: "main" });
  // Deeper names, other sites and missing hosts are never taken for an agency.
  assert.deepEqual(readHost("a.b.mohuddle.com", "mohuddle.com"), { kind: "main" });
  assert.deepEqual(readHost("milestone.mohuddle.com.evil.example", "mohuddle.com"), { kind: "main" });
  assert.deepEqual(readHost("evilmohuddle.com", "mohuddle.com"), { kind: "main" });
  assert.deepEqual(readHost(null, "mohuddle.com"), { kind: "main" });
  // On this machine the port is part of the address.
  assert.deepEqual(readHost("milestone.localhost:3400", "localhost:3400"), { kind: "agency", slug: "milestone" });
  assert.deepEqual(readHost("localhost:3400", "localhost:3400"), { kind: "main" });
  assert.deepEqual(readHost("milestone.localhost:3999", "localhost:3400"), { kind: "main" });
});

test("agency and shared addresses are built from APP_URL", () => {
  assert.equal(agencyOrigin("milestone", "https://mohuddle.com"), "https://milestone.mohuddle.com");
  assert.equal(agencyOrigin("milestone", "http://localhost:3400/"), "http://milestone.localhost:3400");
  assert.equal(sharedOrigin("https://mohuddle.com"), "https://app.mohuddle.com");
});
