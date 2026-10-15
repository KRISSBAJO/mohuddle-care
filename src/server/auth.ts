import "server-only";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { agencyZone, asAgency, db, schema, systemDb } from "./db";
import { env } from "./env";
import { sessionTokenHash as tokenHash } from "./session-token";
import { getSettings } from "./settings";
import { signedZone, ZONE_COOKIE } from "./zone";

// The last-used time is written at most this often, so ordinary page loads do not each write to the database.
const TOUCH_EVERY_MS = 60_000;

export const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

/*
 * Starts a session for someone's place in one agency. It ends after that agency's maximum length; a
 * shared device also ends at clock-out. Switching agency starts a new session.
 */
export async function createSession(user: { id: string; agencyId: string }, shared = false) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = await asAgency(user.agencyId, async () => {
    const settings = await getSettings();
    const ends = new Date(Date.now() + settings.session_max_hours * 3_600_000);
    await db.insert(schema.sessions).values({ tokenHash: tokenHash(token), userId: user.id, expiresAt: ends, shared });
    // Old sessions are cleared now and then, so the table does not grow forever.
    await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
    return ends;
  });
  const jar = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/", expires: expiresAt };
  jar.set(SESSION_COOKIE, token, options);
  // The agency's time zone, for the date helpers (see zone.ts). Signed, so it cannot be changed by hand.
  jar.set(ZONE_COOKIE, signedZone(await agencyZone(user.agencyId)), options);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash(token)));
  jar.delete(SESSION_COOKIE);
  jar.delete(ZONE_COOKIE);
}

export type SessionUser = {
  id: string;
  /* The agency this session is working in. */
  agencyId: string;
  loginId: string;
  email: string;
  name: string;
  role: "admin" | "coordinator" | "nurse" | "dsp";
  staffId: string | null;
  /* This device was marked shared at sign-in, such as a home's tablet. */
  shared?: boolean;
};

/* Reads the signed-in user once per request. Returns null when there is no valid session. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: schema.users.id,
      agencyId: schema.users.agencyId,
      loginId: schema.users.loginId,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      staffId: schema.users.staffId,
      active: schema.users.active,
      expiresAt: schema.sessions.expiresAt,
      lastSeenAt: schema.sessions.lastSeenAt,
      shared: schema.sessions.shared,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    // An agency that has been turned off lets nobody in.
    .innerJoin(schema.agencies, and(eq(schema.agencies.id, schema.users.agencyId), eq(schema.agencies.active, true)))
    .where(eq(schema.sessions.tokenHash, tokenHash(token)))
    .limit(1);
  const row = rows[0];
  const now = Date.now();
  if (!row || !row.active || row.expiresAt.getTime() < now) return null;
  // Signed out after a spell of not using the app. The browser warns first; this catches closed tabs.
  const { session_idle_minutes } = await getSettings();
  if (now - row.lastSeenAt.getTime() > session_idle_minutes * 60_000) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash(token)));
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date(now) }).where(and(eq(schema.sessions.tokenHash, tokenHash(token)), lt(schema.sessions.lastSeenAt, new Date(now - TOUCH_EVERY_MS))));
  }
  return { id: row.id, agencyId: row.agencyId, loginId: row.loginId, email: row.email, name: row.name, role: row.role, staffId: row.staffId, shared: row.shared };
});

export type Place = { userId: string; agencyId: string; name: string; slug: string; role: SessionUser["role"] };

/* The agencies a login may open: its active places in active agencies, by name. */
export async function placesFor(loginId: string): Promise<Place[]> {
  return systemDb
    .select({ userId: schema.users.id, agencyId: schema.users.agencyId, name: schema.agencies.name, slug: schema.agencies.slug, role: schema.users.role })
    .from(schema.users)
    .innerJoin(schema.agencies, eq(schema.agencies.id, schema.users.agencyId))
    .where(and(eq(schema.users.loginId, loginId), eq(schema.users.active, true), eq(schema.agencies.active, true)))
    .orderBy(schema.agencies.name);
}

/*
 * Moves the signed-in person to another of their agencies: this session ends and one starts there.
 * Returns false when they have no place in that agency.
 */
export async function switchAgencyFor(user: SessionUser, agencyId: string) {
  const place = (await placesFor(user.loginId)).find(item => item.agencyId === agencyId);
  if (!place) return false;
  if (place.agencyId === user.agencyId) return true;
  await destroySession();
  await createSession({ id: place.userId, agencyId: place.agencyId }, user.shared);
  return true;
}

export const canManage = (user: SessionUser) => user.role === "admin" || user.role === "coordinator";
