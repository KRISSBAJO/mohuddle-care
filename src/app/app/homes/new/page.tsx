import Link from "next/link";
import { ArrowLeft, CalendarPlus, ClipboardList, Pill, UserPlus } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { HomeFormFields } from "@/components/app/HomeFormFields";
import { PageHeader } from "@/components/app/ui";
import { createHome } from "@/server/actions/hub";
import { requireManager } from "@/server/guard";
import { listStaff } from "@/server/queries/hub";

export const metadata = { title: "Add a home" };

export default async function NewHomePage() {
  await requireManager();
  const staff = await listStaff();

  return (
    <div className="max-w-6xl">
      <Link href="/app/homes" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to homes
      </Link>
      <PageHeader
        eyebrow="Homes"
        title="Add a home"
        description="Set it up once, properly. Only the name, type, places and city are required; everything else can be filled in later from the home's Details tab."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ActionForm action={createHome} submitLabel="Create home" className="card p-6">
          <HomeFormFields staff={staff} includeManagement />
        </ActionForm>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="card p-5">
            <h2 className="text-sm font-bold">After you create it</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                [UserPlus, "Move people in", "From each person's page, choose this home under Edit details."],
                [CalendarPlus, "Fill the schedule", "Use Add shifts on the schedule to create the week's shifts in one go."],
                [Pill, "Medication rounds", "The home's rounds fill in from its residents' medications."],
                [ClipboardList, "Expenses and issues", "Staff log spending and report problems from the home's page."],
              ].map(([Icon, title, body], index) => {
                const I = Icon as typeof UserPlus;
                return (
                  <li key={index} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky text-brand-deep"><I className="h-3.5 w-3.5" /></span>
                    <span>
                      <span className="block font-semibold">{title as string}</span>
                      <span className="text-xs text-mute">{body as string}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-5 text-xs leading-relaxed text-mute">
            <p className="font-semibold text-ink">Staffing needs by type</p>
            <p className="mt-1">Group homes usually need day, evening and overnight every day. Day programs need day shifts on weekdays. Host family homes and drop-in supported living usually need none.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
