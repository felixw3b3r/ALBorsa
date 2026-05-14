import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    turbopack: false,
  },
  /* Diğer yapılandırma seçenekleri buraya eklenebilir */
};

export default nextConfig;
