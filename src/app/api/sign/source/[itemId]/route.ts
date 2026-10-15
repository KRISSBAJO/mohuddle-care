import { asLinkAgency } from "@/server/docs/requests";
import { signAccess } from "@/server/docs/sign-access";
import { storage } from "@/server/docs/storage";

/* The PDF someone has been asked to sign, for them to read. Only that document, never anything on file. */
export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const token = new URL(request.url).searchParams.get("token");
  const access = await asLinkAgency(token, () => signAccess(itemId, token));
  if ("error" in access || !access.template.sourceKey) return new Response("Not found.", { status: 404 });
  const file = await storage().read(access.template.sourceKey);
  return new Response(file.body, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
