import Image from "next/image";
import { Bell, CheckCircle2, Clock3, Coffee } from "lucide-react";

/* A real moment with Mohuddle's alerts sliding in over it, the way they arrive on a phone. */
export function AlertsScene() {
  const alerts = [
    { icon: Clock3, title: "Your shift at Hillcrest starts at 7:00 AM", body: "You can clock in up to 15 minutes before.", tone: "bg-white" },
    { icon: Coffee, title: "Your break ends at 12:30 PM", body: "5 minutes left of your meal break.", tone: "bg-white" },
    { icon: CheckCircle2, title: "Your note for Aisha was approved", body: "Reviewed by Angela Reyes.", tone: "bg-[#ecf5d0]" },
  ];
  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-[32px]">
      <Image src="/images/care-team.png" alt="Illustration: a care team talking together at a home" fill sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f2c25]/75 via-[#0f2c25]/25 to-transparent" />
      <div className="relative flex h-full min-h-[460px] flex-col justify-end gap-3 p-6 sm:p-10">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#dcef98]"><Bell className="h-4 w-4" /> On their phone</p>
        <div className="max-w-sm space-y-2.5">
          {alerts.map((alert, i) => (
            <div key={alert.title} data-reveal className={`mh-toast flex gap-3 rounded-2xl ${alert.tone} p-3.5 text-[#173e35] shadow-[0_20px_40px_-20px_rgba(0,0,0,.5)]`} style={{ ["--d" as string]: `${i * 450}ms` }}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#173e35] text-[#dcef98]"><alert.icon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{alert.title}</span>
                <span className="block text-xs text-[#5b6b62]">{alert.body}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
