import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { taskWithComments } from "@/server/tasks";

export const dynamic = "force-dynamic";

/* One task with its conversation. */
export const GET = phoneRoute(async (_user, request) => {
  const task = await taskWithComments(new URL(request.url).pathname.split("/").at(-1) ?? "");
  return task ? reply(task) : problem(404, "not_found", "That task was deleted.");
});
