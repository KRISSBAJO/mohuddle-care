import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { getSettings } from "./settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LinkPurpose = "invite" | "reset";

const hashToken = (token: string) => createHash("sha256").update(`login:${token}${env.SESSION_SECRET}`).digest("hex");

/*
 * Issues a one-time link and withdraws any earlier unused link for the same person.
 * Returns the full URL. It is shown once to the coordinator and never stored in plain form.
 */
export async function issueLoginLink(tx: Tx, userId: string, purpose: LinkPurpose, createdBy: string) {
  const settings = await getSettings();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + settings.login_link_valid_hours * 3_600_000);
  await tx.delete(schema.loginTokens).where(and(eq(schema.loginTokens.userId, userId), isNull(schema.loginTokens.usedAt)));
  await tx.insert(schema.loginTokens).values({ tokenHash: hashToken(token), userId, purpose, createdBy, expiresAt });
  return { url: new URL(`/setup-password/${token}`, env.APP_URL).toString(), expiresAt };
}

/* Looks up a link that is unused, unexpired and belongs to an active login. */
export async function findValidLink(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await db
    .select({
      tokenHash: schema.loginTokens.tokenHash,
      purpose: schema.loginTokens.purpose,
      expiresAt: schema.loginTokens.expiresAt,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.loginTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.loginTokens.userId))
    .where(
      and(
        eq(schema.loginTokens.tokenHash, hashToken(token)),
        isNull(schema.loginTokens.usedAt),
        gt(schema.loginTokens.expiresAt, new Date()),
        eq(schema.users.active, true),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export { hashToken as hashLoginToken };
