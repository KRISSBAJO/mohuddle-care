import type { NextConfig } from "next";
import path from "node:path";

const backend = (process.env.BACKEND_ORIGIN ?? "https://mohuddle-care.onrender.com").replace(/\/$/, "");
const url = new URL(backend);
if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("BACKEND_ORIGIN must use HTTPS.");

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: path.resolve(import.meta.dirname) },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  async rewrites() {
    return {
      beforeFiles: [
        ...["/portal-assets/:path+", "/api", "/app", "/owner", "/setup-password", "/auth", "/docs", "/api/:path*", "/app/:path*", "/owner/:path*", "/login", "/forgot-password", "/setup-password/:path*", "/auth/:path*", "/docs/:path*"].map(source => ({ source, destination: `${backend}${source}` })),
      ],
      afterFiles: [],
      fallback: [{ source: "/:path*", destination: `${backend}/:path*` }],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
    ] }];
  },
};
export default config;
