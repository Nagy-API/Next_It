import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The built-in local database ships WebAssembly files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
