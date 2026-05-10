import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clerk (and Next 16 “proxy”) buffer request bodies for middleware + route
  // handlers. Default is 10MB — large PDFs get truncated and multipart
  // FormData fails with “expected boundary after body”.
  experimental: {
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
