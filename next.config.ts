import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sphere view now lives inside the map page; old links (and their ?stop=) carry over.
  async redirects() {
    return [
      { source: "/explore", destination: "/map", permanent: false },
      { source: "/campaign", destination: "/map", permanent: false }, // the Campaign was retired
    ];
  },
};

export default nextConfig;
