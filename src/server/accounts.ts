import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { requireAgency } from "./agency";
import { db, schema, systemDb } from "./db";
import { env } from "./env";
import { linkExpiry, zoneLabel } from "@/lib/format";
import { inviteEmail, resetEmail } from "@/lib/email-templates";
import { sendEmail } from "./email";
import { agencyBase } from "./host";
import { getSettings } from "./settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LinkPurpose = "invite" | "reset";

const hashToken = (token: string) => createHash("sha256").update(`login:${token}${env.SESSION_SECRET}`).digest("hex");

/*
 * Issues a one-time link and withdraws any earlier unused link for the same person.
 * Returns the full URL. It is shown once to the coordinator and never stored in plain form.
 */
export async function issueLoginLink(tx: Tx, userId: string, purpose: LinkPurpose, createdBy: string | null) {
  const settings = await getSettings();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + settings.login_link_valid_hours * 3_600_000);
  await tx.delete(schema.loginTokens).where(and(eq(schema.loginTokens.userId, userId), isNull(schema.loginTokens.usedAt)));
  await tx.insert(schema.loginTokens).values({ tokenHash: hashToken(token), userId, purpose, createdBy, expiresAt });
  const agency = await requireAgency();
  return { url: `${agencyBase(agency.slug)}/setup-password/${token}`, expiresAt };
}

/*
 * Looks up a link that is unused, unexpired and belongs to an active login. The person opening it is
 * not signed in, so this looks across agencies; the link says which agency and login it is for.
 */
export async function findValidLink(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await systemDb
    .select({
      tokenHash: schema.loginTokens.tokenHash,
      purpose: schema.loginTokens.purpose,
      expiresAt: schema.loginTokens.expiresAt,
      userId: schema.users.id,
      agencyId: schema.users.agencyId,
      loginId: schema.users.loginId,
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

/*
 * Emails a setup or password link to the person it is for, when the agency emails links (Settings).
 * Returns null when it is off. Never throws: the link is still shown on screen.
 */
export async function emailLoginLink(purpose: LinkPurpose, to: { email: string; name: string }, link: { url: string; expiresAt: Date }, createdBy: string | null) {
  const settings = await getSettings();
  if (settings.email_links !== "on") return null;
  const agency = await requireAgency();
  const content = (purpose === "invite" ? inviteEmail : resetEmail)({ agency: agency.name, name: to.name, url: link.url, expires: `${linkExpiry(link.expiresAt)} ${zoneLabel()}` });
  try {
    return await sendEmail(`login:${purpose}`, to.email, content, createdBy);
  } catch (error) {
    console.error("Login link email failed", error);
    return { status: "failed" as const, detail: "the email service did not answer" };
  }
}

/* Whether this person has chosen a password, for a query on users. */
export const hasPassword = sql<boolean>`exists (select 1 from ${schema.logins} where ${schema.logins.id} = ${schema.users.loginId} and ${schema.logins.hasPassword})`;

/*
 * Whether a login also belongs to another agency. One agency must never set or reset the password of
 * a login another agency relies on, or its staff could sign in there as that person.
 */
export async function loginUsedElsewhere(loginId: string, agencyId: string) {
  const [row] = await systemDb.select({ n: count() }).from(schema.users).where(and(eq(schema.users.loginId, loginId), ne(schema.users.agencyId, agencyId)));
  return row.n > 0;
}
