import { requestTime } from "@/server/clock";
import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { personFacts } from "@/server/mobile/person";

export const dynamic = "force-dynamic";

/* A person's key facts for staff on shift. View only. */
export const GET = phoneRoute(async (_user, request) => {
  const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return problem(404, "not_found", "That person is not on record.");
  const facts = await personFacts(id, await requestTime());
  return facts ? reply(facts) : problem(404, "not_found", "That person is not on record.");
});
