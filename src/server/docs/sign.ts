import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { dateKey, fmt } from "@/lib/format";
import { fill, pdfSafe, sections } from "@/lib/signing";
import { site } from "@/lib/site";
import { db, schema } from "@/server/db";
import { defaultExpiry, DocumentError, storeDocument, tellReviewers, type Owner } from "./service";
import { readAll } from "./storage";

type Template = typeof schema.signTemplates.$inferSelect;

const PAGE = { width: 612, height: 792, margin: 56 };
const INK = rgb(0.07, 0.13, 0.22);
const MUTE = rgb(0.4, 0.45, 0.52);
const LINE = rgb(0.82, 0.85, 0.88);

const isPng = (bytes: Buffer) => bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/* A PNG sent from the signing pad, as raw bytes, checked to be a real, reasonably sized image. */
export function pngFromDataUrl(value: string, what: string) {
  const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new DocumentError(`Add your ${what}.`);
  const bytes = Buffer.from(match[1], "base64");
  if (!isPng(bytes) || bytes.length < 200) throw new DocumentError(`Add your ${what}.`);
  if (bytes.length > 700_000) throw new DocumentError(`Your ${what} image is too large. Clear it and try again.`);
  return bytes;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function fitImage(page: PDFPage, image: PDFImage, box: { x: number; y: number; width: number; height: number }) {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height });
}

function initialBox(page: PDFPage, image: PDFImage, x: number, y: number, font: PDFFont) {
  page.drawRectangle({ x, y, width: 64, height: 30, borderColor: LINE, borderWidth: 0.8, color: rgb(0.98, 0.99, 1) });
  fitImage(page, image, { x: x + 3, y: y + 3, width: 58, height: 24 });
  page.drawText("Initials", { x, y: y - 9, size: 6.5, font, color: MUTE });
}

type Evidence = {
  title: string;
  version: number;
  signerName: string;
  signerRelation: string;
  method: "drawn" | "typed";
  initialsCount: number;
  contentHash: string;
  ip: string;
  userAgent: string;
  consentedAt: Date;
  signedAt: Date;
  reference: string;
};

function signatureBlock(page: PDFPage, signature: PDFImage, y: number, evidence: Evidence, fonts: { regular: PDFFont; bold: PDFFont }) {
  const x = PAGE.margin;
  page.drawText("Signature", { x, y: y + 92, size: 9, font: fonts.bold, color: MUTE });
  fitImage(page, signature, { x, y: y + 22, width: 240, height: 66 });
  page.drawLine({ start: { x, y: y + 18 }, end: { x: x + 260, y: y + 18 }, thickness: 0.8, color: INK });
  page.drawText(pdfSafe(evidence.signerName) + (evidence.signerRelation ? `, ${pdfSafe(evidence.signerRelation)}` : ""), { x, y: y + 5, size: 10, font: fonts.bold, color: INK });
  page.drawText(`Signed electronically on ${fmt.dayLong(dateKey(evidence.signedAt))} at ${fmt.time(evidence.signedAt)} Central time`, { x, y: y - 8, size: 8, font: fonts.regular, color: MUTE });
}

