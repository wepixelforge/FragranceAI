import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [390, 640, 750, 828, 1080, 1200, 1440, 1920],
    imageSizes: [64, 96, 128, 256, 384, 420],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        protocol: 'https',
        hostname: 'thescentstories.com',
        pathname: '/web/image/**',
      },
    ],
  },
};

export default nextConfig;
