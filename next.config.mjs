import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // The microphone stays available to our own pages (voice questions); nothing else is allowed.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep Next's dev badge away from the sidebar's Collapse button.
  devIndicators: { position: "bottom-right" },
  // Pin the project root so a lockfile higher up the disk isn't picked as the workspace root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // One app: the older assistant and dashboard pages now live inside the terminal.
  async redirects() {
    return [
      { source: "/assistant", destination: "/terminal/agent", permanent: false },
      { source: "/dashboard", destination: "/terminal", permanent: false },
    ];
  },
};

export default nextConfig;
