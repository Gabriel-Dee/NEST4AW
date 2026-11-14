import type { NextConfig } from "next";

const BACKEND =
  process.env.API_PROXY_TARGET?.replace(/\/$/, "") ||
  "http://187.124.157.140:8010";

const nextConfig: NextConfig = {
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
  // Dev proxy: same-origin /api/* → live HTTP backend (mixed-content safe when UI is HTTPS).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/legacy/:path*", destination: `${BACKEND}/:path*` },
    ];
  },
};

export default nextConfig;
