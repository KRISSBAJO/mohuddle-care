import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { phoneRoute, reply } from "@/server/mobile/api";

export const dynamic = "force-dynamic";

const body = z.object({ id: z.uuid().optional() });

/* Marks one alert read, or all of them when no id is given. */
export const POST = phoneRoute(async (user, request) => {
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  const id = parsed.success ? parsed.data.id : undefined;
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt), ...(id ? [eq(schema.notifications.id, id)] : [])));
  return reply({ ok: true });
});
