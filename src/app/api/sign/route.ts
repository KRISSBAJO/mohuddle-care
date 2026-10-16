import { NextResponse } from "next/server";
import { z } from "zod";
import { asLinkAgency } from "@/server/docs/requests";
import { DocumentError } from "@/server/docs/service";
import { pngFromDataUrl } from "@/server/docs/sign";
import { clientIp, signRequested } from "@/server/docs/sign-request";

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
  return asLinkAgency(data.token, () => sign(data, request));
}

async function sign(data: z.infer<typeof input>, request: Request) {
  let signaturePng: Buffer;
  let initialsPng: Buffer;
  try {
    signaturePng = pngFromDataUrl(data.signature, "signature");
    initialsPng = pngFromDataUrl(data.initials, "initials");
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const result = await signRequested({ ...data, signaturePng, initialsPng, consentedAt: new Date(data.consentedAt), ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" });
  return NextResponse.json(result.ok ? { ok: true, id: result.id } : { error: result.error }, { status: result.ok ? 200 : result.status });
}
