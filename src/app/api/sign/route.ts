import { NextResponse } from "next/server";
import { z } from "zod";
import { signAccess } from "@/server/docs/sign-access";
import { DocumentError } from "@/server/docs/service";
import { pngFromDataUrl, signItem } from "@/server/docs/sign";

const input = z.object({
  itemId: z.uuid(),
  token: z.string().max(100).nullable().default(null),
  method: z.enum(["drawn", "typed"]),
  typedName: z.string().max(120).default(""),
  typedInitials: z.string().max(8).default(""),
  signature: z.string().max(1_000_000),
  initials: z.string().max(1_000_000),
  initialsCount: z.number().int().min(0).max(500),
  appliedFields: z.array(z.string().max(40)).max(400).default([]),
  consent: z.literal(true),
  consentedAt: z.iso.datetime(),
});

/* Applies a signature to a requested document and files the signed copy. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400 });
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.some(issue => issue.path[0] === "consent") ? "Agree to sign electronically first." : "Refresh the page and try again." }, { status: 400 });
  const data = parsed.data;
  const access = await signAccess(data.itemId, data.token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: 403 });
  if (access.item.status === "approved") return NextResponse.json({ error: "This document has already been signed." }, { status: 409 });
  const consentedAt = new Date(data.consentedAt);
  if (Math.abs(consentedAt.getTime() - Date.now()) > 6 * 3_600_000) return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400 });
  try {
    const doc = await signItem({
      itemId: access.item.id,
      owner: access.owner,
      template: access.template,
      signerName: access.signerName,
      signerRelation: access.signerRelation,
      method: data.method,
      typedName: data.typedName,
      typedInitials: data.typedInitials,
      signaturePng: pngFromDataUrl(data.signature, "signature"),
      initialsPng: pngFromDataUrl(data.initials, "initials"),
      initialsCount: data.initialsCount,
      appliedFields: data.appliedFields,
      ip: (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0].trim(),
      userAgent: request.headers.get("user-agent") ?? "",
      consentedAt,
      source: access.source,
      uploadedBy: access.userId,
    });
    return NextResponse.json({ ok: true, id: doc.id });
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Signing failed", error);
    return NextResponse.json({ error: "The document could not be signed. Try again." }, { status: 500 });
  }
}
