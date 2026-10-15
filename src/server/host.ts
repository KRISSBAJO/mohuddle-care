import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { agencyOrigin, readHost } from "@/lib/agency-host";
import { schema, systemDb } from "./db";
import { env } from "./env";

/* Whether agencies are used at their own addresses (AGENCY_ADDRESSES=on). */
export const addressesOn = () => env.AGENCY_ADDRESSES === "on";

const baseHost = () => new URL(env.APP_URL).host;

/* What the address of this request says: an agency's own, the shared sign-in, or the main one. */
export async function requestHost() {
  return readHost((await headers()).get("host"), baseHost());
}

/* The agency whose address this is, or null on the main and shared addresses. "missing" when none uses it. */
export async function hostAgency() {
  const host = await requestHost();
  if (host.kind !== "agency") return null;
  const [agency] = await systemDb
    .select({ id: schema.agencies.id, slug: schema.agencies.slug, name: schema.agencies.name, active: schema.agencies.active })
    .from(schema.agencies)
    .where(eq(schema.agencies.slug, host.slug))
    .limit(1);
  return agency && agency.active ? agency : ("missing" as const);
}

/* Where links for an agency should point: its own address when addresses are on, else APP_URL. */
export const agencyBase = (slug: string) => (addressesOn() ? agencyOrigin(slug, env.APP_URL) : env.APP_URL.replace(/\/$/, ""));

const hashOf = (token: string) => createHash("sha256").update(`handoff:${token}${env.SESSION_SECRET}`).digest("hex");

/*
 * A one-time pass to sign someone in at their agency's own address, where the browser keeps a
 * separate session. Returns the URL to send them to.
 */
export async function issueHandoff(place: { userId: string; agencyId: string; slug: string }, shared = false, next = "/app") {
  const token = randomBytes(32).toString("base64url");
  await systemDb.insert(schema.sessionHandoffs).values({ tokenHash: hashOf(token), userId: place.userId, agencyId: place.agencyId, shared, expiresAt: new Date(Date.now() + 120_000) });
  const url = new URL("/auth/handoff", agencyOrigin(place.slug, env.APP_URL));
  url.searchParams.set("token", token);
  if (next.startsWith("/app")) url.searchParams.set("next", next);
  return url.toString();
}

/* Uses a pass once. Returns who it is for, or null when it is unknown, used or more than two minutes old. */
export async function redeemHandoff(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const now = new Date();
  const [row] = await systemDb
    .update(schema.sessionHandoffs)
    .set({ usedAt: now })
    .where(and(eq(schema.sessionHandoffs.tokenHash, hashOf(token)), isNull(schema.sessionHandoffs.usedAt), gt(schema.sessionHandoffs.expiresAt, now)))
    .returning({ userId: schema.sessionHandoffs.userId, agencyId: schema.sessionHandoffs.agencyId, shared: schema.sessionHandoffs.shared });
  return row ?? null;
}
