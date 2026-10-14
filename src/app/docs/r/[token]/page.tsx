import { inArray } from "drizzle-orm";
import { CalendarClock, LinkIcon } from "lucide-react";
import { RequestChecklist } from "@/components/docs/RequestChecklist";
import { fmt } from "@/lib/format";
import { site } from "@/lib/site";
import { db, schema } from "@/server/db";
import { requestByToken, touchRequest } from "@/server/docs/requests";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/* The page behind a private request link: what is asked for, and a way to send or sign each one. */
export default async function RequestLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await requestByToken(token);
  if (found.state !== "ok") {
    return (
      <div className="card mx-auto max-w-lg px-6 py-12 text-center">
        <LinkIcon className="mx-auto h-10 w-10 text-dim" />
        <h1 className="mt-4 text-2xl font-bold">{found.state === "expired" ? "This link has expired" : found.state === "revoked" ? "This link no longer works" : "This link is not valid"}</h1>
        <p className="mt-2 text-sm text-mute">Links stop working after a set time, or when a new one is sent. Ask your coordinator at {site.legalName} for a fresh link.</p>
      </div>
    );
  }
  await touchRequest(found.request.id);
  const typeIds = found.items.map(item => item.typeId).filter((id): id is string => Boolean(id));
  const types = typeIds.length ? await db.select({ id: schema.documentTypes.id, instructions: schema.documentTypes.instructions }).from(schema.documentTypes).where(inArray(schema.documentTypes.id, typeIds)) : [];
  const done = found.items.filter(item => item.status === "approved" || item.status === "submitted").length;
  return (
    <div className="space-y-6">
      <section>
        <p className="eyebrow">Hello{found.first ? ` ${found.first}` : ""}</p>
        <h1 className="mt-1 text-3xl font-bold">{found.request.title}</h1>
        {found.request.message && <p className="mt-2 whitespace-pre-line text-mute">{found.request.message}</p>}
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
          <span className="font-semibold text-ink">{done} of {found.items.length} sent</span>
          {found.request.dueOn && <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Needed by {fmt.dayLong(found.request.dueOn)}</span>}
          <span>This link works until {fmt.dateTime(found.request.expiresAt)}</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-sage" style={{ width: `${(done / Math.max(1, found.items.length)) * 100}%` }} /></div>
      </section>
      <RequestChecklist
        items={found.items}
        token={token}
        signHref={itemId => `/docs/r/${token}/sign/${itemId}`}
        maxMb={env.MAX_UPLOAD_MB}
        instructions={Object.fromEntries(types.filter(type => type.instructions).map(type => [type.id, type.instructions]))}
      />
      <p className="text-xs text-mute">You can come back to this link until it expires. Photos from your phone are fine: lay the document flat in good light so every word can be read.</p>
    </div>
  );
}
