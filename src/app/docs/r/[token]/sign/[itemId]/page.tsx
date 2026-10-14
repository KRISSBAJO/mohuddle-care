import { SignPage } from "@/components/docs/SignPage";

export const dynamic = "force-dynamic";

export default async function LinkSignPage({ params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params;
  return <SignPage itemId={itemId} token={token} backHref={`/docs/r/${token}`} />;
}
