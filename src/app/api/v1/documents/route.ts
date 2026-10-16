import { phoneRoute, reply } from "@/server/mobile/api";
import { myDocuments } from "@/server/mobile/documents";

export const dynamic = "force-dynamic";

/* What the agency has asked the staff member for, and the state of their file. */
export const GET = phoneRoute(async user => reply(await myDocuments(user)));
