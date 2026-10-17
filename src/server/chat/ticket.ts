import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/*
 * A short-lived pass for the chat's live connection. A signed-in page or phone asks for one, then opens
 * the WebSocket with it, so the socket never carries a password or the long-lived sign-in. It names the
 * user and agency and lasts a minute; the live connection checks the signature.
 */

const LIFETIME_MS = 60_000;
const sign = (value: string) => createHmac("sha256", `chat-ticket:${env.SESSION_SECRET}`).update(value).digest("base64url");

export function chatTicket(userId: string, agencyId: string, now = Date.now()) {
  const value = `${userId}.${agencyId}.${now + LIFETIME_MS}`;
  return `${value}.${sign(value)}`;
}

export function readChatTicket(ticket: string, now = Date.now()): { userId: string; agencyId: string } | null {
  const parts = ticket.split(".");
  if (parts.length !== 4) return null;
  const [userId, agencyId, until, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${agencyId}.${until}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!(Number(until) > now)) return null;
  return { userId, agencyId };
}
