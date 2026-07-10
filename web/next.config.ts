import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export → deployed to Cloudflare Pages as static assets (T4.1).
  // The app is fully client-rendered (talks to the backend API + Supabase from
  // the browser), so every route is static-exportable. This avoids
  // @cloudflare/next-on-pages, which does not support Next 16.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
