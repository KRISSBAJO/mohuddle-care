import "server-only";

/*
 * Where a request came from. A client can put anything in X-Forwarded-For; a proxy adds the real
 * address at the end. So: the header the hosting platform sets, when CLIENT_IP_HEADER names one
 * (for example cf-connecting-ip); otherwise the last X-Forwarded-For entry, which the proxy in front
 * of the server added; otherwise X-Real-IP. Empty when unknown.
 */
export function clientIpFrom(headers: Headers): string {
  const own = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  const chosen = own ? headers.get(own) : null;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map(part => part.trim()).filter(Boolean).at(-1);
  return (chosen ?? forwarded ?? headers.get("x-real-ip") ?? "").trim().slice(0, 64);
}
