import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generate the portable server inside Linux containers; keep native Windows builds unchanged.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
