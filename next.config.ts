import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The release supplies the first 32 SHA characters as NEXT_DEPLOYMENT_ID at build time. VERCEL_DEPLOYMENT_ID
  // is not available in our CLI builds, so relying on it left Server Action
  // forms without a version marker after promotion.
  deploymentId: (process.env.NEXT_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_URL)?.slice(0, 32),
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.110"],
  experimental: {
    // The Teaching Dictionary CSV export is about 2.4 MB. Leave multipart
    // overhead above the import action's 4 MB file limit.
    serverActions: { bodySizeLimit: "4.2mb" },
  },
};

export default nextConfig;
