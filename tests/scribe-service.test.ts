import test from "node:test";
import assert from "node:assert/strict";
import { scribeService } from "../src/lib/scribe-service";

const key = "test-only-speech-service-key-1234567890";
test("speech transport is optional and rejects incomplete or insecure configuration", () => {
  assert.equal(scribeService(undefined, undefined), null);
  for (const url of ["http://voice.example.com", "https://name:password@voice.example.com", "https://voice.example.com?token=x"]) assert.throws(() => scribeService(url, key));
  assert.throws(() => scribeService("https://voice.example.com", "short"));
});
test("speech transport sends binary audio with server auth and refuses redirects", async () => {
  const client = scribeService("https://voice.example.com", key, async (url, options) => {
    assert.equal(url, "https://voice.example.com/transcribe");
    assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${key}`);
    assert.equal(options?.redirect, "error");
    assert.equal(options?.credentials, "omit");
    assert.deepEqual(Array.from(options?.body as Uint8Array), [1, 2]);
    return Response.json({ text: "Synthetic test" });
  })!;
  assert.deepEqual(await client.json("/transcribe", { method: "POST", body: new Uint8Array([1, 2]) }), { text: "Synthetic test" });
  await assert.rejects(client.raw("//different.example/path"));
});
test("speech transport hides upstream error details", async () => {
  const client = scribeService("https://voice.example.com", key, async () => new Response("private upstream details", { status: 500 }))!;
  await assert.rejects(client.json("/health"), error => error instanceof Error && !error.message.includes("private"));
});