function certificate(pdf: PDFDocument, evidence: Evidence, signature: PDFImage, initials: PDFImage, fonts: { regular: PDFFont; bold: PDFFont }) {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  page.drawText("Certificate of electronic signature", { x: PAGE.margin, y, size: 16, font: fonts.bold, color: INK });
  y -= 18;
  page.drawText(pdfSafe(`${site.legalName} · Mohuddle`), { x: PAGE.margin, y, size: 9, font: fonts.regular, color: MUTE });
  y -= 30;
  const rows: [string, string][] = [
    ["Document", `${evidence.title} (version ${evidence.version})`],
    ["Reference", evidence.reference],
    ["Signer", evidence.signerName + (evidence.signerRelation ? `, ${evidence.signerRelation}` : "")],
    ["Signature method", evidence.method === "drawn" ? "Drawn by hand on screen" : "Typed name in a handwriting style, adopted as signature"],
    ["Initials applied", String(evidence.initialsCount)],
    ["Consent to sign electronically", `${fmt.dayLong(dateKey(evidence.consentedAt))} ${fmt.time(evidence.consentedAt)} Central`],
    ["Signed", `${fmt.dayLong(dateKey(evidence.signedAt))} ${fmt.time(evidence.signedAt)} Central (${evidence.signedAt.toISOString()})`],
    ["IP address", evidence.ip || "Not available"],
    ["Device", evidence.userAgent.slice(0, 160) || "Not available"],
    ["Content fingerprint (SHA-256)", evidence.contentHash],
  ];
  for (const [term, value] of rows) {
    page.drawText(term, { x: PAGE.margin, y, size: 8.5, font: fonts.bold, color: MUTE });
    const lines = wrap(pdfSafe(value), fonts.regular, 9.5, PAGE.width - PAGE.margin * 2 - 170);
    lines.forEach((line, index) => page.drawText(line, { x: PAGE.margin + 170, y: y - index * 12, size: 9.5, font: fonts.regular, color: INK }));
    y -= Math.max(1, lines.length) * 12 + 8;
  }
  y -= 10;
  page.drawText("Adopted signature", { x: PAGE.margin, y, size: 8.5, font: fonts.bold, color: MUTE });
  page.drawText("Adopted initials", { x: PAGE.margin + 300, y, size: 8.5, font: fonts.bold, color: MUTE });
  fitImage(page, signature, { x: PAGE.margin, y: y - 76, width: 240, height: 66 });
  fitImage(page, initials, { x: PAGE.margin + 300, y: y - 56, width: 90, height: 44 });
  y -= 110;
  const statement =
    "The signer agreed to use electronic records and signatures, reviewed the document, applied the initials and signature shown, and confirmed the signature as their own. " +
    "The content fingerprint identifies exactly what was presented for signature; any change to that content produces a different fingerprint. " +
    "This record is kept with the signed document in the agency's document center.";
  wrap(statement, fonts.regular, 8.5, PAGE.width - PAGE.margin * 2).forEach((line, index) => page.drawText(line, { x: PAGE.margin, y: y - index * 11, size: 8.5, font: fonts.regular, color: MUTE }));
}

function footers(pdf: PDFDocument, font: PDFFont, reference: string) {
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    page.drawText(`Reference ${reference} · Page ${index + 1} of ${pages.length}`, { x: PAGE.margin, y: 24, size: 7, font, color: MUTE });
    page.drawText("Signed electronically through Mohuddle", { x: width - PAGE.margin - font.widthOfTextAtSize("Signed electronically through Mohuddle", 7), y: 24, size: 7, font, color: MUTE });
  });
}

/* A written template, laid out with each section initialled, then the signature and the certificate. */
async function textPdf(template: Template, filled: string, evidence: Evidence, signaturePng: Buffer, initialsPng: Buffer) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(evidence.title);
  pdf.setAuthor(evidence.signerName);
  pdf.setProducer("Mohuddle");
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const signature = await pdf.embedPng(signaturePng);
  const initials = await pdf.embedPng(initialsPng);
  const textWidth = PAGE.width - PAGE.margin * 2 - 84;
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  page.drawText(pdfSafe(site.legalName), { x: PAGE.margin, y, size: 9, font: fonts.bold, color: MUTE });
  y -= 26;
  for (const line of wrap(pdfSafe(evidence.title), fonts.bold, 18, PAGE.width - PAGE.margin * 2)) {
    page.drawText(line, { x: PAGE.margin, y, size: 18, font: fonts.bold, color: INK });
    y -= 22;
  }
  y -= 10;
  for (const section of sections(filled)) {
    const lines = wrap(pdfSafe(section.text), fonts.regular, 10.5, textWidth);
    const needed = (section.heading ? 18 : 0) + lines.length * 14.5 + 22;
    if (y - Math.min(needed, 200) < PAGE.margin + 40) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
    const top = y;
    if (section.heading) {
      page.drawText(pdfSafe(section.heading), { x: PAGE.margin, y, size: 11.5, font: fonts.bold, color: INK });
      y -= 18;
    }
    for (const line of lines) {
      if (y < PAGE.margin + 40) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - PAGE.margin;
      }
      page.drawText(line, { x: PAGE.margin, y, size: 10.5, font: fonts.regular, color: INK });
      y -= 14.5;
    }
    if (template.initialEach) initialBox(page, initials, PAGE.width - PAGE.margin - 64, Math.min(top, y + 40) - 26, fonts.regular);
    y -= 16;
  }
  if (y < PAGE.margin + 150) {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
  }
  signatureBlock(page, signature, y - 120, evidence, fonts);
  certificate(pdf, evidence, signature, initials, fonts);
  footers(pdf, fonts.regular, evidence.reference);
  return Buffer.from(await pdf.save());
}

