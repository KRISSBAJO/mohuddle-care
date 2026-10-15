import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/ui";
import { FieldEditor } from "@/components/docs/FieldEditor";
import { db, schema } from "@/server/db";
import { requireManager } from "@/server/guard";

export const metadata = { title: "Place fields" };

/* Where signers initial, sign, and where the date and their name go, on an uploaded PDF. */
export default async function TemplateFieldsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [template] = await db.select().from(schema.signTemplates).where(eq(schema.signTemplates.id, id)).limit(1);
  if (!template?.sourceKey || !template.sourcePages) notFound();
  return (
    <div>
      <Link href="/app/documents?tab=signing" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Documents to sign
      </Link>
      <PageHeader eyebrow={`Version ${template.version} · ${template.sourcePages} ${template.sourcePages === 1 ? "page" : "pages"}`} title={`Place fields: ${template.title}`} description="Put the signature, initials, date and printed name exactly where they belong on your own form." />
      <FieldEditor templateId={template.id} pages={template.sourcePages} initial={template.fields} sourceUrl={`/api/sign/templates/${template.id}/source`} />
    </div>
  );
}
