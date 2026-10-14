import { SignPage } from "@/components/docs/SignPage";
import { requireUser } from "@/server/guard";

export const metadata = { title: "Sign a document" };

export default async function PortalSignPage({ params }: { params: Promise<{ itemId: string }> }) {
  await requireUser();
  const { itemId } = await params;
  return <SignPage itemId={itemId} token={null} backHref="/app/my-documents" />;
}
