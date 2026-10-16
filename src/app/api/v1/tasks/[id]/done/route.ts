import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { finishTaskFor } from "@/server/tasks";

export const dynamic = "force-dynamic";

/* Marks a task done, with an optional note. */
export const POST = phoneRoute(
  async (user, request) => {
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    const body = (await request.json().catch(() => ({}))) as { note?: unknown };
    const result = await finishTaskFor(user, id, typeof body.note === "string" ? body.note : "");
    return result.error ? problem(400, "refused", result.error) : reply({ ok: true });
  },
  { writes: true },
);
