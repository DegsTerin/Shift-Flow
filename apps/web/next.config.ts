// en-GB: Configures next config so tooling follows the repository testing and build conventions.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.*.*.*"],
  ...(process.env.VISUAL_REGRESSION === "1" ? { devIndicators: false } : {})
};

export default nextConfig;
