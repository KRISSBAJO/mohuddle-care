import { phoneRoute, reply } from "@/server/mobile/api";
import { myTasks } from "@/server/tasks";

export const dynamic = "force-dynamic";

/* The staff member's open tasks, and the ones they finished in the last day. */
export const GET = phoneRoute(async user => reply({ tasks: await myTasks(user) }));
