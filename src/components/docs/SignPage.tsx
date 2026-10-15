import Link from "next/link";
import { ArrowLeft, CheckCircle2, LinkIcon } from "lucide-react";
import { sections } from "@/lib/signing";
import { site } from "@/lib/site";
import { signAccess } from "@/server/docs/sign-access";
import { signingContent } from "@/server/docs/sign";
import { SignDocument } from "./SignDocument";

/* Loads what someone has been asked to sign and shows the signing steps, or why they cannot sign. */
export async function SignPage({ itemId, token, backHref }: { itemId: string; token: string | null; backHref: string }) {
  const access = await signAccess(itemId, token);
  if ("error" in access) {
    return (
      <div className="card mx-auto max-w-lg px-6 py-12 text-center">
        <LinkIcon className="mx-auto h-10 w-10 text-dim" />
        <h1 className="mt-4 text-xl font-bold">{access.error}</h1>
        <Link href={backHref} className="btn-ghost mt-6 inline-flex"><ArrowLeft className="h-4 w-4" /> Back</Link>
      </div>
    );
  }
  if (access.item.status === "approved") {
    return (
      <div className="card mx-auto max-w-lg px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-sage" />
        <h1 className="mt-4 text-xl font-bold">Already signed</h1>
        <p className="mt-2 text-sm text-mute">{access.template.title} has been signed. Nothing more is needed.</p>
        <Link href={backHref} className="btn-ghost mt-6 inline-flex"><ArrowLeft className="h-4 w-4" /> Back</Link>
      </div>
    );
  }
  const content = await signingContent(access.template, access.signerName);
  return (
    <div>
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back to the list</Link>
      <SignDocument
        itemId={access.item.id}
        token={token}
        title={access.template.title}
        signerName={access.signerName}
        signerRelation={access.signerRelation}
        agency={site.legalName}
        initialEach={access.template.initialEach}
        content={content.kind === "text" ? { kind: "text", sections: sections(content.filled) } : { kind: "pdf", pages: content.pages, fields: content.fields, sourceUrl: `/api/sign/source/${access.item.id}${token ? `?token=${token}` : ""}` }}
        doneHref={backHref}
      />
    </div>
  );
}
