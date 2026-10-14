import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canManage, getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { defaultExpiry, DocumentError, storeDocument, type Owner } from "@/server/docs/service";

const day = z.union([z.literal(""), z.iso.date()]).transform(value => value || null);
const input = z.object({
  ownerKind: z.enum(["staff", "person", "business"]),
  ownerId: z.union([z.literal(""), z.uuid()]),
  typeId: z.union([z.literal(""), z.uuid()]),
  title: z.string().trim().max(160).default(""),
  issuedOn: day,
  expiresOn: day,
  notes: z.string().trim().max(2000).default(""),
});

/* A coordinator files a document directly. It is approved at once, because they are the reviewer. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ error: "Only coordinators and administrators can file documents here." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const parsed = input.safeParse(Object.fromEntries([...form.entries()].filter(([key]) => key !== "file")));
  if (!parsed.success) return NextResponse.json({ error: "Check the document details." }, { status: 400 });
  const data = parsed.data;
  let owner: Owner;
  if (data.ownerKind === "staff") {
    if (!data.ownerId) return NextResponse.json({ error: "Choose the staff member." }, { status: 400 });
    owner = { kind: "staff", staffId: data.ownerId };
  } else if (data.ownerKind === "person") {
    if (!data.ownerId) return NextResponse.json({ error: "Choose the person." }, { status: 400 });
    owner = { kind: "person", individualId: data.ownerId };
  } else {
    owner = { kind: "business", homeId: data.ownerId || null };
  }
  let title = data.title;
  if (data.typeId) {
    const [type] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.id, data.typeId)).limit(1);
    if (!type || type.category !== data.ownerKind) return NextResponse.json({ error: "That document type does not fit here." }, { status: 400 });
    title ||= type.name;
  }
  if (!title) return NextResponse.json({ error: "Give the document a name." }, { status: 400 });
  if (data.issuedOn && data.expiresOn && data.expiresOn < data.issuedOn) return NextResponse.json({ error: "The expiry date is before the issue date." }, { status: 400 });
  try {
    const expiresOn = data.expiresOn ?? (await defaultExpiry(data.typeId || null, data.issuedOn));
    const doc = await storeDocument({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      owner,
      typeId: data.typeId || null,
      title,
      issuedOn: data.issuedOn,
      expiresOn,
      notes: data.notes,
      status: "approved",
      source: "upload",
      uploadedBy: user.id,
      uploadedByName: user.name,
    });
    await db.insert(schema.auditLog).values({ userId: user.id, action: "document:upload", entity: "document", entityId: doc.id });
    return NextResponse.json({ id: doc.id });
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Document upload failed", error);
    return NextResponse.json({ error: "The file could not be saved. Try again." }, { status: 500 });
  }
}
