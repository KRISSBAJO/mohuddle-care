"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, switchAgencyFor, verifyPassword } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { schema, systemDb } from "@/server/db";

export type FormState = { error?: string };

const credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).default("/app"),
  shared: z.literal("on").optional(),
});

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Enter your email address and password." };
  const { email, password, next, shared } = parsed.data;
  // Before sign-in there is no agency yet, so the login is looked up across all of them.
  const [login] = await systemDb.select().from(schema.logins).where(eq(schema.logins.email, email.toLowerCase())).limit(1);
  // Verify against a fixed hash when the login is unknown so timing does not reveal which emails exist.
  // A login that has not finished setup has no password yet and cannot sign in.
  const ok = login?.passwordHash
    ? await verifyPassword(login.passwordHash, password)
    : (await verifyPassword(DUMMY_HASH, password), false);
  if (!ok || !login) return { error: "That email and password do not match." };
  const place = await agencyToOpen(login.id);
  if (!place) return { error: "That email and password do not match." };
  await createSession(place, shared === "on");
  redirect(next.startsWith("/app") ? next : "/app");
}

/*
 * Which of a login's agencies to open: the one whose address this is (slug.mohuddle.com), or else
 * the one they used last. Only active places in active agencies count.
 */
async function agencyToOpen(loginId: string) {
  const places = await systemDb
    .select({ id: schema.users.id, agencyId: schema.users.agencyId, slug: schema.agencies.slug })
    .from(schema.users)
    .innerJoin(schema.agencies, eq(schema.agencies.id, schema.users.agencyId))
    .where(and(eq(schema.users.loginId, loginId), eq(schema.users.active, true), eq(schema.agencies.active, true)))
    .orderBy(sql`(select max(${schema.sessions.createdAt}) from ${schema.sessions} where ${schema.sessions.userId} = ${schema.users.id}) desc nulls last`, schema.users.createdAt);
  const host = (await headers()).get("host") ?? "";
  const subdomain = host.split(".").length > 2 || host.includes(".localhost") ? host.split(".")[0] : "";
  return places.find(place => place.slug === subdomain) ?? places[0] ?? null;
}

/* The agency switcher: opens another agency this person works for. */
export async function switchAgency(agencyId: string) {
  const user = await requireUser();
  if (!(await switchAgencyFor(user, agencyId))) return;
  redirect("/app");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

/* Called by the browser when it has been idle for the agency's time limit. */
export async function signOutIdle() {
  await destroySession();
  redirect("/login?reason=idle");
}

const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$Q8Jf9Hh1b7bJtS2pJqgaS9wYg4cGRQyfxg0n1xqkk3E";
