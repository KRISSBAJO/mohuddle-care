import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { checkCode, newSecret } from "@/lib/totp";
import { verifyPassword } from "./auth";
import { schema, systemDb } from "./db";
import { env } from "./env";

/*
 * Signing in to the owner console: its own sign-in and session, apart from any agency's. A Mohuddle
 * owner (logins.is_owner) signs in with their email and password, then a code from their
 * authenticator app. The first time, they add Mohuddle to the app. Backup codes cover a lost phone.
 */

export const OWNER_COOKIE = "ms_owner";
const PENDING_COOKIE = "ms_owner_pending";
const SESSION_HOURS = 12;
const IDLE_MINUTES = 30;
const PENDING_MINUTES = 10;

export const twoFactorRequired = () => env.OWNER_TWO_FACTOR === "required";

const hashOf = (token: string) => createHash("sha256").update(`owner:${token}${env.SESSION_SECRET}`).digest("hex");
const cookieOptions = (expires: Date) => ({ httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/", expires });

/* ---------- The authenticator secret, encrypted at rest ---------- */

const key = () => createHash("sha256").update(`totp-key:${env.SESSION_SECRET}`).digest();

function seal(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(part => part.toString("base64url")).join(".");
}

function unseal(sealed: string) {
  const [iv, tag, body] = sealed.split(".").map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/* ---------- Between the password and the code ---------- */

type Pending = { loginId: string; stage: "code" | "setup"; until: number };
const signPending = (value: string) => createHmac("sha256", env.SESSION_SECRET).update(`owner-pending:${value}`).digest("base64url");

async function setPending(loginId: string, stage: Pending["stage"]) {
  const until = Date.now() + PENDING_MINUTES * 60_000;
  const value = `${loginId}.${stage}.${until}`;
  (await cookies()).set(PENDING_COOKIE, `${value}.${signPending(value)}`, cookieOptions(new Date(until)));
}

/* Who has passed the password step, and what is next for them. Null when nobody has, or it is too old. */
export async function readPending(): Promise<Pending | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value ?? "";
  const at = raw.lastIndexOf(".");
  if (at < 0) return null;
  const value = raw.slice(0, at);
  const given = Buffer.from(raw.slice(at + 1));
  const expected = Buffer.from(signPending(value));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [loginId, stage, until] = value.split(".");
  if (Number(until) < Date.now() || (stage !== "code" && stage !== "setup")) return null;
  return { loginId, stage, until: Number(until) };
}

// Wrong passwords and codes: five in a row locks an email or a login out for 15 minutes.
const failures = new Map<string, { count: number; until: number }>();
const locked = (key: string) => (failures.get(key)?.until ?? 0) > Date.now();
function fail(key: string) {
  const entry = failures.get(key) ?? { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.until = Date.now() + 15 * 60_000;
    entry.count = 0;
  }
  failures.set(key, entry);
}

const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$Q8Jf9Hh1b7bJtS2pJqgaS9wYg4cGRQyfxg0n1xqkk3E";

/*
 * The password step. On success the owner goes on to their code (or to adding the app); returns
 * where to go next, or an error to show.
 */
export async function ownerPasswordStep(email: string, password: string): Promise<{ next: string } | { error: string }> {
  const address = email.trim().toLowerCase();
  if (locked(`email:${address}`)) return { error: "Too many tries. Wait 15 minutes, then try again." };
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.email, address)).limit(1);
  const ok = login?.passwordHash ? await verifyPassword(login.passwordHash, password) : (await verifyPassword(DUMMY_HASH, password), false);
  if (!ok || !login?.isOwner) {
    fail(`email:${address}`);
    return { error: "That email and password do not match an owner." };
  }
  if (login.totpEnabledAt) {
    await setPending(login.id, "code");
    return { next: "/owner/verify" };
  }
  if (twoFactorRequired()) {
    await setPending(login.id, "setup");
    return { next: "/owner/setup" };
  }
  await createOwnerSession(login.id);
  return { next: "/owner" };
}

// The last code step each login used, so the same code cannot be used twice.
const lastStep = new Map<string, number>();

