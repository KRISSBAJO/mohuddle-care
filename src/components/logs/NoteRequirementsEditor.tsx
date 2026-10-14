import { ListPlus } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { Badge, Empty, Field, Panel } from "@/components/app/ui";
import { cn } from "@/lib/cn";
import { FIELD_TYPES, OPTIONAL_SECTIONS, SECTION_KEYS, type NoteConfig, type Scope } from "@/lib/note-requirements";
import { removeNoteItem, saveNoteItem, saveSectionSettings } from "@/server/actions/note-requirements";
import type { schema } from "@/server/db";

type Row = typeof schema.noteRequirements.$inferSelect;

const SCOPE_LABEL: Record<Scope | "default", string> = { default: "Built-in default", all: "Agency", home: "Home", person: "Person" };
const stateText = (state: { on: boolean; required: boolean }) => (!state.on ? "Off" : state.required ? "On, required" : "On");

function ItemFields({ item, prefix }: { item?: Row; prefix: string }) {
  return (
    <>
      <Field label="Question" htmlFor={`${prefix}-label`} hint="Write it the way staff should answer it.">
        <input id={`${prefix}-label`} name="label" required minLength={2} maxLength={120} className="field" defaultValue={item?.label} placeholder="Was the fire door checked at the end of the shift?" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Answer type" htmlFor={`${prefix}-type`}>
          <select id={`${prefix}-type`} name="fieldType" className="field" defaultValue={item?.fieldType ?? "yes_no"}>
            {Object.entries(FIELD_TYPES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </Field>
        <Field label="Unit" htmlFor={`${prefix}-unit`} hint="Numbers only, for example oz or lb.">
          <input id={`${prefix}-unit`} name="unit" maxLength={20} className="field" defaultValue={item?.unit} />
        </Field>
      </div>
      <Field label="Options" htmlFor={`${prefix}-options`} hint="For Pick one and Pick any. One per line.">
        <textarea id={`${prefix}-options`} name="options" rows={3} className="field" defaultValue={item?.options.join("\n")} placeholder={"Type 1\nType 2\nType 3"} />
      </Field>
      <Field label="Help for staff" htmlFor={`${prefix}-help`}>
        <input id={`${prefix}-help`} name="help" maxLength={200} className="field" defaultValue={item?.help} placeholder="Check the latch and the alarm light." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-sky/50">
          <input type="checkbox" name="required" defaultChecked={item?.required ?? true} className="h-4 w-4 accent-[#1b6fa8]" /> Must be answered on every note
        </label>
        <Field label="Order" htmlFor={`${prefix}-order`}>
          <input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={999} className="field" defaultValue={item?.sortOrder ?? 10} />
        </Field>
      </div>
    </>
  );
}

/*
 * What daily notes must cover at one level: agency-wide, one home or one person. Sections can follow the
 * level above or be switched on, made required or switched off here. Extra items add questions.
 */
export function NoteRequirementsEditor({
  scope,
  targetId,
  name,
  above,
  rows,
  manager,
}: {
  scope: Scope;
  targetId: string | null;
  name: string;
  /* What the levels above this one decide, before this level's own choices. */
  above: NoteConfig;
  rows: Row[];
  manager: boolean;
}) {
  const own = new Map(rows.filter(row => row.kind === "section").map(row => [row.section, row]));
  const ownItems = rows.filter(row => row.kind === "item");
  const inheritedItems = above.items;
  const valueFor = (key: string) => {
    const row = own.get(key);
    if (!row) return scope === "all" ? (above.sections[key as keyof typeof above.sections].on ? "on" : "off") : "inherit";
    return !row.enabled ? "off" : row.required ? "required" : "on";
  };
  const where = scope === "all" ? "every daily note" : scope === "home" ? `notes for everyone at ${name}` : `notes for ${name}`;

  return (
    <div className="space-y-6">
      <Panel title="Sections">
        <div className="p-5">
          <p className="mb-4 text-sm text-mute">
            Shift details, mood, required checks, health observations, plan goals, the summary and the signature are always on. Choose which other sections appear on {where}.
          </p>
          {manager ? (
            <ActionForm action={saveSectionSettings.bind(null, scope, targetId)} submitLabel="Save sections">
              <div className="overflow-hidden rounded-xl border border-line">
                {SECTION_KEYS.map(key => {
                  const inherited = above.sections[key];
                  return (
                    <div key={key} className="grid items-center gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_15rem]">
                      <div>
                        <label htmlFor={`${scope}-section-${key}`} className="text-sm font-semibold">{OPTIONAL_SECTIONS[key].title}</label>
                        <p className="text-xs text-mute">{OPTIONAL_SECTIONS[key].hint}</p>
                        {scope !== "all" && <p className="mt-0.5 text-[11px] text-dim">{SCOPE_LABEL[inherited.from]} setting: {stateText(inherited)}</p>}
                      </div>
                      <select id={`${scope}-section-${key}`} name={`section.${key}`} defaultValue={valueFor(key)} className="field py-2">
                        {scope !== "all" && <option value="inherit">Follow {scope === "home" ? "agency" : "home and agency"} ({stateText(inherited)})</option>}
                        <option value="on">On</option>
                        <option value="required">On and must be filled in</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </ActionForm>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECTION_KEYS.map(key => {
                const value = valueFor(key);
                const state = value === "inherit" ? above.sections[key] : { on: value !== "off", required: value === "required" };
                return (
                  <li key={key} className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2 text-sm">
                    {OPTIONAL_SECTIONS[key].title}
                    <Badge tone={!state.on ? "neutral" : state.required ? "brand" : "good"}>{stateText(state)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>

      <Panel
        title="Extra items"
        action={
          manager ? (
            <ModalForm action={saveNoteItem.bind(null, scope, targetId, null)} title={`Add an item to ${where}`} triggerLabel="Add item" triggerTone="ghost" submitLabel="Add item">
              <ItemFields prefix={`${scope}-new-item`} />
            </ModalForm>
          ) : undefined
        }
      >
        <div className="p-5 text-sm text-mute">
          Questions staff answer on {where}, in addition to the sections. For example, &ldquo;Bowel movement recorded on the chart?&rdquo; for one person, or &ldquo;Fire door checked?&rdquo; for one home.
        </div>
        {inheritedItems.length > 0 && scope !== "all" && (
          <ul className="divide-y divide-line/60 border-t border-line bg-panel/30">
            {inheritedItems.map(item => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <span className="font-medium">{item.label}</span>
                <Badge tone="neutral">{FIELD_TYPES[item.fieldType]}</Badge>
                {item.required && <Badge tone="brand">Required</Badge>}
                <span className="ml-auto text-xs text-dim">From {SCOPE_LABEL[item.scope].toLowerCase()} settings</span>
              </li>
            ))}
          </ul>
        )}
        {ownItems.length === 0 ? (
          <div className="border-t border-line">
            <Empty>
              <span className="inline-flex items-center gap-2"><ListPlus className="h-4 w-4" /> No extra items set here.</span>
            </Empty>
          </div>
        ) : (
          <ul className="divide-y divide-line/60 border-t border-line">
            {ownItems.map(item => (
              <li key={item.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{item.label}</span>
                    <Badge tone="neutral">{FIELD_TYPES[item.fieldType as keyof typeof FIELD_TYPES] ?? item.fieldType}</Badge>
                    {item.required && <Badge tone="brand">Required</Badge>}
                    {item.unit && <span className="text-xs text-mute">{item.unit}</span>}
                  </p>
                  {(item.options.length > 0 || item.help) && <p className={cn("text-xs text-mute")}>{[item.options.join(" · "), item.help].filter(Boolean).join(" — ")}</p>}
                </div>
                {manager && (
                  <div className="flex items-center gap-2">
                    <ModalForm action={saveNoteItem.bind(null, scope, targetId, item.id)} title="Edit item" triggerLabel="Edit" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save item">
                      <ItemFields item={item} prefix={`item-${item.id.slice(0, 8)}`} />
                    </ModalForm>
                    <ConfirmAction action={removeNoteItem.bind(null, scope, targetId, item.id)} label="Remove" confirm={`Remove "${item.label}"? Notes already written keep their answers.`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
