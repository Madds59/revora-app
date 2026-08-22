// Pure key/IP derivation for auth rate limiting (APPSEC-10 Task 5).
//
// Authored as .js (ESM), like lib/validation/common.js and
// lib/validation/password.js, so it can be unit-tested offline with
// `node --test tests/*.test.mjs` — no Next.js runtime, no network, no
// Supabase client. `rate-limit.ts` (which does touch the Supabase client) is
// the only caller.

// Basic IPv4 shape: four dot-separated octets, each 0-255. Not a general
// parser — just enough structure to reject non-IP garbage.
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d|0)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d|0)){3}$/;

// Basic IPv6 shape: 3-8 colon-separated groups of up to 4 hex digits each,
// allowing "::" compression (empty groups). Deliberately not a full RFC 4291
// validator (no strict double-colon-count arithmetic) — the goal here is only
// to gate bucket-key creation, not to normalize or fully validate addresses.
const IPV6_RE = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;

function looksLikeIp(value) {
  return IPV4_RE.test(value) || IPV6_RE.test(value);
}

/**
 * Derive a best-effort client IP from request headers, for use as a
 * rate-limit bucket key.
 *
 * `headerGetter` mirrors the Fetch API `Headers#get` shape (e.g.
 * `(name) => headerList.get(name)` from `next/headers`'s `headers()`), kept
 * as a plain function parameter so this module never imports Next.js and can
 * run under plain `node --test`.
 *
 * Reads `x-forwarded-for` (the FIRST comma-separated entry, trimmed — that's
 * the client-closest hop in the usual proxy chain) and falls back to
 * `x-real-ip`.
 *
 * SECURITY — this function must NEVER return null/undefined to mean "no IP
 * found", and callers must never treat a missing IP as "skip the check". If
 * it did, an attacker could bypass the entire IP-keyed rate limit outright
 * simply by stripping both headers from the request. Instead, an
 * unresolvable IP falls back to the literal string "unknown" — a single
 * shared bucket that still gets rate-limited (coarsely, alongside every other
 * client that also failed to present a usable IP), rather than exempting the
 * request from limiting altogether.
 *
 * The extracted value is also validated against a basic IPv4/IPv6 shape
 * before being trusted, falling back to "unknown" if it doesn't look like an
 * IP. Without this check, an attacker could set `x-forwarded-for` to an
 * arbitrary non-IP token that changes on every request (e.g. a random
 * string), minting a fresh, never-reused bucket each time — which would
 * defeat the limiter just as completely as bypassing it outright, since a
 * forged header could otherwise create unbounded distinct buckets.
 *
 * @param {(name: string) => string | null | undefined} headerGetter
 * @returns {string}
 */
export function clientIpFrom(headerGetter) {
  const forwardedFor = headerGetter("x-forwarded-for");
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    const first = forwardedFor.split(",")[0]?.trim() ?? "";
    if (looksLikeIp(first)) return first;
  }

  const realIp = headerGetter("x-real-ip");
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    const trimmed = realIp.trim();
    if (looksLikeIp(trimmed)) return trimmed;
  }

  return "unknown";
}
