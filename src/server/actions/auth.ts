"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, verifyPassword } from "@/server/auth";
import { db, schema } from "@/server/db";

export type FormState = { error?: string };

const credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).default("/app"),
});

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Enter your email address and password." };
  const { email, password, next } = parsed.data;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  // Verify against a fixed hash when the user is unknown so timing does not reveal which emails exist.
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(DUMMY_HASH, password), false);
  if (!ok || !user?.active) return { error: "That email and password do not match." };
  await createSession(user.id);
  redirect(next.startsWith("/app") ? next : "/app");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$Q8Jf9Hh1b7bJtS2pJqgaS9wYg4cGRQyfxg0n1xqkk3E";
