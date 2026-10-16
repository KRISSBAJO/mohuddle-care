import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { commentOnTaskFor } from "@/server/tasks";

export const dynamic = "force-dynamic";

/* Adds to a task's conversation; the others involved are told. */
export const POST = phoneRoute(
  async (user, request) => {
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    const body = (await request.json().catch(() => ({}))) as { body?: unknown };
    const result = await commentOnTaskFor(user, id, typeof body.body === "string" ? body.body : "");
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
