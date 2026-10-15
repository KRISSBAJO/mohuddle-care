"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, getSessionUser, placesFor, placesInOrder, switchAgencyFor, verifyPassword } from "@/server/auth";
import { schema, systemDb } from "@/server/db";
import { addressesOn, hostAgency, issueHandoff, requestHost } from "@/server/host";

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
  const places = await placesInOrder(login.id);
  const host = await requestHost();
  let place: (typeof places)[number] | undefined = places[0];
  if (host.kind === "agency") {
    // On an agency's own address, only that agency.
    const agency = await hostAgency();
    if (!agency || agency === "missing") return { error: "No agency uses this address. Check the link you were given." };
    place = places.find(item => item.agencyId === agency.id);
    if (!place) return { error: `You do not have a login at ${agency.name}. Ask its office, or sign in where you usually do.` };
  }
  if (!place) return { error: "That email and password do not match." };
  const target = next.startsWith("/app") ? next : "/app";
  // With agency addresses, the session belongs at the agency's address: send them there with a one-time pass.
  if (addressesOn() && host.kind !== "agency") redirect(await issueHandoff({ userId: place.id, agencyId: place.agencyId, slug: place.slug }, shared === "on", target));
  await createSession(place, shared === "on");
  redirect(target);
}

/*
 * The agency switcher: opens another agency this person works for. With agency addresses it returns
 * the other agency's address, with a one-time pass, for the browser to go to.
 */
export async function switchAgency(agencyId: string): Promise<{ url?: string }> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (addressesOn()) {
    const place = (await placesFor(user.loginId)).find(item => item.agencyId === agencyId);
    if (!place) return {};
    return { url: await issueHandoff({ userId: place.userId, agencyId: place.agencyId, slug: place.slug }, user.shared) };
  }
  if (!(await switchAgencyFor(user, agencyId))) return {};
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
