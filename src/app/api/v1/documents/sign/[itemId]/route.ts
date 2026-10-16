import { phoneRoute, problem, reply } from "@/server/mobile/api";
import { documentToSign } from "@/server/mobile/documents";

export const dynamic = "force-dynamic";

/* What one document to sign says. */
export const GET = phoneRoute(async (_user, request) => {
  const result = await documentToSign(new URL(request.url).pathname.split("/").at(-1) ?? "");
  return "error" in result ? problem(403, "refused", result.error ?? "Not found.") : reply(result);
});
