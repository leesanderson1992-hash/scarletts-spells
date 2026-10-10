import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.110"],
  experimental: {
    // The Teaching Dictionary CSV export is about 2.4 MB. Leave multipart
    // overhead above the import action's 4 MB file limit.
    serverActions: { bodySizeLimit: "4.2mb" },
  },
};

export default nextConfig;
