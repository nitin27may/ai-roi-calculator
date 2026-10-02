import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@studio/engine", "@studio/catalog"],
  // Runs locally only; no remote images.
  images: { unoptimized: true },
  webpack(cfg) {
    // Workspace packages use NodeNext-style ".js" specifiers for ".ts" sources.
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
