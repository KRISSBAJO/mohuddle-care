import { timingSafeEqual } from "node:crypto";
import { sweepNotifications } from "@/server/notification-sweep";

export const dynamic = "force-dynamic";

const SECRET = process.env.CRON_SECRET ?? "";

function allowed(request: Request) {
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(SECRET);
  return SECRET.length >= 16 && given.length === expected.length && timingSafeEqual(given, expected);
}

/* Runs the timed reminders. Called every minute by the server itself, or by a scheduled job when hosted. */
export async function POST(request: Request) {
  if (!allowed(request)) return new Response(null, { status: 401 });
  const result = await sweepNotifications();
  return Response.json(result);
}
