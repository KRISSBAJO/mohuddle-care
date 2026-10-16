import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { photoFile } from "@/server/incident-photos";

/* Shows an incident photo to signed-in staff of its agency, and records that they looked. Never cached. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in to see photos.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found.", { status: 404 });
  const file = await photoFile(id);
  if (!file) return new Response("Not found.", { status: 404 });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "incident:photo_view", entity: "incident_photo", entityId: id });
  return new Response(file.body, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...(file.size ? { "Content-Length": String(file.size) } : {}) },
  });
}
