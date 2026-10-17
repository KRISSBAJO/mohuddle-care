import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Temporary deployment check: authenticated, allowlisted and hashed. Never logs raw IP headers.
export async function GET(request: Request) {
  const key = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  if (!key || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response(null, { status: 404 });
  }
  const digest = (value: string) => createHmac("sha256", key).update(value.trim()).digest("hex").slice(0, 24);
  const names = ["x-forwarded-for", "x-real-ip", "true-client-ip", "cf-connecting-ip", "x-vercel-forwarded-for"];
  const headers = Object.fromEntries(names.map(name => [name, request.headers.get(name)?.split(",").map(digest) ?? []]));
  return Response.json({ headers }, { headers: { "Cache-Control": "private, no-store" } });
}
