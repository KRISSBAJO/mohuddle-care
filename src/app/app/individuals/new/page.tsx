import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewPersonWizard, type NoteDefaults } from "@/components/person/NewPersonWizard";
import { PageHeader } from "@/components/app/ui";
import { dateKey, labels } from "@/lib/format";
import type { NoteConfig } from "@/lib/note-requirements";
import { createPerson } from "@/server/actions/people";
import { requireManager } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import { configAbove } from "@/server/queries/note-requirements";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Add a person" };

const simplify = (config: NoteConfig, homeName?: string): NoteDefaults => ({
  sections: Object.fromEntries(Object.entries(config.sections).map(([key, state]) => [key, { on: state.on, required: state.required }])) as NoteDefaults["sections"],
  items: config.items.map(item => ({ label: item.label, from: item.scope === "home" && homeName ? homeName : "agency-wide" })),
});

export default async function NewIndividualPage() {
  await requireManager();
  const [homes, settings, agency] = await Promise.all([listHomes(), getSettings(), configAbove(null)]);
  const perHome = await Promise.all(homes.map(async home => [home.id, simplify(await configAbove(home.id), home.name)] as const));

  return (
    <div className="max-w-6xl">
      <Link href="/app/individuals" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> People we support
      </Link>
      <PageHeader
        eyebrow="People we support"
        title="Add a person"
        description="Eight short steps, from who they are to what their daily notes must cover. Only the name is required. Nothing is saved until you add them on the last step."
      />
      <div className="mt-6">
        <NewPersonWizard
          action={createPerson}
          today={dateKey()}
          homes={homes.map(home => ({ id: home.id, name: home.name }))}
          services={labels.serviceType}
          lists={{
            careTeamRoles: settings.care_team_roles,
            insuranceTypes: settings.insurance_types,
            goalServices: settings.goal_services,
            communication: settings.communication_options,
            mobility: settings.mobility_options,
            diet: settings.diet_options,
          }}
          noteDefaults={{ "": simplify(agency), ...Object.fromEntries(perHome) }}
        />
      </div>
    </div>
  );
}
