import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, appliesToRole, docState, requirementState, safeFileName, sniffType } from "../src/lib/documents";
import { fill, initialsOf, pdfSafe, sections } from "../src/lib/signing";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

test("file types come from the bytes, not the name", () => {
  assert.equal(sniffType(new TextEncoder().encode("%PDF-1.7 rest")), "application/pdf");
  assert.equal(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffType(new TextEncoder().encode("\0\0\0\x18ftypheic\0\0")), "image/heic");
  assert.equal(sniffType(new TextEncoder().encode("MZ\x90\0 a windows program")), null);
  assert.equal(sniffType(new TextEncoder().encode("<script>alert(1)</script>")), null);
});

test("stored file names are safe and keep the real extension", () => {
  assert.equal(safeFileName("../../etc/passwd.pdf", "application/pdf"), "etcpasswd.pdf");
  assert.equal(safeFileName("My CPR card (front).JPEG", "image/jpeg"), "My-CPR-card-front.jpg");
  assert.equal(safeFileName("évaluation.exe", "application/pdf"), "evaluation.pdf");
  assert.equal(safeFileName("???", "image/png"), "document.png");
});

test("expiry dates add months and handle short months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-10-14", 12), "2027-10-14");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
});

test("a document is valid, expiring, expired or waiting", () => {
  const today = "2026-10-14";
  assert.equal(docState({ status: "approved", expiresOn: "2027-01-01" }, today, 30), "valid");
  assert.equal(docState({ status: "approved", expiresOn: "2026-11-01" }, today, 30), "expiring");
  assert.equal(docState({ status: "approved", expiresOn: "2026-10-13" }, today, 30), "expired");
  assert.equal(docState({ status: "approved", expiresOn: null }, today, 30), "valid");
  assert.equal(docState({ status: "submitted", expiresOn: null }, today, 30), "pending_review");
});

test("a requirement takes the best document, and a request counts as in hand", () => {
  const today = "2026-10-14";
  assert.equal(requirementState([], today, 30, false), "missing");
  assert.equal(requirementState([], today, 30, true), "requested");
  assert.equal(requirementState([{ status: "approved", expiresOn: "2026-01-01" }], today, 30, false), "expired");
  assert.equal(requirementState([{ status: "approved", expiresOn: "2026-01-01" }], today, 30, true), "requested");
  assert.equal(requirementState([{ status: "approved", expiresOn: "2026-01-01" }, { status: "submitted", expiresOn: null }], today, 30, false), "pending_review");
  assert.equal(requirementState([{ status: "rejected", expiresOn: null }, { status: "approved", expiresOn: "2027-06-01" }], today, 30, false), "valid");
  assert.equal(requirementState([{ status: "rejected", expiresOn: null }], today, 30, false), "rejected");
});

test("staff types apply to their roles, or to everyone when none are set", () => {
  assert.equal(appliesToRole([], "nurse"), true);
  assert.equal(appliesToRole(["nurse"], "nurse"), true);
  assert.equal(appliesToRole(["dsp", "residential_manager"], "coordinator"), false);
});

test("documents to sign split into sections and fill in the signer", () => {
  const body = "Intro line\n\n# First\nI, {{name}}, agree.\n# Second\nOn {{date}} at {{agency}}.";
  const parts = sections(fill(body, { name: "Jamal Carter", date: "October 14, 2026", agency: "Milestone" }));
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[1], { heading: "First", text: "I, Jamal Carter, agree." });
  assert.equal(parts[2].text, "On October 14, 2026 at Milestone.");
  assert.equal(initialsOf("Jamal R. Carter"), "JRC");
  assert.equal(pdfSafe("“Quotes” — and it’s fine…"), '"Quotes" - and it\'s fine...');
});
