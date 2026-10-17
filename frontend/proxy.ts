import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { clientIpProof } from "./src/lib/client-ip-proof";

// Vercel overwrites x-real-ip at function ingress. Rewrites alone preserve spoofed proxy headers.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of ["x-mohuddle-client-ip", "x-mohuddle-client-ip-at", "x-mohuddle-client-ip-signature"]) headers.delete(name);
  const key = process.env.FRONTEND_PROXY_SECRET;
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-real-ip") : null;
  if (key && key.length >= 32 && ip && isIP(ip)) {
    const at = String(Date.now());
    headers.set("x-mohuddle-client-ip", ip);
    headers.set("x-mohuddle-client-ip-at", at);
    headers.set("x-mohuddle-client-ip-signature", clientIpProof(ip, at, key));
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/api/:path*", "/login", "/owner/:path*", "/app/:path*", "/forgot-password", "/setup-password/:path*"] };
