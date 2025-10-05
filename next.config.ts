import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  trailingSlash: true,
  // Optimize for Firebase App Hosting
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['sqlite3'],
  },
  // Ensure proper handling of static files
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
