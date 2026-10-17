import test from "node:test";
import assert from "node:assert/strict";
import { handleDemoRequest } from "../src/lib/demo-request";

const origin = "https://care.mohuddle.com";
const request = (body: string, source = origin) => new Request(`${origin}/api/enquiries`, { method: "POST", headers: { origin: source, "content-type": "application/json" }, body });
test("demo API refuses foreign origins before saving", async () => {
  const r = await handleDemoRequest(request("{}", "https://untrusted.example"), origin, async () => { throw new Error("must not save"); });
  assert.equal(r.status, 403);
});
test("demo API bounds request size even without content-length", async () => {
  const r = await handleDemoRequest(request(JSON.stringify({ message: "x".repeat(20_000) })), origin, async () => { throw new Error("must not save"); });
  assert.equal(r.status, 413);
});
test("demo API validates shape and always targets the product demo inbox", async () => {
  assert.equal((await handleDemoRequest(request('{"name":{}}'), origin, async () => ({ ok: true }))).status, 400);
  const r = await handleDemoRequest(request('{"name":"Test","kind":"contact"}'), origin, async data => {
    assert.equal(data.get("kind"), "demo");
    assert.equal(data.get("name"), "Test");
    return { ok: true };
  });
  assert.equal(r.status, 200);
});
