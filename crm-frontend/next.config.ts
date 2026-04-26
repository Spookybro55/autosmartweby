import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Phase 2 KROK 3: stock-photos.ts may map service types to Unsplash
    // CDN images via images.unsplash.com when `unsplashId` is populated.
    // Keep the entry here so swapping in a real ID later does not need
    // a config change. Pilot ships with all `unsplashId: null` and the
    // hero falls back to gradient + Lucide icon.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
