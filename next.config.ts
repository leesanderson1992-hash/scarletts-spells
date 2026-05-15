import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/analyse/review",
        destination: "/courses/review",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
