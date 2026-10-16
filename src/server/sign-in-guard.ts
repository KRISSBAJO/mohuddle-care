import "server-only";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { schema, systemDb } from "@/server/db";

/*
 * Pauses password guessing at sign-in: the website, the phone app (including unlocking it with the
 * password) and the owner console. Failures are kept in the database, so the limits hold across
 * restarts and across servers. Three limits, all set by the owner on the Security page:
 * - the same email from the same place: a few wrong passwords pause it;
 * - the same email from anywhere: a looser limit, so someone guessing cannot easily lock a real
 *   person out from elsewhere;
 * - one place trying many emails.
 * The answer is the same whether or not the email has a login.
 */

export type SignInLimits = { tries: number; minutes: number; perPlace: number };
export const DEFAULT_SIGN_IN_LIMITS: SignInLimits = { tries: 5, minutes: 15, perPlace: 30 };
const KEYS = { tries: "sign_in_tries", minutes: "sign_in_lock_minutes", perPlace: "sign_in_place_tries" } as const;
const BOUNDS: Record<keyof SignInLimits, [number, number]> = { tries: [3, 20], minutes: [1, 240], perPlace: [10, 500] };
// From anywhere, an email may fail this many times as often as from one place.
const ANYWHERE = 4;

let kept: { at: number; limits: SignInLimits } | null = null;

export async function signInLimits(): Promise<SignInLimits> {
  if (kept && Date.now() - kept.at < 30_000) return kept.limits;
  const rows = await systemDb.select().from(schema.platformSettings).where(inArray(schema.platformSettings.key, Object.values(KEYS)));
  const value = (key: keyof SignInLimits) => {
    const stored = rows.find(row => row.key === KEYS[key])?.value;
    const [low, high] = BOUNDS[key];
    return typeof stored === "number" && Number.isInteger(stored) && stored >= low && stored <= high ? stored : DEFAULT_SIGN_IN_LIMITS[key];
  };
  const limits = { tries: value("tries"), minutes: value("minutes"), perPlace: value("perPlace") };
  kept = { at: Date.now(), limits };
  return limits;
}

/* Checks the owner's numbers, returning words to show when one is out of range. */
export function checkSignInLimits(limits: SignInLimits): string | null {
  for (const key of Object.keys(BOUNDS) as (keyof SignInLimits)[]) {
    const [low, high] = BOUNDS[key];
    if (!Number.isInteger(limits[key]) || limits[key] < low || limits[key] > high) return `Wrong tries ${key === "minutes" ? "pause for" : "allowed"}: use a whole number from ${low} to ${high}.`;
  }
  return null;
}

export async function saveSignInLimits(limits: SignInLimits) {
  for (const key of Object.keys(KEYS) as (keyof SignInLimits)[]) {
    await systemDb
      .insert(schema.platformSettings)
      .values({ key: KEYS[key], value: limits[key] })
      .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: limits[key], updatedAt: new Date() } });
  }
  kept = null;
}

const normal = (email: string) => email.trim().toLowerCase().slice(0, 200);

/* Words to show when sign-in is paused for this email and place, or null when it may go ahead. */
export async function signInPaused(rawEmail: string, ip: string): Promise<string | null> {
  const email = normal(rawEmail);
  const limits = await signInLimits();
  const since = new Date(Date.now() - limits.minutes * 60_000);
  const failures = schema.signInFailures;
  const [[here], [anywhere], [place]] = await Promise.all([
    systemDb.select({ n: count() }).from(failures).where(and(eq(failures.email, email), eq(failures.ip, ip), gte(failures.at, since))),
    systemDb.select({ n: count() }).from(failures).where(and(eq(failures.email, email), gte(failures.at, since))),
    ip ? systemDb.select({ n: count() }).from(failures).where(and(eq(failures.ip, ip), gte(failures.at, since))) : Promise.resolve([{ n: 0 }]),
  ]);
  if (here.n >= limits.tries || anywhere.n >= limits.tries * ANYWHERE || place.n >= limits.perPlace) {
    return `Too many wrong tries. Wait ${limits.minutes} minutes, then try again, or reset your password.`;
  }
  return null;
}

/* A wrong email or password. Old rows are cleared now and then. */
export async function signInFailed(rawEmail: string, ip: string) {
  await systemDb.insert(schema.signInFailures).values({ email: normal(rawEmail), ip });
  if (Math.random() < 0.05) await systemDb.delete(schema.signInFailures).where(lt(schema.signInFailures.at, new Date(Date.now() - 86_400_000)));
}

/* A right password: earlier wrong tries for this email from this place no longer count. */
export async function signInSucceeded(rawEmail: string, ip: string) {
  await systemDb.delete(schema.signInFailures).where(and(eq(schema.signInFailures.email, normal(rawEmail)), eq(schema.signInFailures.ip, ip)));
}

/* Where a request came from, as the proxy in front of the server reports it. */
export const ipFrom = (headers: Headers) => (headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 64);
