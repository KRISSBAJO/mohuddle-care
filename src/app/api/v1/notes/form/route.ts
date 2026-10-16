import { requestTime } from "@/server/clock";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { noteForm } from "@/server/mobile/notes";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f-]{36}$/;

/* What one person's shift note asks: GET /api/v1/notes/form?person=…&shift=… */
export const GET = phoneRoute(async (user, request) => {
  const params = new URL(request.url).searchParams;
  const person = params.get("person") ?? "";
  const shift = params.get("shift") || null;
  if (!uuid.test(person) || (shift && !uuid.test(shift))) return problem(400, "invalid", "Choose the person and shift again.");
  const form = await noteForm(user, person, shift, await requestTime());
  return "error" in form ? problem(404, "not_found", form.error as string) : reply(form);
});
