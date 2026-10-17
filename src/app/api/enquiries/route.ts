import { handleDemoRequest } from "@/lib/demo-request";
import { submitEnquiry } from "@/server/actions/public";
import { env } from "@/server/env";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleDemoRequest(request, env.APP_URL, data => submitEnquiry({ ok: false }, data));
}
