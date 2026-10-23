import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * Baseline response security headers.
 *
 * Scope note: the CSP here deliberately omits `script-src`/`default-src`.
 * Next.js injects inline bootstrap scripts, so a meaningful `script-src`
 * requires per-request nonces threaded through middleware into the document —
 * a change that has to be verified against a running app, not shipped blind.
 * Adding `'unsafe-inline'` to claim CSP coverage would be worse than not
 * having the directive, so the directives below are the ones that are both
 * enforceable today and non-breaking:
 *
 *  - frame-ancestors: the actual anti-clickjacking control (supersedes
 *    X-Frame-Options in modern browsers; XFO is kept for old ones). The
 *    dashboard and portal are full of one-click state-changing forms —
 *    approve quote, void invoice, confirm appointment — so framing must be
 *    denied outright.
 *  - form-action 'self': stops injected markup from POSTing a session-bearing
 *    form off-origin.
 *  - base-uri 'self': stops a <base> injection from re-pointing relative
 *    script URLs.
 *  - object-src 'none': legacy plugin execution sinks.
 */
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Keeps customer/vehicle/invoice ids in the path out of third-party Referer
  // headers, while still sending the origin for same-site analytics.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Vercel terminates TLS, but HSTS has to be asserted by the app for the
  // preload list and for any self-hosted deployment.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin();
const configWithIntl = withNextIntl(nextConfig);

// Sentry's webpack plugin is only attached when a DSN exists at build time.
// Without a DSN, the SDK is never initialised or loaded at runtime (see
// instrumentation.ts / instrumentation-client.ts) — though the edge bundle
// still carries the inert SDK code, since the edge bundler inlines dynamic
// imports regardless of whether they run.
const sentryDsnConfigured = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryDsnConfigured
  ? withSentryConfig(configWithIntl, {
      silent: true,
      widenClientFileUpload: false,
      sourcemaps: { disable: true },
      telemetry: false,
    })
  : configWithIntl;