/* The code step: a code from the app, or one of the backup codes. */
export async function ownerCodeStep(code: string): Promise<{ next: string } | { error: string }> {
  const pending = await readPending();
  if (!pending || pending.stage !== "code") return { error: "Start again with your email and password." };
  if (locked(`login:${pending.loginId}`)) return { error: "Too many tries. Wait 15 minutes, then try again." };
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.id, pending.loginId)).limit(1);
  if (!login?.isOwner || !login.totpSecret || !login.totpEnabledAt) return { error: "Start again with your email and password." };
  const typed = code.trim();
  const step = checkCode(unseal(login.totpSecret), typed);
  if (step !== null && step > (lastStep.get(login.id) ?? -1)) {
    lastStep.set(login.id, step);
  } else {
    // A backup code works once.
    const hashed = backupHash(typed);
    if (!login.backupCodes.includes(hashed)) {
      fail(`login:${login.id}`);
      return { error: "That code is not right. Check the time on your phone, and use the newest code." };
    }
    await systemDb.update(schema.logins).set({ backupCodes: login.backupCodes.filter(item => item !== hashed) }).where(eq(schema.logins.id, login.id));
  }
  (await cookies()).delete(PENDING_COOKIE);
  await createOwnerSession(login.id);
  return { next: "/owner" };
}

/* ---------- Adding Mohuddle to the authenticator app ---------- */

/* The secret to add to the app, made once per setup and kept (encrypted) until the first code proves it. */
export async function setupSecret() {
  const pending = await readPending();
  if (!pending || pending.stage !== "setup") return null;
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.id, pending.loginId)).limit(1);
  if (!login?.isOwner) return null;
  if (login.totpSecret && !login.totpEnabledAt) return { email: login.email, secret: unseal(login.totpSecret) };
  const secret = newSecret();
  await systemDb.update(schema.logins).set({ totpSecret: seal(secret), totpEnabledAt: null }).where(eq(schema.logins.id, login.id));
  return { email: login.email, secret };
}

const backupHash = (code: string) => createHash("sha256").update(`backup:${code.replace(/[\s-]/g, "").toLowerCase()}${env.SESSION_SECRET}`).digest("hex");

/* The first code from the app switches it on. Returns the backup codes, shown once. */
export async function finishSetup(code: string): Promise<{ backupCodes: string[] } | { error: string }> {
  const pending = await readPending();
  if (!pending || pending.stage !== "setup") return { error: "Start again with your email and password." };
  if (locked(`login:${pending.loginId}`)) return { error: "Too many tries. Wait 15 minutes, then try again." };
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.id, pending.loginId)).limit(1);
  if (!login?.isOwner || !login.totpSecret) return { error: "Start again with your email and password." };
  const step = checkCode(unseal(login.totpSecret), code);
  if (step === null) {
    fail(`login:${login.id}`);
    return { error: "That code is not right. Type the 6 digits the app shows for Mohuddle now." };
  }
  lastStep.set(login.id, step);
  const backupCodes = Array.from({ length: 8 }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await systemDb.update(schema.logins).set({ totpEnabledAt: new Date(), backupCodes: backupCodes.map(backupHash) }).where(eq(schema.logins.id, login.id));
  (await cookies()).delete(PENDING_COOKIE);
  await createOwnerSession(login.id);
  return { backupCodes };
}

/* ---------- Sessions ---------- */

async function createOwnerSession(loginId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  const request = await headers();
  await systemDb.insert(schema.ownerSessions).values({
    tokenHash: hashOf(token),
    loginId,
    expiresAt,
    ip: (request.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64),
    userAgent: (request.get("user-agent") ?? "").slice(0, 300),
  });
  await systemDb.delete(schema.ownerSessions).where(lt(schema.ownerSessions.expiresAt, new Date()));
  (await cookies()).set(OWNER_COOKIE, token, cookieOptions(expiresAt));
}

export type Owner = { loginId: string; email: string; name: string; twoFactor: boolean; backupCodesLeft: number };

