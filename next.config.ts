import type { NextConfig } from "next";

// Security baseline. Applied to every response by Next via the
// `headers()` hook. These are conservative defaults that don't break
// the existing dashboard surfaces:
//   • X-Content-Type-Options: blocks MIME sniffing.
//   • X-Frame-Options: prevents the app from being framed by foreign
//     origins (defends against clickjacking). SAMEORIGIN keeps the
//     record-detail card's iframe of the image generator working.
//   • Referrer-Policy: strict-origin-when-cross-origin keeps the path
//     out of cross-site Referer leaks while preserving the signal on
//     internal navigation.
//   • Permissions-Policy: disable browser features we don't use so a
//     compromised script can't quietly turn them on.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Strip the `X-Powered-By: Next.js` banner — small fingerprint win.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
