import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/guard";

/* Opens a notification: marks it read for the signed-in person, then goes to what it is about. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/app/notifications");
  const [row] = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, user.id)))
    .returning({ href: schema.notifications.href });
  // Only ever go somewhere inside the Hub.
  redirect(row?.href && row.href.startsWith("/app") && !row.href.startsWith("//") ? row.href : "/app/notifications");
}
