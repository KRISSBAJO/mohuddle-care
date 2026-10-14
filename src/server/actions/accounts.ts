"use server";

import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertMayGrant, mayManageLogin, passwordProblem, type LoginRole } from "@/lib/account-policy";
import { findValidLink, hashLoginToken, issueLoginLink } from "@/server/accounts";
import { createSession, hashPassword, verifyPassword } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requireManager, requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";
import type { FormState } from "./auth";

export type LinkState = { error?: string; link?: string; expires?: string };

const uuid = z.uuid();
const expiresText = (at: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);

async function loadLogin(userId: string) {
  if (!uuid.safeParse(userId).success) return null;
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return row ?? null;
}

function revalidateStaff(staffId: string | null) {
  revalidatePath("/app/staff");
  if (staffId) revalidatePath(`/app/staff/${staffId}`);
}

/* Creates a login for a staff member and returns a one-time setup link to hand to them. */
export async function createLogin(staffId: string, _previous: LinkState, formData: FormData): Promise<LinkState> {
  const actor = await requireManager();
  const role = String(formData.get("role") ?? "");
  try {
    assertMayGrant(actor, role);
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!uuid.safeParse(staffId).success) return { error: "Unknown staff member." };
  const [member] = await db.select().from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  if (!member || !member.active) return { error: "Only current staff can be given a login." };
  const email = member.email.toLowerCase();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(or(eq(schema.users.staffId, staffId), eq(schema.users.email, email)))
    .limit(1);
  if (existing.length) return { error: "This person, or this email address, already has a login." };

  const link = await db.transaction(async tx => {
    const [user] = await tx
      .insert(schema.users)
      .values({ email, name: `${member.firstName} ${member.lastName}`, role: role as LoginRole, staffId, passwordHash: null })
      .returning({ id: schema.users.id });
    const issued = await issueLoginLink(tx, user.id, "invite", actor.id);
    await tx.insert(schema.auditLog).values({ userId: actor.id, action: `login:create:${role}`, entity: "user", entityId: user.id });
    return issued;
  });
  // No revalidation here: refreshing would swap the page to its "has a login" view and lose the
  // link before it is copied. The link panel refreshes the page when the coordinator is done.
  return { link: link.url, expires: expiresText(link.expiresAt) };
}

/* Issues a fresh password link. The old password keeps working until the new one is chosen. */
export async function issueResetLink(userId: string): Promise<LinkState> {
  const actor = await requireManager();
  const target = await loadLogin(userId);
  if (!target) return { error: "Unknown login." };
  if (!mayManageLogin(actor, target)) return { error: "You cannot manage this login." };
  if (!target.active) return { error: "Turn this login back on before sending a new link." };
  const link = await db.transaction(async tx => {
    const issued = await issueLoginLink(tx, target.id, target.passwordHash ? "reset" : "invite", actor.id);
    await tx.insert(schema.auditLog).values({ userId: actor.id, action: "login:link", entity: "user", entityId: target.id });
    return issued;
  });
  // No revalidation here: refreshing would swap the page to its "has a login" view and lose the
  // link before it is copied. The link panel refreshes the page when the coordinator is done.
  return { link: link.url, expires: expiresText(link.expiresAt) };
}

export async function setLoginRole(userId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireManager();
  const target = await loadLogin(userId);
  if (!target) return { error: "Unknown login." };
  if (!mayManageLogin(actor, target)) return { error: "You cannot manage this login." };
  const role = String(formData.get("role") ?? "");
  try {
    assertMayGrant(actor, role);
  } catch (error) {
    return { error: (error as Error).message };
  }
  await db.transaction(async tx => {
    await tx.update(schema.users).set({ role: role as LoginRole }).where(eq(schema.users.id, target.id));
    // A change of access takes effect now, not at the next sign-in.
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, target.id));
    await tx.insert(schema.auditLog).values({ userId: actor.id, action: `login:role:${role}`, entity: "user", entityId: target.id });
  });
  revalidateStaff(target.staffId);
  return {};
}

export async function setLoginActive(userId: string, active: boolean): Promise<FormState> {
  const actor = await requireManager();
  const target = await loadLogin(userId);
  if (!target) return { error: "Unknown login." };
  if (!mayManageLogin(actor, target)) return { error: "You cannot manage this login." };
  await db.transaction(async tx => {
    await tx.update(schema.users).set({ active }).where(eq(schema.users.id, target.id));
    if (!active) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, target.id));
      await tx.delete(schema.loginTokens).where(and(eq(schema.loginTokens.userId, target.id), isNull(schema.loginTokens.usedAt)));
    }
    await tx.insert(schema.auditLog).values({ userId: actor.id, action: active ? "login:enable" : "login:disable", entity: "user", entityId: target.id });
  });
  revalidateStaff(target.staffId);
  return {};
}

/* Public: the person opening their link chooses a password and is signed in. */
export async function completePasswordSetup(token: string, _previous: FormState, formData: FormData): Promise<FormState> {
  const link = await findValidLink(token);
  if (!link) return { error: "This link has expired or was already used. Ask your coordinator for a new one." };
  const settings = await getSettings();
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""), settings.password_min_length);
  if (problem) return { error: problem };
  const passwordHash = await hashPassword(password);
  const claimed = await db.transaction(async tx => {
    const used = await tx
      .update(schema.loginTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.loginTokens.tokenHash, hashLoginToken(token)), isNull(schema.loginTokens.usedAt)))
      .returning({ userId: schema.loginTokens.userId });
    if (!used.length) return false;
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, link.userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, link.userId));
    await tx.insert(schema.auditLog).values({ userId: link.userId, action: `login:password:${link.purpose}`, entity: "user", entityId: link.userId });
    return true;
  });
  if (!claimed) return { error: "This link was already used. Ask your coordinator for a new one." };
  await createSession(link.userId);
  redirect("/app?welcome=1");
}

/* Signed in: change your own password. Signs out every other device. */
export async function changeOwnPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  const current = String(formData.get("current") ?? "");
  if (!row?.passwordHash || !(await verifyPassword(row.passwordHash, current))) return { error: "Your current password is not right." };
  const settings = await getSettings();
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""), settings.password_min_length);
  if (problem) return { error: problem };
  if (password === current) return { error: "Choose a password different from your current one." };
  const passwordHash = await hashPassword(password);
  await db.transaction(async tx => {
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    await tx.insert(schema.auditLog).values({ userId: user.id, action: "login:password:change", entity: "user", entityId: user.id });
  });
  await createSession(user.id);
  return {};
}

