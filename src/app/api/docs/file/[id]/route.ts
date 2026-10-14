import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { canView } from "@/server/docs/service";
import { storage } from "@/server/docs/storage";

/*
 * Opens a stored document for someone allowed to see it, and records that they did. Files are never
 * cached and never served from a public address.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in to open documents.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found.", { status: 404 });
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1);
  if (!doc || !canView(user, doc)) return new Response("Not found.", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const file = await storage().read(doc.storageKey);
  await db.insert(schema.auditLog).values({ userId: user.id, action: download ? "document:download" : "document:view", entity: "document", entityId: doc.id });
  return new Response(file.body, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
