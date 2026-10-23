const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV !== "production" && process.env.PORT ? `.next-${process.env.PORT}` : ".next"),
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: "/portal/:tenant/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;

