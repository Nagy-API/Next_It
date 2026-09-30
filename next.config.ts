import type { NextConfig } from "next";

/** Security headers on every response (the Content-Security-Policy is set per request in src/proxy.ts). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Browsers only honour this over HTTPS; it tells them to never use plain HTTP for a year.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // The built-in local database ships WebAssembly files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Shared hosting limits how many processes a build may start: build in one process, with worker threads.
  experimental: { cpus: 1, workerThreads: true, webpackBuildWorker: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
