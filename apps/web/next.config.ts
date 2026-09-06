// en-GB: Configures next config so tooling follows the repository testing and build conventions.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.*.*.*"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" }
        ]
      }
    ];
  },
  ...(process.env.VISUAL_REGRESSION === "1" ? { devIndicators: false } : {})
};

export default nextConfig;
