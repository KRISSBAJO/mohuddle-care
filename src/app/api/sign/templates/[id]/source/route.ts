import { eq } from "drizzle-orm";
import { canManage, getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { storage } from "@/server/docs/storage";

/* An uploaded document-to-sign, for coordinators placing its fields. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canManage(user)) return new Response("Not found.", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found.", { status: 404 });
  const [template] = await db.select({ sourceKey: schema.signTemplates.sourceKey }).from(schema.signTemplates).where(eq(schema.signTemplates.id, id)).limit(1);
  if (!template?.sourceKey) return new Response("Not found.", { status: 404 });
  const file = await storage().read(template.sourceKey);
  return new Response(file.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
