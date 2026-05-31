import type { NextConfig } from "next";

/**
 * Proxy API requests through the Next.js origin so session cookies are
 * first-party (Vercel domain). Avoids cross-site cookie blocking on mobile
 * Safari/Chrome when the backend runs on a separate host (e.g. Render).
 *
 * Set API_PROXY_TARGET on Vercel to your Render API URL, e.g.
 * https://remarkable-api.onrender.com
 */
const apiProxyTarget =
  process.env.API_PROXY_TARGET ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    const base = apiProxyTarget.replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${base}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
