import "server-only";
import { createHash } from "node:crypto";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { env } from "./env";

/* Only a hash of a session token is stored. Shared by the auth module and the database connection. */
export const sessionTokenHash = (token: string) => createHash("sha256").update(token + env.SESSION_SECRET).digest("hex");

/*
 * This request's session token: the phone app sends it as "Authorization: Bearer", browsers as a
 * cookie. Throws outside a request, like next/headers itself.
 */
export async function requestSessionToken(): Promise<string | undefined> {
  const { cookies, headers } = await import("next/headers");
  const bearer = (await headers()).get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer ?? (await cookies()).get(SESSION_COOKIE)?.value;
}
