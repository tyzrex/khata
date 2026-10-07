import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server listens on 0.0.0.0. Opening it at 127.0.0.1 is treated as
  // cross-origin, which blocks the HMR socket and leaves the page on the SSR shell.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pg"],
  cacheComponents: true,
  partialPrefetching: true,
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
