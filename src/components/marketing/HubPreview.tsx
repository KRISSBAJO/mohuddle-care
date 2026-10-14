import { CheckCircle2, Clock, Pill, Users } from "lucide-react";

/* A quiet picture of a good day: the Hub's morning view, drawn with real-looking data. */
export function HubPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute -left-10 top-10 h-56 w-56 rounded-full bg-accent-soft blur-3xl" aria-hidden="true" />
      <div className="absolute -right-6 bottom-0 h-64 w-64 rounded-full bg-sky blur-3xl" aria-hidden="true" />

      <div className="card relative overflow-hidden rounded-3xl p-5 shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Today at Hillcrest House</p>
            <p className="mt-1 font-display text-lg font-bold">Everyone is supported</p>
          </div>
          <span className="chip bg-sage-soft text-sage">On track</span>
        </div>

        <ul className="mt-5 grid grid-cols-3 gap-2">
          <li className="rounded-xl bg-panel p-3">
            <Users className="h-4 w-4 text-brand" aria-hidden="true" />
            <p className="mt-2 font-display text-2xl font-bold">4</p>
            <p className="text-xs text-mute">people at home</p>
          </li>
          <li className="rounded-xl bg-panel p-3">
            <Pill className="h-4 w-4 text-plum" aria-hidden="true" />
            <p className="mt-2 font-display text-2xl font-bold">6/6</p>
            <p className="text-xs text-mute">morning meds given</p>
          </li>
          <li className="rounded-xl bg-panel p-3">
            <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
            <p className="mt-2 font-display text-2xl font-bold">2</p>
            <p className="text-xs text-mute">staff on shift</p>
          </li>
        </ul>

        <ul className="mt-5 space-y-2.5">
          {[
            ["Marcus", "Day program bus at 8:15, swim class after lunch", "done"],
            ["Tasha", "Dental visit 10:30 with Angela, lunch out after", "soon"],
            ["Devon", "Job coaching shift at Kroger, 1pm to 5pm", "later"],
          ].map(([name, plan, state]) => (
            <li key={name} className="flex items-start gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky font-display text-sm font-bold text-brand-deep">
                {name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-mute">{plan}</p>
              </div>
              {state === "done" ? (
                <CheckCircle2 className="mt-1 h-4 w-4 text-sage" aria-label="Done" />
              ) : (
                <span className={`chip ${state === "soon" ? "bg-accent-soft text-[#8a5a10]" : "bg-panel text-mute"}`}>
                  {state === "soon" ? "Soon" : "Later"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="drift absolute -right-4 top-6 hidden rounded-2xl border border-line bg-white px-4 py-3 shadow-[var(--shadow-card)] sm:block">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Credentials</p>
        <p className="mt-1 text-sm font-semibold">All staff current</p>
        <p className="text-xs text-sage">Next renewal in 41 days</p>
      </div>
    </div>
  );
}
