const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || (process.env.PORT ? `.next-${process.env.PORT}` : ".next"),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

