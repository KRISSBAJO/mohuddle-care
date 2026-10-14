import { SettingsNav } from "@/components/app/SettingsNav";
import { PageHeader } from "@/components/app/ui";
import { NoteRequirementsEditor } from "@/components/logs/NoteRequirementsEditor";
import { effectiveConfig } from "@/lib/note-requirements";
import { requireManager } from "@/server/guard";
import { requirementsAt } from "@/server/queries/note-requirements";

export const metadata = { title: "Daily note settings" };

/* The agency default daily note. Homes and people add to it from their own pages. */
export default async function NoteSettingsPage() {
  await requireManager();
  const rows = await requirementsAt("all", null);
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Daily notes"
        description="The default daily note for everyone. Each home's Details tab and each person's Care plan tab can switch sections on or off and add their own items, which then appear only on their notes."
      />
      <SettingsNav current="/app/settings/notes" />
      <NoteRequirementsEditor scope="all" targetId={null} name="the agency" above={effectiveConfig([])} rows={rows} manager />
    </div>
  );
}
