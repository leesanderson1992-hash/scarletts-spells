import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forms left open across a release must not submit a Server Action ID from
  // an older build. Next uses this marker to hard-navigate on version skew.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.110"],
  experimental: {
    // The Teaching Dictionary CSV export is about 2.4 MB. Leave multipart
    // overhead above the import action's 4 MB file limit.
    serverActions: { bodySizeLimit: "4.2mb" },
  },
};

export default nextConfig;
