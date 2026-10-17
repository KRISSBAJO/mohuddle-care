import "server-only";
import { isIP } from "node:net";
import { verifiedClientIp } from "@/lib/client-ip-proof";

/*
 * Where a request came from. A client can put anything in X-Forwarded-For; a proxy adds the real
 * address at the end. So: the header the hosting platform sets, when CLIENT_IP_HEADER names one
 * (for example cf-connecting-ip); otherwise the last X-Forwarded-For entry, which the proxy in front
 * of the server added; otherwise X-Real-IP. Empty when unknown.
 */
export function clientIpFrom(headers: Headers): string {
  const own = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (own === "x-mohuddle-client-ip") {
    const verified = verifiedClientIp(headers, process.env.FRONTEND_PROXY_SECRET);
    if (verified) return verified;
    // Requests sent directly to Render use its overwritten edge header, never client-supplied proof.
    const edge = process.env.RENDER === "true" ? headers.get("cf-connecting-ip") : null;
    return edge && isIP(edge) ? edge : "";
  }
  const chosen = own ? headers.get(own) : null;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map(part => part.trim()).filter(Boolean).at(-1);
  return (chosen ?? forwarded ?? headers.get("x-real-ip") ?? "").trim().slice(0, 64);
}
