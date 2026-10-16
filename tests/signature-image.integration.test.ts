import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("the phone's typed and drawn signatures become PNG images; empty ones are refused", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const { drawnImage, typedImage } = await import("../src/server/docs/signature-image");
  const typed = typedImage("Pat Lee", "caveat", "signature");
  assert.deepEqual(typed.subarray(0, 4), PNG);
  assert.ok(typed.length > 500);
  const wave: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 10, 40 + (i % 2) * 20]);
  assert.deepEqual(drawnImage([wave], { width: 300, height: 120 }, "signature").subarray(0, 4), PNG);
  assert.throws(() => typedImage("  ", "caveat", "initials"), /Type your initials/);
  assert.throws(() => drawnImage([[[1, 1]]], { width: 300, height: 120 }, "signature"), /Draw your signature/);
});
