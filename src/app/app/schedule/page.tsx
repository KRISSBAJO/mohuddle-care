import { Scheduler } from "@/components/schedule/Scheduler";
import { addDays, dateKey, weekStart } from "@/lib/format";
import { canManage } from "@/server/auth";
import { requireUser } from "@/server/guard";
import { scheduleData } from "@/server/queries/schedule";

export const metadata = { title: "Schedule" };

type Search = { week?: string; view?: string; day?: string; home?: string };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const today = dateKey();
  const start = weekStart(params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const data = await scheduleData(start);
  const view = params.view === "staff" || params.view === "day" ? params.view : "homes";
  const day = params.day && days.includes(params.day) ? params.day : days.includes(today) ? today : days[0];
  const home = params.home && data.homes.some(h => h.id === params.home) ? params.home : "";

  return (
    <Scheduler
      key={start}
      weekStart={start}
      days={days}
      today={data.today}
      homes={data.homes}
      staff={data.staff}
      former={data.former}
      shifts={data.shifts}
      rules={data.rules}
      manager={canManage(user)}
      myStaffId={user.staffId}
      initialView={view}
      initialDay={day}
      initialHome={home}
    />
  );
}
