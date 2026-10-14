import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { safeFileName, sniffType } from "@/lib/documents";
import { canManage, getSessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { storage } from "@/server/docs/storage";

const input = z.object({
  title: z.string().trim().min(2, "Give the document a name.").max(160),
  category: z.enum(["staff", "person", "business"]),
  typeId: z.union([z.literal(""), z.uuid()]).transform(value => value || null),
  initialEach: z.enum(["on", "off"]).default("on"),
});

/* Uploads a PDF for people to sign. Each page will be initialled, and a signature page added. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !canManage(user)) return NextResponse.json({ error: "Only coordinators and administrators can add documents to sign." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF." }, { status: 400 });
  const parsed = input.safeParse(Object.fromEntries([...form.entries()].filter(([key]) => key !== "file")));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > env.MAX_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ error: `PDFs can be up to ${env.MAX_UPLOAD_MB} MB.` }, { status: 400 });
  if (sniffType(bytes.subarray(0, 16)) !== "application/pdf") return NextResponse.json({ error: "Documents to sign must be PDFs." }, { status: 400 });
  let pages: number;
  try {
    pages = (await PDFDocument.load(bytes)).getPageCount();
  } catch {
    return NextResponse.json({ error: "This PDF is password-protected or damaged. Save an unlocked copy and try again." }, { status: 400 });
  }
  if (pages > 60) return NextResponse.json({ error: "Documents to sign can have up to 60 pages." }, { status: 400 });
  const id = randomUUID();
  const name = safeFileName(file.name, "application/pdf");
  const key = `templates/${id}/${name}`;
  await storage().put(key, bytes, "application/pdf");
  await db.insert(schema.signTemplates).values({
    id,
    title: parsed.data.title,
    category: parsed.data.category,
    typeId: parsed.data.typeId,
    sourceKey: key,
    sourceName: name,
    sourcePages: pages,
    initialEach: parsed.data.initialEach === "on",
    createdBy: user.id,
  });
  await db.insert(schema.auditLog).values({ userId: user.id, action: "sign-template:upload", entity: "sign_template", entityId: id });
  return NextResponse.json({ id });
}
