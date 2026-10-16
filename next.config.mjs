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
  // Fixtures are read with fs at runtime (dynamic paths), so bundle them into every server function.
  outputFileTracingIncludes: { "/**": ["./data/**/*"], "/**/*": ["./data/**/*"] },
  // Paths built from process.cwd() make the tracer pull in the whole project, including the build
  // cache Vercel restores (~350 MB). That pushes every route over the function size budget, so
  // Vercel stops grouping them: 40 functions, past the Hobby limit of 12. Nothing reads these at runtime.
  outputFileTracingExcludes: {
    "/**": ["./.next/cache/**/*", "./scripts/**/*", "./evals/**/*", "./*.md"],
    "/**/*": ["./.next/cache/**/*", "./scripts/**/*", "./evals/**/*", "./*.md"],
  },
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
