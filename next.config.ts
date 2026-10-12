import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * Scripts allow 'unsafe-inline' because Next streams inline bootstrap scripts and
 * next-themes sets the theme class before paint; a per-request nonce would force
 * every page dynamic and defeat cacheComponents / partial prerendering. What the
 * policy does pin down: scripts, data and workers only from this origin, no
 * plugins, no framing, no <base> hijack, and forms can only post back here.
 * Dev adds 'unsafe-eval' and websocket connects for React Refresh and HMR.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers ignore HSTS over plain http, but sending it from a dev server on a LAN
  // address can pin that host to https in the browser, so production only.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // The build id used to live here and be read by the update prompt. It does not any
  // more: that prompt now asks the waiting service worker which build it is, so the
  // two can never be from different builds. See serwist.config.mjs.
  // The dev server listens on 0.0.0.0. Opening it at 127.0.0.1 is treated as
  // cross-origin, which blocks the HMR socket and leaves the page on the SSR shell.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pg"],
  cacheComponents: true,
  partialPrefetching: true,
  /**
   * Named cache lives, so the numbers behind them are written down once instead
   * of being re-derived at every `cacheLife` call site. See `cacheLife.md` for
   * what each of the three timings does.
   *
   * `stale` is how long the client router may reuse a payload before it has to
   * ask the server — it must stay at 30s or more for a prefetched link to still
   * be usable when it is clicked. `revalidate` is how often the server refreshes
   * an entry in the background, and it is deliberately short: on a serverless
   * deployment `use cache` lives in one instance's memory, so the tag a write
   * expires cannot reach the entries another instance is holding. This is the
   * backstop for that. `expire` is the hard ceiling.
   */
  cacheLife: {
    ledger: { stale: 300, revalidate: 60, expire: 600 },
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses carry ledger data: never let a shared cache keep them.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The service worker must be revalidated on every load or an old one keeps serving.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
