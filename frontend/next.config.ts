import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },

  // ═══════════════════════════════════════════════════════════
  // 🛡️  FRONTEND KAYNAK LİMİTLERİ
  // Not: Asıl bellek sınırı package.json'daki
  // NODE_OPTIONS="--max-old-space-size=768" ile yapılıyor.
  // ═══════════════════════════════════════════════════════════

  // Production build'de source map üretme (build sırasında RAM tasarrufu)
  productionBrowserSourceMaps: false,
};

export default nextConfig;
