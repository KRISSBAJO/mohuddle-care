import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { pushTo } from "@/server/push";

export const dynamic = "force-dynamic";

const subscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  device: z.string().max(120).default(""),
  test: z.boolean().default(false),
});

/* Signs this device up for notifications, or moves it to the signed-in login. Optionally sends a test. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const parsed = subscription.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "This browser sent a subscription that could not be read." }, { status: 400 });
  const { endpoint, keys, device, test } = parsed.data;
  // A device belongs to one person per agency: a home's shared tablet follows whoever signed up last.
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), ne(schema.pushSubscriptions.userId, user.id)));
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device })
    .onConflictDoUpdate({ target: [schema.pushSubscriptions.userId, schema.pushSubscriptions.endpoint], set: { p256dh: keys.p256dh, auth: keys.auth, device } });
  if (test) await pushTo([user.id], { title: "Notifications are on", body: "Shift reminders, breaks and alerts will show here.", href: "/app", tag: `push-test-${user.id}` });
  return new Response(null, { status: 204 });
}

/* Stops notifications to this device. */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, user.id)));
  return new Response(null, { status: 204 });
}
