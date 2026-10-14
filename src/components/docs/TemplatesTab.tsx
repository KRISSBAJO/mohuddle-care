import { asc } from "drizzle-orm";
import { FileSignature, FileText, Upload } from "lucide-react";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { sections } from "@/lib/signing";
import { saveTextTemplate, setTemplateActive } from "@/server/actions/signing";
import { db, schema } from "@/server/db";
import { ensureDefaultTemplates } from "@/server/docs/default-templates";
import { env } from "@/server/env";
import { documentTypes } from "@/server/queries/documents";
import { FileUpload } from "./FileUpload";

type Template = typeof schema.signTemplates.$inferSelect;
type Type = Awaited<ReturnType<typeof documentTypes>>[number];

function TypeSelect({ types, value, id }: { types: Type[]; value?: string | null; id: string }) {
  return (
    <select id={id} name="typeId" data-extra className="field" defaultValue={value ?? ""}>
      <option value="">Do not file under a type</option>
      {(["staff", "person", "business"] as const).map(category => (
        <optgroup key={category} label={category === "staff" ? "Staff" : category === "person" ? "People supported" : "Business"}>
          {types.filter(type => type.category === category).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function TextFields({ template, types, prefix }: { template?: Template; types: Type[]; prefix: string }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field label="Name" htmlFor={`${prefix}-title`}><input id={`${prefix}-title`} name="title" required minLength={2} maxLength={160} className="field" defaultValue={template?.title} /></Field>
        <Field label="Signed by" htmlFor={`${prefix}-cat`}>
          <select id={`${prefix}-cat`} name="category" className="field" defaultValue={template?.category ?? "staff"}>
            <option value="staff">Staff</option>
            <option value="person">Person or guardian</option>
            <option value="business">Business</option>
          </select>
        </Field>
      </div>
      <Field label="File the signed copy as" htmlFor={`${prefix}-type`}><TypeSelect types={types} value={template?.typeId} id={`${prefix}-type`} /></Field>
      <Field label="Document text" htmlFor={`${prefix}-body`} hint="Start each section with # and a heading. {{name}}, {{date}} and {{agency}} are filled in when signed.">
        <textarea id={`${prefix}-body`} name="body" rows={14} required className="field font-mono text-xs" defaultValue={template?.body ?? "# First section\nI, {{name}}, confirm that...\n\n# Second section\n..."} />
      </Field>
      <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
        <input type="checkbox" name="initialEach" defaultChecked={template?.initialEach ?? true} className="h-4 w-4 accent-[#1b6fa8]" /> Initial every section
      </label>
      {template && <p className="text-xs text-mute">Changing the wording starts version {template.version + 1}. Documents already signed keep the version they signed.</p>}
    </>
  );
}

/* Documents people sign online: written in the Hub, or uploaded as a PDF. */
export async function TemplatesTab() {
  await ensureDefaultTemplates();
  const [templates, types] = await Promise.all([db.select().from(schema.signTemplates).orderBy(asc(schema.signTemplates.category), asc(schema.signTemplates.title)), documentTypes()]);
  const typeName = new Map(types.map(type => [type.id, type.name]));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-brand" /> Write a document to sign</h2>
          <p className="mt-1 text-sm text-mute">Policies, acknowledgments and consents. Each section is initialled, then signed at the end.</p>
          <div className="mt-3">
            <ModalForm action={saveTextTemplate.bind(null, null)} title="Write a document to sign" triggerLabel="Write a document" submitLabel="Save document">
              <TextFields types={types} prefix="new-template" />
            </ModalForm>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-bold"><Upload className="h-4 w-4 text-brand" /> Upload a PDF to sign</h2>
          <p className="mt-1 text-sm text-mute">Every page is initialled and a signature page with a certificate is added.</p>
          <div className="mt-3">
            <FileUpload
              endpoint="/api/sign/templates"
              fields={{}}
              label="Choose a PDF"
              hint="PDF only"
              maxMb={env.MAX_UPLOAD_MB}
              compact
              extra={
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-mute sm:col-span-2">
                    Name
                    <input data-extra name="title" className="field py-1.5 text-sm font-normal text-ink" placeholder="Agency vehicle use agreement" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-mute">
                    Signed by
                    <select data-extra name="category" className="field py-1.5 text-sm font-normal text-ink" defaultValue="staff">
                      <option value="staff">Staff</option>
                      <option value="person">Person or guardian</option>
                      <option value="business">Business</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-mute">
                    File the signed copy as
                    <TypeSelect types={types} id="upload-template-type" />
                  </label>
                </div>
              }
            />
          </div>
        </div>
      </div>

      <Panel title={`Documents to sign (${templates.filter(template => template.active).length})`}>
        {templates.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {templates.map(template => {
              const parts = template.sourceKey ? null : sections(template.body);
              return (
                <li key={template.id} className={cn("px-5 py-4", !template.active && "opacity-60")}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <FileSignature className="h-4 w-4 text-plum" />
                        <span className="font-semibold">{template.title}</span>
                        <Badge tone="neutral">{template.category === "staff" ? "Staff" : template.category === "person" ? "Person or guardian" : "Business"}</Badge>
                        <Badge tone="brand">{template.sourceKey ? `PDF, ${template.sourcePages} pages` : `${parts?.length ?? 0} sections`}</Badge>
                        <span className="text-xs text-dim">Version {template.version}</span>
                        {!template.active && <Badge tone="neutral">Retired</Badge>}
                      </p>
                      <p className="text-xs text-mute">{template.typeId ? `Filed as ${typeName.get(template.typeId) ?? "a retired type"}` : "Not filed under a type"}{template.initialEach ? ` · initialled on every ${template.sourceKey ? "page" : "section"}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!template.sourceKey && (
                        <ModalForm action={saveTextTemplate.bind(null, template.id)} title={`Edit ${template.title}`} triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                          <TextFields template={template} types={types} prefix={`tpl-${template.id.slice(0, 8)}`} />
                        </ModalForm>
                      )}
                      <ConfirmAction action={setTemplateActive.bind(null, template.id, !template.active)} label={template.active ? "Retire" : "Restore"} confirm={template.active ? `Retire ${template.title}? It can no longer be sent. Signed copies are kept.` : undefined} />
                    </div>
                  </div>
                  {parts && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-brand">Preview</summary>
                      <div className="mt-2 space-y-3 rounded-xl bg-panel/50 p-4 text-sm">
                        {parts.map((part, index) => (
                          <div key={index}>
                            {part.heading && <p className="font-semibold">{part.heading}</p>}
                            <p className="whitespace-pre-line text-mute">{part.text}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
