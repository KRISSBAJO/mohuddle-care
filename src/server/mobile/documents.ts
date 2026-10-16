import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { appliesToRole, REQUIREMENT_STATE, requirementState } from "@/lib/documents";
import { dateKey } from "@/lib/format";
import { sections } from "@/lib/signing";
import type { SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { openRequestsFor } from "@/server/docs/requests";
import { signAccess } from "@/server/docs/sign-access";
import { signingContent } from "@/server/docs/sign";
import { documentTypes } from "@/server/queries/documents";

/*
 * The phone app's My documents: what the agency has asked this staff member for, and the state of
 * their file. Like the website, it shows dates and status, never the stored files.
 */
export async function myDocuments(user: SessionUser) {
  if (!user.staffId) return { requests: [], file: [] };
  const [member] = await db.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, user.staffId)).limit(1);
  const [requests, types, docs] = await Promise.all([
    openRequestsFor(user.staffId),
    documentTypes("staff"),
    db.select({ typeId: schema.documents.typeId, status: schema.documents.status, expiresOn: schema.documents.expiresOn }).from(schema.documents).where(and(eq(schema.documents.staffId, user.staffId), inArray(schema.documents.status, ["submitted", "approved", "rejected"]))),
  ]);
  const today = dateKey();
  const openTypes = new Set(requests.flatMap(entry => entry.items.filter(item => item.status === "pending" || item.status === "rejected").map(item => item.typeId)));
  const file = types
    .filter(type => type.required && appliesToRole(type.roles, member?.role ?? "dsp"))
    .map(type => {
      const mine = docs.filter(doc => doc.typeId === type.id);
      const state = requirementState(mine, today, type.reminderDays, openTypes.has(type.id));
      return { name: type.name, state: REQUIREMENT_STATE[state].text, tone: REQUIREMENT_STATE[state].tone, expiresOn: mine.find(doc => doc.status === "approved")?.expiresOn ?? null };
    });
  return {
    requests: requests.map(({ request, items }) => ({
      id: request.id,
      title: request.title,
      message: request.message,
      dueOn: request.dueOn,
      sentAt: request.createdAt,
      items: items.map(item => ({ id: item.id, label: item.label, kind: item.kind, status: item.status, reviewNote: item.reviewNote })),
    })),
    file,
  };
}

/* What one document to sign says, for reading on the phone. PDFs with placed fields are signed on the website. */
export async function documentToSign(itemId: string) {
  const access = await signAccess(itemId, null);
  if ("error" in access) return { error: access.error as string };
  if (access.item.status === "approved") return { signed: true as const, title: access.template.title };
  const content = await signingContent(access.template, access.signerName);
  return {
    signed: false as const,
    title: access.template.title,
    signerName: access.signerName,
    initialEach: access.template.initialEach,
    kind: content.kind,
    sections: content.kind === "text" ? sections(content.filled) : [],
  };
}