/* An uploaded PDF: initials stamped on every page, then a signature page and the certificate. */
async function sourcePdf(source: Buffer, template: Template, evidence: Evidence, signaturePng: Buffer, initialsPng: Buffer) {
  const pdf = await PDFDocument.load(source);
  pdf.setProducer("Mohuddle");
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const signature = await pdf.embedPng(signaturePng);
  const initials = await pdf.embedPng(initialsPng);
  if (template.initialEach) {
    for (const page of pdf.getPages()) {
      const { width } = page.getSize();
      initialBox(page, initials, width - 36 - 64, 44, fonts.regular);
    }
  }
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  page.drawText(pdfSafe(evidence.title), { x: PAGE.margin, y: PAGE.height - PAGE.margin, size: 16, font: fonts.bold, color: INK });
  page.drawText("I have read every page of this document and agree to it.", { x: PAGE.margin, y: PAGE.height - PAGE.margin - 26, size: 10.5, font: fonts.regular, color: INK });
  signatureBlock(page, signature, PAGE.height - PAGE.margin - 190, evidence, fonts);
  certificate(pdf, evidence, signature, initials, fonts);
  footers(pdf, fonts.regular, evidence.reference);
  return Buffer.from(await pdf.save());
}

/* What the signer is shown, and the fingerprint of it. The same text is rebuilt when they sign. */
export async function signingContent(template: Template, signerName: string) {
  if (template.sourceKey) {
    const source = await readAll(template.sourceKey);
    return { kind: "pdf" as const, source, pages: template.sourcePages ?? 1, contentHash: createHash("sha256").update(source).digest("hex") };
  }
  const filled = fill(template.body, { name: signerName, date: fmt.dayLong(dateKey()), agency: site.legalName });
  return { kind: "text" as const, filled, pages: sections(filled).length, contentHash: createHash("sha256").update(`${template.id}:${template.version}:${filled}`).digest("hex") };
}

/*
 * Signs one requested item: checks every initial was applied, builds the signed PDF, files it in the
 * document center under the template's type, and keeps the evidence.
 */
export async function signItem(input: {
  itemId: string;
  owner: Owner;
  template: Template;
  signerName: string;
  signerRelation: string;
  method: "drawn" | "typed";
  typedName: string;
  typedInitials: string;
  signaturePng: Buffer;
  initialsPng: Buffer;
  initialsCount: number;
  ip: string;
  userAgent: string;
  consentedAt: Date;
  source: "request_link" | "staff_portal";
  uploadedBy: string | null;
}) {
  const content = await signingContent(input.template, input.signerName);
  if (input.template.initialEach && input.initialsCount !== content.pages) {
    throw new DocumentError(`Initial every ${content.kind === "pdf" ? "page" : "section"} before you sign (${input.initialsCount} of ${content.pages} done).`);
  }
  const signedAt = new Date();
  const reference = input.itemId.slice(0, 8).toUpperCase();
  const evidence: Evidence = {
    title: input.template.title,
    version: input.template.version,
    signerName: input.signerName,
    signerRelation: input.signerRelation,
    method: input.method,
    initialsCount: input.initialsCount,
    contentHash: content.contentHash,
    ip: input.ip,
    userAgent: input.userAgent,
    consentedAt: input.consentedAt,
    signedAt,
    reference,
  };
  const bytes =
    content.kind === "pdf"
      ? await sourcePdf(content.source, input.template, evidence, input.signaturePng, input.initialsPng)
      : await textPdf(input.template, content.filled, evidence, input.signaturePng, input.initialsPng);
  const issuedOn = dateKey();
  const doc = await storeDocument({
    bytes,
    fileName: `${input.template.title} signed.pdf`,
    owner: input.owner,
    typeId: input.template.typeId,
    title: input.template.title,
    issuedOn,
    expiresOn: await defaultExpiry(input.template.typeId, issuedOn),
    status: "approved",
    source: input.source,
    uploadedBy: input.uploadedBy,
    uploadedByName: input.signerName,
    requestItemId: input.itemId,
  });
  await db.insert(schema.signatures).values({
    templateId: input.template.id,
    templateVersion: input.template.version,
    requestItemId: input.itemId,
    documentId: doc.id,
    staffId: input.owner.kind === "staff" ? input.owner.staffId : null,
    individualId: input.owner.kind === "person" ? input.owner.individualId : null,
    signerName: input.signerName,
    signerRelation: input.signerRelation,
    method: input.method,
    typedName: input.typedName,
    typedInitials: input.typedInitials,
    initialsCount: input.initialsCount,
    contentHash: content.contentHash,
    signedHash: doc.sha256,
    ip: input.ip,
    userAgent: input.userAgent.slice(0, 400),
    consentedAt: input.consentedAt,
    signedAt,
  });
  await db.update(schema.documentRequestItems).set({ status: "approved", documentId: doc.id }).where(eq(schema.documentRequestItems.id, input.itemId));
  await tellReviewers({ ...doc, title: `${doc.title} (signed)` }, input.signerName, input.uploadedBy ?? undefined);
  return doc;
}
