import "server-only";
import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { phoneScreenFor } from "@/lib/phone-screens";
import { pushWords } from "@/lib/push-words";
import { db, schema } from "@/server/db";
import { getSettings } from "@/server/settings";
import type { PushMessage } from "@/server/push";

/*
 * Notifications to the Mohuddle phone app, through Expo's push service (free), which hands them to
 * Apple and Google. Unlike browser push these are not end-to-end encrypted, so the agency setting
 * phone_push_detail decides what they carry: by default only "You have a new alert", and staff read
 * the detail inside the app. Each phone's address lives on its sign-in session, so signing out a
 * phone also stops its notifications.
 */

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

export async function pushToPhones(userIds: string[], message: PushMessage & { notificationIds?: Record<string, string> }) {
  if (!userIds.length) return 0;
  const phones = await db
    .select({ tokenHash: schema.sessions.tokenHash, userId: schema.sessions.userId, pushToken: schema.sessions.pushToken, role: schema.users.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(inArray(schema.sessions.userId, userIds), isNotNull(schema.sessions.pushToken), isNotNull(schema.sessions.device), gt(schema.sessions.expiresAt, new Date())));
  if (!phones.length) return 0;

  const words = pushWords((await getSettings()).phone_push_detail, message);
  const messages = phones.map(phone => ({
    to: phone.pushToken!,
    ...words,
    sound: "default",
    priority: message.tone === "bad" ? "high" : "default",
    channelId: "alerts",
    // Tapping opens the matching screen, or the app's Alerts list when the page is only on the website.
    data: { screen: phoneScreenFor(message.href ?? "", phone.role === "admin" || phone.role === "coordinator") ?? "/alerts", notificationId: message.notificationIds?.[phone.userId] ?? "" },
  }));

  let sent = 0;
  const gone: string[] = [];
  for (let start = 0; start < messages.length; start += 100) {
    const batch = messages.slice(start, start + 100);
    const response = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`Expo push answered ${response.status}`);
    const { data } = (await response.json()) as { data: Ticket[] };
    data.forEach((ticket, index) => {
      if (ticket.status === "ok") sent += 1;
      else if (ticket.details?.error === "DeviceNotRegistered") gone.push(phones[start + index].tokenHash);
      else console.error("Phone push refused", ticket.details?.error ?? ticket.message);
    });
  }
  // The app was removed or notifications turned off: stop sending to that phone.
  if (gone.length) await db.update(schema.sessions).set({ pushToken: null }).where(inArray(schema.sessions.tokenHash, gone));
  return sent;
}
