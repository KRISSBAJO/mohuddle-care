import { z } from "zod";
import { dateKey } from "@/lib/format";
import { requestTime } from "@/server/clock";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { noteFields } from "@/server/mobile/note-input";
import { staffSelfService } from "@/server/mobile/self-service";
import { cancelTimeOff, requestCorrection, requestTimeOff, signTimesheet } from "@/server/time-self-service";
export const dynamic = "force-dynamic";
export const GET = phoneRoute(async (user, request) => {
  const now = await requestTime(), today = dateKey(new Date(now));
  const params = new URL(request.url).searchParams;
  const week = params.get("week") ?? today, period = params.get("period") ?? today;
  if (!z.iso.date().safeParse(week).success || !z.iso.date().safeParse(period).success) return problem(400, "invalid", "Choose a valid date.");
  const result = await staffSelfService(user, week, period, now);
  return result ? reply(result) : problem(403, "no_staff", "Your login needs a linked staff record to see your time.");
});
export const POST = phoneRoute(async (user, request) => {
  const raw = await request.json().catch(() => null);
  const action = z.enum(["leave", "cancel_leave", "correction", "sign"]).safeParse(raw?.action);
  const form = noteFields(raw);
  if (!action.success || !form) return problem(400, "invalid", "The request could not be read.");
  const result = action.data === "leave" ? await requestTimeOff(user, form)
    : action.data === "cancel_leave" ? await cancelTimeOff(user, String(form.get("id") ?? ""))
      : action.data === "correction" ? await requestCorrection(user, form) : await signTimesheet(user, String(form.get("start") ?? ""), form);
  return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
}, { writes: true });
