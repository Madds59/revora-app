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
// Does NOT admit an embedded dotted-quad (IPv4-mapped form) — that form is
// normalized down to its plain IPv4 address by `normalizeIp` below BEFORE it
// ever reaches this regex, so it doesn't need to.
const IPV6_RE = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;

// Matches an IPv4-mapped IPv6 address ("::ffff:192.0.2.1", case-insensitive)
// so it can be collapsed to the embedded IPv4 address.
const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/**
 * Trim, strip a zone ID suffix (`fe80::1%eth0` -> `fe80::1` — the zone index
 * is a local-scope disambiguator, not part of the address, and is meaningless
 * as a bucket-key component), collapse an IPv4-mapped IPv6 address down to
 * its embedded IPv4 form, then validate the basic shape.
 *
 * The IPv4-mapped collapse matters for correctness, not just tidiness: a
 * dual-stack listener (nginx `$remote_addr`, Node's
 * `req.socket.remoteAddress`) commonly reports an IPv4 client as
 * `::ffff:203.0.113.7`. Without collapsing it, that value fails `IPV6_RE`
 * (no dots allowed) and every such client would fall through to the shared
 * "unknown" bucket — silently merging every dual-stack visitor's login
 * attempts into one bucket and turning `login_ip`'s 20-attempts-per-15-
 * minutes into a site-wide login outage the first time enough legitimate
 * users share it. Collapsing to the embedded IPv4 address instead gives each
 * such client its own correct, stable bucket — the same one a plain IPv4
 * connection from that address would get.
 *
 * @param {string} raw
 * @returns {string | null} the normalized, validated value, or null if it
 *   doesn't look like an IP at all.
 */
function normalizeIp(raw) {
  let value = raw.trim();
  if (value.length === 0) return null;

  const zoneIndex = value.indexOf("%");
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);

  const mapped = IPV4_MAPPED_RE.exec(value);
  if (mapped) value = mapped[1];

  if (IPV4_RE.test(value) || IPV6_RE.test(value)) return value;
  return null;
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
 * SOURCE ORDER (most to least trusted):
 *   1. `x-vercel-forwarded-for` — set by the Vercel edge from the real TCP
 *      connection. A client request cannot set or override this header
 *      itself, so when present it's trusted outright.
 *   2. `x-real-ip` — typically set by a single trusted reverse-proxy hop
 *      immediately in front of the app; trusted only insofar as the
 *      deployment's actual edge is the one setting it.
 *   3. `x-forwarded-for`, taking the LAST comma-separated entry — NOT the
 *      first. This header is a list a client can freely prepend entries to
 *      (nothing about the header format prevents it), so the FIRST entry is
 *      attacker-controlled whenever the edge in front of this app *appends*
 *      rather than overwrites: sending `x-forwarded-for: <fresh random
 *      IPv4>` on every request would land each request in a brand-new
 *      first-entry bucket, reducing `login_ip`/`signup_ip`/
 *      `password_reset_ip` to no protection at all (only the paired email
 *      buckets would still bind). With a trusted appending proxy, the LAST
 *      (rightmost) hop is the one closest to — and added by — this app's own
 *      edge, which is the attacker-resistant choice. This is still only as
 *      good as the deployment's actual proxy chain: if nothing trustworthy
 *      appends after the attacker's own hop, the last entry can still be
 *      attacker-supplied. Prefer #1/#2 whenever the platform provides them.
 *   4. Otherwise `"unknown"` (below).
 *
 * SECURITY — this function must NEVER return null/undefined to mean "no IP
 * found", and callers must never treat a missing IP as "skip the check". If
 * it did, an attacker could bypass the entire IP-keyed rate limit outright
 * simply by stripping every header above from the request. Instead, an
 * unresolvable IP falls back to the literal string "unknown" — a single
 * shared bucket that still gets rate-limited (coarsely, alongside every other
 * client that also failed to present a usable IP), rather than exempting the
 * request from limiting altogether.
 *
 * The extracted value is also validated against a basic IPv4/IPv6 shape
 * (after normalizing an IPv4-mapped IPv6 form and stripping a zone-ID
 * suffix — see `normalizeIp`) before being trusted, falling back to
 * "unknown" if it doesn't look like an IP at all.
 *
 * WHAT THIS SHAPE CHECK DOES NOT PROTECT AGAINST — and what it must not be
 * mistaken for: it bounds the accepted *character set* of a value, not how
 * many distinct buckets an attacker can mint. `IPV4_RE` alone admits on the
 * order of 4.3 billion syntactically valid addresses, so an attacker who
 * controls whichever header ends up trusted above (including a forged-but-
 * appended `x-forwarded-for` last entry, if the deployment's actual proxy
 * chain doesn't prevent that) can still cycle through valid-looking IPv4
 * addresses to mint a fresh bucket per request. No amount of shape
 * validation closes that gap — only a header a trusted edge actually
 * sets/overwrites (never merely appends after untrusted input) can. This
 * check only narrows "obviously not an IP" (a random token, script tags,
 * etc.) out of the bucket keyspace; it does not, and cannot, bound
 * cardinality.
 *
 * @param {(name: string) => string | null | undefined} headerGetter
 * @returns {string}
 */
export function clientIpFrom(headerGetter) {
  const vercelForwardedFor = headerGetter("x-vercel-forwarded-for");
  if (typeof vercelForwardedFor === "string") {
    const first = vercelForwardedFor.split(",")[0] ?? "";
    const ip = normalizeIp(first);
    if (ip) return ip;
  }

  const realIp = headerGetter("x-real-ip");
  if (typeof realIp === "string") {
    const ip = normalizeIp(realIp);
    if (ip) return ip;
  }

  const forwardedFor = headerGetter("x-forwarded-for");
  if (typeof forwardedFor === "string") {
    const parts = forwardedFor.split(",");
    const last = parts[parts.length - 1] ?? "";
    const ip = normalizeIp(last);
    if (ip) return ip;
  }

  return "unknown";
}
