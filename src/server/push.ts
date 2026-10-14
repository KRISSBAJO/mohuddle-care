import "server-only";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/server/db";

/*
 * Phone and browser notifications through the browsers' own push services (free; Apple, Google and
 * Mozilla each run one). The message is encrypted for the device; the push service cannot read it.
 * Without keys in .env, pushing is simply off and the in-app bell still works.
 */

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.test";

export const pushPublicKey = PUBLIC;
export const pushEnabled = Boolean(PUBLIC && PRIVATE);
if (pushEnabled) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

export type PushMessage = { title: string; body?: string; href?: string; tone?: string; tag?: string };

/* Sends to every device the logins signed up. Devices the push service says are gone are removed. */
export async function pushTo(userIds: string[], message: PushMessage) {
  if (!pushEnabled || !userIds.length) return 0;
  const devices = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, userIds));
  const payload = JSON.stringify({ title: message.title, body: message.body ?? "", href: message.href || "/app", tag: message.tag, tone: message.tone ?? "info" });
  let sent = 0;
  await Promise.all(
    devices.map(async device => {
      try {
        await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, {
          TTL: 6 * 3600,
          urgency: message.tone === "bad" ? "high" : "normal",
          topic: message.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        sent += 1;
        await db.update(schema.pushSubscriptions).set({ lastSentAt: new Date() }).where(eq(schema.pushSubscriptions.id, device.id));
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, device.id));
        else console.error("Push failed", status ?? error);
      }
    }),
  );
  return sent;
}
