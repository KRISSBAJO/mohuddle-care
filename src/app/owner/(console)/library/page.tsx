import { ListChecks } from "lucide-react";
import { ListEditor, SettingsGroupForm } from "@/components/app/SettingsForms";
import { OwnerCard } from "@/components/owner/OwnerCard";
import { saveHandoverLibraryAction } from "@/server/actions/owner";
import { handoverLibrary } from "@/server/handover-library";
import { requireOwner } from "@/server/owner-auth";

export const metadata = { title: "Shared lists" };

/* Lists Mohuddle offers every agency to choose from. Agencies pick what they want and add their own. */
export default async function LibraryPage() {
  await requireOwner();
  const library = await handoverLibrary();
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#153a32] via-[#1b4a3e] to-[#286b55] p-6 text-white shadow-[0_24px_60px_-30px_#0e2a24] sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#dcef98]/15 blur-3xl" aria-hidden="true" />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Running Mohuddle</p>
        <h1 className="relative mt-2 text-3xl font-bold sm:text-4xl">Shared lists</h1>
        <p className="relative mt-2 max-w-xl text-sm text-white/70">Ready-made items every agency can choose from in its settings. Agencies tick what they want and add their own; changing this list never changes what an agency already chose.</p>
      </section>

      <OwnerCard title="Shift-change items" icon={ListChecks} action={<span className="text-xs text-mute">{library.length} items</span>}>
        <SettingsGroupForm action={saveHandoverLibraryAction} submitLabel="Save shift-change items">
          <div className="px-5 py-4">
            <p className="mb-3 text-sm text-mute">Outgoing staff confirm each chosen item at clock out; incoming staff read and acknowledge them at clock in.</p>
            <ListEditor name="handover_library" initial={library} placeholder="Add an item" />
          </div>
        </SettingsGroupForm>
      </OwnerCard>
    </div>
  );
}
