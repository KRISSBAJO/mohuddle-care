import "server-only";
import { redirect } from "next/navigation";
import { canManage, getSessionUser, type SessionUser } from "./auth";
import { isOwner } from "./owner";

/* Server components and actions call these instead of checking the session themselves. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
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
