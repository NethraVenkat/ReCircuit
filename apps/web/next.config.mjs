import path from "node:path";
import { fileURLToPath } from "node:url";
const nextConfig = {
  experimental: {
    outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
