import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";

// Building the PDF needs no database, but the module checks its settings when loaded.
process.env.DATABASE_URL ??= "postgres://unused@127.0.0.1:1/unused";
process.env.SESSION_SECRET ??= "test-only-session-secret-not-used-anywhere";
const sign = () => import("../src/server/docs/sign");

// A 1x1 PNG stands in for the signature and initials.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const evidence = {
  title: "Sample form",
  version: 1,
  signerName: "Pat Example",
  signerRelation: "",
  method: "typed" as const,
  initialsCount: 0,
  contentHash: "0".repeat(64),
  ip: "127.0.0.1",
  userAgent: "test",
  consentedAt: new Date("2026-10-14T15:00:00Z"),
  signedAt: new Date("2026-10-14T15:01:00Z"),
  reference: "TEST-REF",
  agency: "Example Agency",
};

async function sample(pages: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) pdf.addPage([612, 792]);
  return Buffer.from(await pdf.save());
}

type Template = Parameters<typeof import("../src/server/docs/sign").sourcePdf>[1];
const template = (extra: Partial<Template>) => ({ fields: [], initialEach: false, ...extra }) as Template;

test("uploaded pages grow a strip below for the footer, and nothing on them moves", async () => {
  const { sourcePdf } = await sign();
  const signed = await PDFDocument.load(
    await sourcePdf(await sample(2), template({ fields: [{ id: "sig", kind: "signature", page: 1, x: 0.5, y: 0.6, w: 0.3, h: 0.07 }] }), evidence, png, png),
  );
  const [first, second, certificate] = signed.getPages();
  for (const page of [first, second]) {
    const crop = page.getCropBox();
    assert.equal(crop.y, -22);
    assert.equal(crop.height, 792 + 22);
    assert.equal(page.getMediaBox().y, -22);
  }
  // Pages Mohuddle adds keep their own size.
  assert.equal(certificate.getCropBox().y, 0);
  assert.equal(signed.getPageCount(), 3);
});

test("without fields, initials go in a taller strip below each page", async () => {
  const { sourcePdf } = await sign();
  const signed = await PDFDocument.load(await sourcePdf(await sample(1), template({ initialEach: true }), { ...evidence, initialsCount: 1 }, png, png));
  const first = signed.getPage(0);
  assert.equal(first.getCropBox().y, -66);
  // The form page, a signature page and the certificate.
  assert.equal(signed.getPageCount(), 3);
});

test("rotated pages get no strip", async () => {
  const { sourcePdf } = await sign();
  const pdf = await PDFDocument.load(await sample(1));
  pdf.getPage(0).setRotation({ type: "degrees" as never, angle: 90 } as never);
  const rotated = Buffer.from(await pdf.save());
  const signed = await PDFDocument.load(await sourcePdf(rotated, template({ initialEach: true }), evidence, png, png));
  assert.equal(signed.getPage(0).getCropBox().y, 0);
});
