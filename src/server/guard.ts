import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canManage, getSessionUser, type SessionUser } from "./auth";
import { readOnlyNow } from "./billing";
import { isOwner } from "./owner";

/* Server components and actions call these instead of checking the session themselves. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Every change goes through a server action; an agency whose subscription lapsed may not make one.
  if ((await headers()).get("next-action")) await assertWritable(user);
  return user;
}

export class ReadOnlyError extends Error {
  constructor() {
    super("Mohuddle is read-only for this agency until its subscription is renewed. You can still see everything. Ask your administrator, or contact Mohuddle.");
  }
}

/* Stops a change when the agency's subscription has lapsed. Support visits may still change things. */
export async function assertWritable(user: SessionUser | null) {
  if (user?.supportUntil) return;
  if (await readOnlyNow()) throw new ReadOnlyError();
}

export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canManage(user)) redirect("/app?denied=1");
  return user;
}

/* The owner console: only logins flagged as Mohuddle owners. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await isOwner(user.loginId))) redirect("/app?denied=1");
  return user;
}