/* The signed-in owner, read once per request. Null when there is none, it expired, or it sat idle. */
export const getOwner = cache(async (): Promise<Owner | null> => {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!token) return null;
  const [row] = await systemDb
    .select({ session: schema.ownerSessions, login: schema.logins })
    .from(schema.ownerSessions)
    .innerJoin(schema.logins, eq(schema.logins.id, schema.ownerSessions.loginId))
    .where(and(eq(schema.ownerSessions.tokenHash, hashOf(token)), eq(schema.logins.isOwner, true)))
    .limit(1);
  const now = Date.now();
  if (!row || row.session.expiresAt.getTime() < now) return null;
  if (now - row.session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
    await systemDb.delete(schema.ownerSessions).where(eq(schema.ownerSessions.tokenHash, row.session.tokenHash));
    return null;
  }
  if (now - row.session.lastSeenAt.getTime() > 60_000) await systemDb.update(schema.ownerSessions).set({ lastSeenAt: new Date(now) }).where(eq(schema.ownerSessions.tokenHash, row.session.tokenHash));
  const [place] = row.login.ownerName ? [] : await systemDb.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.loginId, row.login.id)).limit(1);
  return {
    loginId: row.login.id,
    email: row.login.email,
    name: row.login.ownerName || place?.name.replace(/^Mohuddle support \((.*)\)$/, "$1") || row.login.email.split("@")[0],
    twoFactor: Boolean(row.login.totpEnabledAt),
    backupCodesLeft: row.login.backupCodes.length,
  };
});

/* The owner console's pages and actions call this first. */
export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect("/owner/login");
  return owner;
}

export async function signOutOwner() {
  const jar = await cookies();
  const token = jar.get(OWNER_COOKIE)?.value;
  if (token) await systemDb.delete(schema.ownerSessions).where(eq(schema.ownerSessions.tokenHash, hashOf(token)));
  jar.delete(OWNER_COOKIE);
}

/* The owner's other signed-in browsers, for the Security page. */
export const ownerSessionsFor = (loginId: string) =>
  systemDb.select({ createdAt: schema.ownerSessions.createdAt, lastSeenAt: schema.ownerSessions.lastSeenAt, userAgent: schema.ownerSessions.userAgent, ip: schema.ownerSessions.ip }).from(schema.ownerSessions).where(eq(schema.ownerSessions.loginId, loginId));

/* Signs the owner out everywhere else, keeping this browser. */
export async function signOutOtherOwnerSessions(loginId: string) {
  const token = (await cookies()).get(OWNER_COOKIE)?.value ?? "";
  const keep = hashOf(token);
  const all = await systemDb.select({ tokenHash: schema.ownerSessions.tokenHash }).from(schema.ownerSessions).where(eq(schema.ownerSessions.loginId, loginId));
  for (const session of all) if (session.tokenHash !== keep) await systemDb.delete(schema.ownerSessions).where(eq(schema.ownerSessions.tokenHash, session.tokenHash));
}

/* New backup codes, replacing the old ones. Shown once. */
export async function newBackupCodes(loginId: string) {
  const codes = Array.from({ length: 8 }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await systemDb.update(schema.logins).set({ backupCodes: codes.map(backupHash) }).where(eq(schema.logins.id, loginId));
  return codes;
}

/* For a signed-in owner without the app: the secret to add, kept (encrypted) until a first code proves it. */
export async function ownSetupSecret(loginId: string) {
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.id, loginId)).limit(1);
  if (!login || login.totpEnabledAt) return null;
  if (login.totpSecret) return { email: login.email, secret: unseal(login.totpSecret) };
  const secret = newSecret();
  await systemDb.update(schema.logins).set({ totpSecret: seal(secret) }).where(eq(schema.logins.id, loginId));
  return { email: login.email, secret };
}

/* A signed-in owner switching the app on with its first code. Returns the backup codes. */
export async function finishOwnSetup(loginId: string, code: string): Promise<{ backupCodes: string[] } | { error: string }> {
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.id, loginId)).limit(1);
  if (!login?.totpSecret || login.totpEnabledAt) return { error: "Reload the page and try again." };
  const step = checkCode(unseal(login.totpSecret), code);
  if (step === null) return { error: "That code is not right. Type the 6 digits the app shows for Mohuddle now." };
  lastStep.set(login.id, step);
  const backupCodes = await newBackupCodes(login.id);
  await systemDb.update(schema.logins).set({ totpEnabledAt: new Date() }).where(eq(schema.logins.id, login.id));
  return { backupCodes };
}
