import { systemPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Readiness probes reveal no agency data, credentials or database error details.
export async function GET() {
  try {
    const probe = { text: "select 1 from drizzle.__drizzle_migrations limit 1", query_timeout: 3000 };
    await systemPool.query(probe);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
