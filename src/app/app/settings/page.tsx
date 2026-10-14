import { ActionForm } from "@/components/app/ActionForm";
import { Field, PageHeader, Panel } from "@/components/app/ui";
import { saveSettings } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { getSettings, settingDefs, type SettingKey } from "@/server/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireManager();
  const settings = await getSettings();
  const keys = Object.keys(settingDefs) as SettingKey[];
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Settings" title="Business rules" description="These rules drive the Today page, the medication record, the schedule and every daily log. Change them here and the whole Hub follows." />
      <Panel>
        <div className="p-5">
          <ActionForm action={saveSettings} submitLabel="Save settings">
            {keys.map(key => {
              const def = settingDefs[key];
              const value = settings[key];
              return def.kind === "list" ? (
                <Field key={key} label={def.label} htmlFor={key}>
                  <textarea id={key} name={key} rows={5} className="field" defaultValue={(value as string[]).join("\n")} />
                </Field>
              ) : (
                <Field key={key} label={def.label} htmlFor={key}>
                  <input id={key} name={key} type="number" className="field max-w-xs" defaultValue={String(value)} />
                </Field>
              );
            })}
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}
