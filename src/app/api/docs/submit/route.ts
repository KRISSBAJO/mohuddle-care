import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { asLinkAgency, requestByToken, touchRequest } from "@/server/docs/requests";
import { DocumentError, storeDocument, tellReviewers, type Owner } from "@/server/docs/service";

/*
 * A requested document arrives, either from a private link (token) or from the staff member's own
 * Hub page (signed in). It waits for review. Nothing about existing documents is ever sent back.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const itemId = String(form.get("itemId") ?? "");
  const token = String(form.get("token") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/.test(itemId)) return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400 });
  return asLinkAgency(token, () => submit(file, itemId, token));
}

async function submit(file: File, itemId: string, token: string) {

  const [item] = await db.select().from(schema.documentRequestItems).where(eq(schema.documentRequestItems.id, itemId)).limit(1);
  if (!item || item.kind !== "upload") return NextResponse.json({ error: "This item is no longer requested." }, { status: 400 });
  if (item.status === "submitted" || item.status === "approved") return NextResponse.json({ error: "This one has already been sent." }, { status: 409 });
  const [req] = await db.select().from(schema.documentRequests).where(eq(schema.documentRequests.id, item.requestId)).limit(1);
  if (!req || req.revokedAt) return NextResponse.json({ error: "This request was withdrawn." }, { status: 410 });

  let source: "request_link" | "staff_portal";
  let uploadedBy: string | null = null;
  let who = "";
  if (token) {
    const found = await requestByToken(token);
    if (found.state !== "ok" || found.request.id !== req.id) return NextResponse.json({ error: "This link has expired. Ask for a new one." }, { status: 410 });
    source = "request_link";
    await touchRequest(req.id);
  } else {
    const user = await getSessionUser();
    if (!user || !user.staffId || user.staffId !== req.staffId) return NextResponse.json({ error: "Sign in to send your documents." }, { status: 401 });
    source = "staff_portal";
    uploadedBy = user.id;
    who = user.name;
  }

  let owner: Owner;
  if (req.staffId) {
    const [member] = await db.select({ first: schema.staff.firstName, last: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, req.staffId)).limit(1);
    who ||= member ? `${member.first} ${member.last}` : "A staff member";
    owner = { kind: "staff", staffId: req.staffId };
  } else if (req.individualId) {
    who ||= req.recipientName || "A contact";
    owner = { kind: "person", individualId: req.individualId };
  } else {
    return NextResponse.json({ error: "This request has no owner." }, { status: 400 });
  }

  try {
    const doc = await storeDocument({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      owner,
      typeId: item.typeId,
      title: item.label,
      status: "submitted",
      source,
      uploadedBy,
      uploadedByName: who,
      requestItemId: item.id,
    });
    await db.update(schema.documentRequestItems).set({ status: "submitted", documentId: doc.id, reviewNote: "" }).where(eq(schema.documentRequestItems.id, item.id));
    await tellReviewers(doc, who, uploadedBy ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Document submit failed", error);
    return NextResponse.json({ error: "The file could not be saved. Try again." }, { status: 500 });
  }
}
