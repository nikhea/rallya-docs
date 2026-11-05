import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/docs",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/docs/:slug*.md",
        destination: "/llms.mdx/docs/:slug*/content.md",
      },
    ];
  },
};

export default nextConfig;
