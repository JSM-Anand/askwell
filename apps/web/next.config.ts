import type { NextConfig } from "next";

// Security headers (project.md §9, Clickjacking). Only /embed may be framed by other sites.
// No script/style CSP here: it would need nonces for Clerk and PostHog. HSTS comes from Vercel.
const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export async function securityHeaders() {
  return [
    {
      // Every route except /embed and /embed/...
      source: "/((?!embed(?:/|$)).*)",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ...commonHeaders,
      ],
    },
    {
      // Any customer site may frame the chat panel.
      source: "/embed/:path*",
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }, ...commonHeaders],
    },
  ];
}

const nextConfig: NextConfig = {
  transpilePackages: ["@askwell/shared"],
  headers: securityHeaders,
};

export default nextConfig;
