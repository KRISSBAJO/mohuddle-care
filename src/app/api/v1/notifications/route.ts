import { desc, eq, sql } from "drizzle-orm";
import { phoneScreenFor } from "@/lib/phone-screens";
import { canManage } from "@/server/auth";
import { db, schema } from "@/server/db";
import { phoneRoute, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

/* The phone's Alerts list: the same messages as the bell on the website, newest first, unread on top. ?count=1 gives just the unread count. */
export const GET = phoneRoute(async (user, request) => {
  const [{ unread }] = await db.select({ unread: sql<number>`count(*) filter (where ${schema.notifications.readAt} is null)::int` }).from(schema.notifications).where(eq(schema.notifications.userId, user.id));
  if (new URL(request.url).searchParams.get("count")) return reply({ unread });
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(sql`${schema.notifications.readAt} is not null`, desc(schema.notifications.createdAt))
    .limit(40);
  const manager = canManage(user);
  return reply({
    unread,
    items: rows.map(row => {
      const screen = phoneScreenFor(row.href, manager);
      return { id: row.id, title: row.title, body: row.body, tone: row.tone, at: row.createdAt, read: Boolean(row.readAt), screen, web: !screen && row.href ? row.href : null };
    }),
  });
});
