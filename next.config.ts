import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN, not DENY, so the Hub can preview its own stored PDFs. Other sites still cannot frame it.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@node-rs/argon2", "@resvg/resvg-js"],
  // Each agency's own address on this machine (milestone.localhost:3400) may load the dev server's files.
  allowedDevOrigins: ["*.localhost"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The phone API signs in with a bearer token, never a cookie, so any origin may call it. This
      // lets the app's browser preview (another port) reach it; native phones do not need it.
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Headers", value: "authorization, content-type" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Max-Age", value: "600" },
        ],
      },
    ];
  },
};

export default nextConfig;
