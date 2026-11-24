import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes nativos/servidor que não devem ser empacotados pelo bundler.
  devIndicators: false,
  serverExternalPackages: ["@libsql/client", "libsql", "@mastra/core"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
