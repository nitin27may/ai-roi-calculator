import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@roi-calculator/engine", "@roi-calculator/catalog"],
  // Static export for Cloudflare Pages; no remote images.
  images: { unoptimized: true },
  output: "export",
  webpack(cfg) {
    // Workspace packages use NodeNext-style ".js" specifiers for ".ts" sources.
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
