import "server-only";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { requestByToken } from "./requests";
import type { Owner } from "./service";

/*
 * Who may sign one requested item: whoever holds the request's working link, or the staff member it
 * was sent to, signed in. Returns the item, its template, the owner and the name that will be signed.
 */
export async function signAccess(itemId: string, token: string | null) {
  if (!/^[0-9a-f-]{36}$/.test(itemId)) return { error: "Not found." } as const;
  const [item] = await db.select().from(schema.documentRequestItems).where(eq(schema.documentRequestItems.id, itemId)).limit(1);
  if (!item || item.kind !== "sign" || !item.templateId) return { error: "This document is not waiting for a signature." } as const;
  const [request] = await db.select().from(schema.documentRequests).where(eq(schema.documentRequests.id, item.requestId)).limit(1);
  if (!request || request.revokedAt) return { error: "This request was withdrawn." } as const;
  let source: "request_link" | "staff_portal";
  let userId: string | null = null;
  if (token) {
    const found = await requestByToken(token);
    if (found.state !== "ok" || found.request.id !== request.id) return { error: "This link has expired. Ask for a new one." } as const;
    source = "request_link";
  } else {
    const user = await getSessionUser();
    if (!user?.staffId || user.staffId !== request.staffId) return { error: "Sign in to sign this document." } as const;
    source = "staff_portal";
    userId = user.id;
  }
  const [template] = await db.select().from(schema.signTemplates).where(eq(schema.signTemplates.id, item.templateId)).limit(1);
  if (!template) return { error: "This document was removed." } as const;
  let owner: Owner;
  let signerName: string;
  let signerRelation = "";
  if (request.staffId) {
    const [member] = await db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, request.staffId)).limit(1);
    owner = { kind: "staff", staffId: request.staffId };
    signerName = member ? `${member.first} ${member.last}` : "Staff member";
  } else if (request.individualId) {
    owner = { kind: "person", individualId: request.individualId };
    signerName = request.recipientName || "Signer";
    signerRelation = request.recipientRelation;
  } else {
    return { error: "This request has no owner." } as const;
  }
  return { item, request, template, owner, signerName, signerRelation, source, userId } as const;
}
