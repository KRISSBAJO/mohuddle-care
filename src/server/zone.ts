import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { env } from "./env";

/*
 * The agency's time zone for a signed-in request. The date helpers run synchronously, deep inside
 * pages, so they cannot wait for a database lookup: the zone travels in a signed cookie set when the
 * session starts, and is read from the request Next is serving.
 */

export const ZONE_COOKIE = "ms_zone";

const signature = (value: string) => createHmac("sha256", env.SESSION_SECRET).update(`zone:${value}`).digest("base64url");

export const signedZone = (value: string) => `${value}~${signature(value)}`;

/* The zone in a cookie value, if it is ours, unchanged and a real time zone. */
export function readZone(raw: string | undefined) {
  if (!raw) return null;
  const at = raw.lastIndexOf("~");
  if (at < 1) return null;
  const value = raw.slice(0, at);
  const given = Buffer.from(raw.slice(at + 1));
  const expected = Buffer.from(signature(value));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/* The zone of the request being served, or null outside a request or before a session. */
export function requestZone() {
  const store = workUnitAsyncStorage.getStore();
  if (!store || store.type !== "request") return null;
  return readZone(store.cookies.get(ZONE_COOKIE)?.value);
}
