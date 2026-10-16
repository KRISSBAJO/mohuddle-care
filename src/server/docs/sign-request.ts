import "server-only";
import { clientIpFrom } from "@/server/client-ip";
import { readOnlyNow } from "@/server/billing";
import { signAccess } from "./sign-access";
import { DocumentError } from "./service";
import { signItem } from "./sign";

/*
 * Signs one requested document, shared by the website's signing page (/api/sign) and the phone app
 * (/api/v1/documents/sign). The caller turns what was drawn or typed into PNG images first.
 */
export type SignRequest = {
  itemId: string;
  token: string | null;
  method: "drawn" | "typed";
  typedName: string;
  typedInitials: string;
  signaturePng: Buffer;
  initialsPng: Buffer;
  initialsCount: number;
  appliedFields: string[];
  consentedAt: Date;
  ip: string;
  userAgent: string;
};

export const clientIp = (request: Request) => clientIpFrom(request.headers);

export async function signRequested(data: SignRequest): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  if (await readOnlyNow()) return { ok: false, status: 403, error: "This agency's Mohuddle subscription has lapsed, so documents cannot be signed right now. Contact the agency." };
  const access = await signAccess(data.itemId, data.token);
  if ("error" in access) return { ok: false, status: 403, error: access.error as string };
  if (access.item.status === "approved") return { ok: false, status: 409, error: "This document has already been signed." };
  if (Math.abs(data.consentedAt.getTime() - Date.now()) > 6 * 3_600_000) return { ok: false, status: 400, error: "Refresh the page and try again." };
  try {
    const doc = await signItem({
      itemId: access.item.id,
      owner: access.owner,
      template: access.template,
      signerName: access.signerName,
      signerRelation: access.signerRelation,
      method: data.method,
      typedName: data.typedName,
      typedInitials: data.typedInitials,
      signaturePng: data.signaturePng,
      initialsPng: data.initialsPng,
      initialsCount: data.initialsCount,
      appliedFields: data.appliedFields,
      ip: data.ip,
      userAgent: data.userAgent,
      consentedAt: data.consentedAt,
      source: access.source,
      uploadedBy: access.userId,
    });
    return { ok: true, id: doc.id };
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, status: 400, error: error.message };
    console.error("Signing failed", error);
    return { ok: false, status: 500, error: "The document could not be signed. Try again." };
  }
}
