import "server-only";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { pushTo } from "@/server/push";

export type Role = "admin" | "coordinator" | "nurse" | "dsp";
export type Tone = "info" | "warn" | "bad" | "good";
export type Message = { kind: string; title: string; body?: string; href?: string; tone?: Tone; dedupeKey: string };

/*
 * The logins to tell: everyone with one of the roles, plus the logins linked to the given staff
 * (an escort, a home manager, whoever worked a shift). The person who caused the event is left out.
 */
export async function recipients({ roles = [], staffIds = [], except }: { roles?: Role[]; staffIds?: (string | null | undefined)[]; except?: string }) {
  const staff = staffIds.filter((id): id is string => Boolean(id));
  if (!roles.length && !staff.length) return [];
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.active, true),
        or(roles.length ? inArray(schema.users.role, roles) : undefined, staff.length ? inArray(schema.users.staffId, staff) : undefined),
        except ? ne(schema.users.id, except) : undefined,
      ),
    );
  return [...new Set(rows.map(row => row.id))];
}

/* Sends one message to each login. A message with the same dedupe key is only ever sent once per login. */
export async function notify(userIds: string[], message: Message) {
  if (!userIds.length) return 0;
  const rows = await db
    .insert(schema.notifications)
    .values(
      userIds.map(userId => ({
        userId,
        kind: message.kind,
        title: message.title.slice(0, 200),
        body: (message.body ?? "").slice(0, 600),
        href: message.href ?? "",
        tone: message.tone ?? "info",
        dedupeKey: message.dedupeKey,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id, userId: schema.notifications.userId });
  // New messages also go to the phones of the people told. A repeat (same dedupe key) goes nowhere.
  if (rows.length) {
    await pushTo(
      rows.map(row => row.userId),
      { title: message.title, body: message.body, href: message.href, tone: message.tone, tag: message.dedupeKey },
    ).catch(error => console.error("Push failed", error));
  }
  return rows.length;
}

/* The staff member who manages a home, if one is set. */
export async function homeManagerOf(homeId: string | null | undefined) {
  if (!homeId) return null;
  const [home] = await db.select({ managerStaffId: schema.homes.managerStaffId }).from(schema.homes).where(eq(schema.homes.id, homeId)).limit(1);
  return home?.managerStaffId ?? null;
}
