import { ActionForm } from "@/components/app/ActionForm";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ModalForm } from "@/components/app/ModalForm";
import { SettingsNav } from "@/components/app/SettingsNav";
import { Badge, Empty, PageHeader, Panel } from "@/components/app/ui";
import { DifferentialFields } from "@/components/clock/DifferentialFields";
import { dollars } from "@/lib/pay";
import { saveDifferential, setDifferentialActive } from "@/server/actions/pay";
import { requireManager } from "@/server/guard";
import { listHomes } from "@/server/queries/hub";
import { listDifferentials } from "@/server/queries/pay";

export const metadata = { title: "Pay differentials" };

const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* Extra pay per hour for nights, weekends or a hard-to-staff home. Administrators set these. */
export default async function DifferentialsPage() {
  const user = await requireManager();
  const admin = user.role === "admin";
  const [rows, homes] = await Promise.all([listDifferentials(), listHomes()]);
  const homeOptions = homes.map(home => ({ id: home.id, name: home.name }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Pay differentials"
        description="Extra pay per hour for nights, weekends or a particular home. They add up when more than one applies, and count toward the regular rate for overtime, as federal law requires."
      />
      <SettingsNav current="/app/settings/differentials" />
      {!admin && <p className="mb-5 rounded-xl bg-panel px-4 py-3 text-sm text-mute">Only administrators can change pay differentials.</p>}

      <Panel title={`Differentials (${rows.length})`}>
        {rows.length === 0 ? (
          <Empty>No differentials yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map(({ differential: item, home }) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">{item.name} {!item.active && <Badge tone="neutral">Off</Badge>}</span>
                  <span className="block text-xs text-mute">
                    {item.kind === "home"
                      ? `Every hour at ${home ?? "a home"}`
                      : item.kind === "hours"
                        ? `${item.startTime} to ${item.endTime}${item.days.length ? ` on ${item.days.map(n => dayNames[n]).join(", ")}` : ", every day"}`
                        : `All day ${item.days.map(n => dayNames[n]).join(", ")}`}
                  </span>
                </span>
                <span className="font-display text-lg font-bold">+{dollars(item.centsPerHour)}/h</span>
                {admin && (
                  <span className="flex gap-2">
                    <ModalForm action={saveDifferential.bind(null, item.id)} title={`Change ${item.name}`} triggerLabel="Change" triggerIcon="pencil" triggerTone="ghost" submitLabel="Save">
                      <DifferentialFields value={item} homes={homeOptions} prefix={`diff-${item.id.slice(0, 8)}`} />
                    </ModalForm>
                    <ConfirmAction action={setDifferentialActive.bind(null, item.id, !item.active)} label={item.active ? "Turn off" : "Turn on"} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {admin && (
        <Panel title="Add a differential" className="mt-6">
          <div className="p-5">
            <ActionForm action={saveDifferential.bind(null, null)} submitLabel="Add differential">
              <DifferentialFields homes={homeOptions} prefix="new-diff" />
            </ActionForm>
          </div>
        </Panel>
      )}
    </div>
  );
}
