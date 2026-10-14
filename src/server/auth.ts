import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { db, schema } from "./db";
import { env } from "./env";

const SESSION_DAYS = 14;

export const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

const tokenHash = (token: string) => createHash("sha256").update(token + env.SESSION_SECRET).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ tokenHash: tokenHash(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash(token)));
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "coordinator" | "nurse" | "dsp";
  staffId: string | null;
};

/* Reads the signed-in user once per request. Returns null when there is no valid session. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      staffId: schema.users.staffId,
      active: schema.users.active,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, tokenHash(token)))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active || row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, staffId: row.staffId };
});

export const canManage = (user: SessionUser) => user.role === "admin" || user.role === "coordinator";
