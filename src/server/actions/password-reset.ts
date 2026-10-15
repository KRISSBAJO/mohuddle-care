"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { inviteEmail, resetEmail } from "@/lib/email-templates";
import { linkExpiry, zoneLabel } from "@/lib/format";
import { issueLoginLink } from "@/server/accounts";
import { requireAgency } from "@/server/agency";
import { placesInOrder } from "@/server/auth";
import { asAgency, db, schema, systemDb } from "@/server/db";
import { sendEmail } from "@/server/email";
import { hostAgency, requestHost } from "@/server/host";

export type ResetState = { done?: boolean; error?: string };

// At most this many reset emails to one address an hour, and this many requests from one place.
const PER_ADDRESS = 3;
const PER_PLACE = 10;
const recent = new Map<string, number[]>();

function tooMany(key: string, limit: number) {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter(at => now - at < 3_600_000);
  times.push(now);
  recent.set(key, times);
  if (recent.size > 5_000) recent.clear();
  return times.length > limit;
}

/*
 * "Forgot your password?": emails a link to choose a new one. The answer is the same whether or not
 * the email has a login, so the page never tells anyone which emails do.
 */
export async function requestPasswordReset(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z.email().max(200).safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "Enter the email address you sign in with." };
  const email = parsed.data;
  const from = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (tooMany(`place:${from}`, PER_PLACE)) return { done: true };

  const [login] = await systemDb.select({ id: schema.logins.id, hasPassword: schema.logins.hasPassword }).from(schema.logins).where(eq(schema.logins.email, email)).limit(1);
  if (!login) return { done: true };
  const places = await placesInOrder(login.id);
  // On an agency's own address, only that agency; elsewhere, the one they used last.
  const host = await requestHost();
  const agency = host.kind === "agency" ? await hostAgency() : null;
  const place = host.kind === "agency" ? places.find(item => agency && agency !== "missing" && item.agencyId === agency.id) : places[0];
  if (!place) return { done: true };

  const [sentLately] = await systemDb
    .select({ n: count() })
    .from(schema.emailMessages)
    .where(and(eq(schema.emailMessages.toAddress, email), eq(schema.emailMessages.kind, "login:forgot"), gt(schema.emailMessages.createdAt, new Date(Date.now() - 3_600_000))));
  if (sentLately.n >= PER_ADDRESS) return { done: true };

  await asAgency(place.agencyId, async () => {
    const purpose = login.hasPassword ? "reset" : "invite";
    const [user] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, place.id)).limit(1);
    const link = await db.transaction(async tx => {
      const issued = await issueLoginLink(tx, place.id, purpose, null);
      await tx.insert(schema.auditLog).values({ action: "login:forgot", entity: "user", entityId: place.id });
      return issued;
    });
    const agencyRow = await requireAgency();
    const content = (purpose === "invite" ? inviteEmail : resetEmail)({ agency: agencyRow.name, name: user?.name ?? "", url: link.url, expires: `${linkExpiry(link.expiresAt)} ${zoneLabel()}` });
    // Sent even when the agency does not email links from the office: this is the only way the person gets it.
    await sendEmail("login:forgot", email, content).catch(error => console.error("Password reset email failed", error));
  });
  return { done: true };
}
