import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-10 (auth hardening) Task 5 — rate limiting wired into the auth
// Server Actions. Amended after review round 1 (IPv4-mapped IPv6 collapsing
// every client into "unknown", x-forwarded-for source order/entry, and
// checkRateLimit not catching createAdminClient()'s synchronous throw).
//
// `clientIpFrom` (lib/validation/rate-limit-key.js) is pure ESM and is
// exercised directly below with real function calls, no stubs needed.
//
// `rate-limit.ts` and `actions.ts` are TypeScript that import path-aliased
// (`@/...`) modules, which plain `node --test` cannot resolve without a
// bundler/loader (there is no ts-node/tsx dependency in this repo). Matching
// the codebase's existing convention for this exact situation (see
// tests/admin-security.test.mjs, tests/security-regressions.test.mjs), those
// two files are verified as static, offline, release-gate assertions against
// their source text — no live network, no Supabase client, no secrets.

import { clientIpFrom } from "../src/lib/validation/rate-limit-key.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, "../src");
const repoRoot = path.resolve(here, "../../..");

function readSrc(relativeToWebSrc) {
  return readFileSync(path.join(webSrc, relativeToWebSrc), "utf8");
}

function readJson(relativeToWebSrc) {
  return JSON.parse(readSrc(relativeToWebSrc));
}

const rateLimitSrc = readSrc("lib/rate-limit.ts");
const rateLimitKeySrc = readSrc("lib/validation/rate-limit-key.js");
const actionsSrc = readSrc("app/[locale]/(auth)/actions.ts");
const migrationSrc = readFileSync(
  path.join(repoRoot, "supabase/migrations/0031_auth_rate_limits.sql"),
  "utf8",
);

/** Build a headerGetter like `(name) => headers().get(name)` from a plain map. */
function headerMap(map) {
  return (name) => map[name] ?? null;
}

// --- clientIpFrom: source precedence (x-vercel-forwarded-for > x-real-ip >
// x-forwarded-for LAST entry > "unknown") ------------------------------------

test("clientIpFrom: x-vercel-forwarded-for wins over x-real-ip and x-forwarded-for", () => {
  const ip = clientIpFrom(
    headerMap({
      "x-vercel-forwarded-for": "203.0.113.1",
      "x-real-ip": "203.0.113.2",
      "x-forwarded-for": "203.0.113.3",
    }),
  );
  assert.equal(ip, "203.0.113.1");
});

test("clientIpFrom: x-real-ip wins over x-forwarded-for when x-vercel-forwarded-for is absent", () => {
  const ip = clientIpFrom(
    headerMap({ "x-real-ip": "198.51.100.23", "x-forwarded-for": "203.0.113.3" }),
  );
  assert.equal(ip, "198.51.100.23");
});

test("clientIpFrom: falls back to x-forwarded-for when x-vercel-forwarded-for and x-real-ip are absent", () => {
  const ip = clientIpFrom(headerMap({ "x-forwarded-for": "203.0.113.5" }));
  assert.equal(ip, "203.0.113.5");
});

test("clientIpFrom: multiple x-forwarded-for entries — the LAST is used, not the first", () => {
  // The first entry is attacker-controlled whenever the edge appends rather
  // than overwrites — this is the exact fix from review round 1.
  const ip = clientIpFrom(
    headerMap({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" }),
  );
  assert.equal(ip, "150.172.238.178");
});

test("clientIpFrom: x-forwarded-for's last entry is trimmed of surrounding whitespace", () => {
  const ip = clientIpFrom(
    headerMap({ "x-forwarded-for": "70.41.3.18   ,    203.0.113.5   " }),
  );
  assert.equal(ip, "203.0.113.5");
});

test("clientIpFrom: an attacker prepending a fresh random IPv4 to x-forwarded-for does not change the bucket, since the trusted (last) entry is unchanged", () => {
  const trusted = "150.172.238.178";
  const first = clientIpFrom(headerMap({ "x-forwarded-for": `1.2.3.4, ${trusted}` }));
  const second = clientIpFrom(headerMap({ "x-forwarded-for": `9.9.9.9, ${trusted}` }));
  assert.equal(first, trusted);
  assert.equal(second, trusted);
  assert.equal(first, second, "prepending different attacker-chosen IPs must not change the derived bucket");
});

test("clientIpFrom: accepts an IPv6 x-forwarded-for value", () => {
  const ip = clientIpFrom(
    headerMap({ "x-forwarded-for": "2001:db8:85a3::8a2e:370:7334" }),
  );
  assert.equal(ip, "2001:db8:85a3::8a2e:370:7334");
});

// --- clientIpFrom: x-real-ip fallback ---------------------------------------

test("clientIpFrom: falls back to x-real-ip when x-forwarded-for is absent", () => {
  const ip = clientIpFrom(headerMap({ "x-real-ip": "198.51.100.23" }));
  assert.equal(ip, "198.51.100.23");
});

test("clientIpFrom: falls back to x-real-ip when x-forwarded-for is an empty string", () => {
  const ip = clientIpFrom(
    headerMap({ "x-forwarded-for": "", "x-real-ip": "198.51.100.23" }),
  );
  assert.equal(ip, "198.51.100.23");
});

// --- clientIpFrom: missing headers -> "unknown", never null/undefined -------

test('clientIpFrom: no headers at all returns the literal string "unknown", not null', () => {
  const ip = clientIpFrom(headerMap({}));
  assert.equal(ip, "unknown");
  assert.equal(typeof ip, "string");
});

test('clientIpFrom: headerGetter returning null/undefined for every header returns "unknown"', () => {
  const ip = clientIpFrom(() => null);
  assert.equal(ip, "unknown");
});

// --- clientIpFrom: forged / non-IP-shaped values are rejected --------------

test('clientIpFrom: a forged non-IP x-forwarded-for value falls back to "unknown" (not the raw token)', () => {
  const ip = clientIpFrom(
    headerMap({ "x-forwarded-for": "totally-not-an-ip-" + Math.random() }),
  );
  assert.equal(ip, "unknown");
});

test("clientIpFrom: a forged x-forwarded-for falls through to a valid x-real-ip", () => {
  const ip = clientIpFrom(
    headerMap({
      "x-forwarded-for": "<script>alert(1)</script>",
      "x-real-ip": "203.0.113.9",
    }),
  );
  assert.equal(ip, "203.0.113.9");
});

test('clientIpFrom: a forged x-real-ip AND a forged x-forwarded-for both fall back to "unknown"', () => {
  const ip = clientIpFrom(
    headerMap({ "x-forwarded-for": "not-an-ip", "x-real-ip": "also-not-an-ip" }),
  );
  assert.equal(ip, "unknown");
});

test("clientIpFrom: an out-of-range IPv4-shaped value (999.999.999.999) is rejected", () => {
  const ip = clientIpFrom(headerMap({ "x-forwarded-for": "999.999.999.999" }));
  assert.equal(ip, "unknown");
});

test("clientIpFrom: never returns null or undefined for any input shape", () => {
  const cases = [
    headerMap({}),
    () => null,
    () => undefined,
    headerMap({ "x-forwarded-for": "," }),
    headerMap({ "x-forwarded-for": "   " }),
  ];
  for (const headerGetter of cases) {
    const ip = clientIpFrom(headerGetter);
    assert.equal(typeof ip, "string");
    assert.ok(ip.length > 0);
  }
});

// --- clientIpFrom: IPv4-mapped IPv6 and zone-ID normalization (review round 1) --

test('clientIpFrom: an IPv4-mapped IPv6 value ("::ffff:192.0.2.1") collapses to its embedded IPv4 address, not "unknown"', () => {
  const ip = clientIpFrom(headerMap({ "x-real-ip": "::ffff:192.0.2.1" }));
  assert.equal(ip, "192.0.2.1");
});

test('clientIpFrom: an IPv4-mapped IPv6 value is recognized case-insensitively ("::FFFF:192.0.2.1")', () => {
  const ip = clientIpFrom(headerMap({ "x-real-ip": "::FFFF:192.0.2.1" }));
  assert.equal(ip, "192.0.2.1");
});

test("clientIpFrom: dual-stack IPv4-mapped and plain-IPv4 forms of the SAME address land in the same bucket", () => {
  const mapped = clientIpFrom(headerMap({ "x-real-ip": "::ffff:203.0.113.7" }));
  const plain = clientIpFrom(headerMap({ "x-real-ip": "203.0.113.7" }));
  assert.equal(mapped, plain, "both representations of the same client must derive the same bucket key");
});

test('clientIpFrom: a zone-ID suffix ("fe80::1%eth0") is stripped, yielding a stable non-"unknown" bucket', () => {
  const ip = clientIpFrom(headerMap({ "x-real-ip": "fe80::1%eth0" }));
  assert.equal(ip, "fe80::1");
});

test("clientIpFrom: x-vercel-forwarded-for is also normalized for IPv4-mapped/zone forms", () => {
  const ip = clientIpFrom(headerMap({ "x-vercel-forwarded-for": "::ffff:198.51.100.9" }));
  assert.equal(ip, "198.51.100.9");
});

// --- release gate: honest documentation of the shape check's real limits ---

test("release gate: rate-limit-key.js documents that the shape check bounds character set, not cardinality — no overclaiming", () => {
  assert.match(
    rateLimitKeySrc,
    /does not,? and cannot,? bound[\s*]+cardinality/i,
    "expected an explicit, honest statement that shape validation cannot bound how many buckets an attacker can mint",
  );
  assert.doesNotMatch(
    rateLimitKeySrc,
    /forged header could otherwise create unbounded distinct buckets/i,
    "must not overclaim that the shape check alone prevents unbounded bucket creation",
  );
});

test("release gate: rate-limit-key.js documents the x-forwarded-for source order and why the LAST entry is used", () => {
  assert.match(rateLimitKeySrc, /x-vercel-forwarded-for/);
  assert.match(rateLimitKeySrc, /LAST/);
  assert.match(rateLimitKeySrc, /attacker-controlled/i);
});

// --- release gate: rate-limit.ts calls the service-role client, not the
// request-scoped one ---------------------------------------------------------

test("release gate: rate-limit.ts uses the service-role admin client (createAdminClient)", () => {
  assert.match(rateLimitSrc, /createAdminClient/);
  assert.match(rateLimitSrc, /from ["']@\/lib\/supabase\/admin["']/);
});

test("release gate: rate-limit.ts never imports the request-scoped server client", () => {
  assert.doesNotMatch(rateLimitSrc, /from ["']@\/lib\/supabase\/server["']/);
});

test("release gate: rate-limit.ts calls the consume_rate_limit RPC with scope/identifier args", () => {
  assert.match(rateLimitSrc, /\.rpc\(\s*["']consume_rate_limit["']/);
  assert.match(rateLimitSrc, /\{\s*scope,\s*identifier,?\s*\}/);
});

// --- release gate: fail CLOSED on RPC error ---------------------------------

function extractCheckRateLimit() {
  const fnMatch = rateLimitSrc.match(
    /export async function checkRateLimit[\s\S]*?\n\}/,
  );
  assert.ok(fnMatch, "checkRateLimit function body not found");
  return fnMatch[0];
}

test("release gate: checkRateLimit denies (returns false) when the RPC errors", () => {
  const body = extractCheckRateLimit();

  const errorBranch = body.match(/if\s*\(error\)\s*\{([\s\S]*?)\}/);
  assert.ok(errorBranch, "checkRateLimit must handle the RPC error case");
  assert.match(
    errorBranch[1],
    /return false/,
    "an RPC error must deny the attempt (fail closed), never return true",
  );
  assert.doesNotMatch(
    errorBranch[1],
    /return true/,
    "an RPC error branch must never allow the attempt",
  );
});

test("release gate: checkRateLimit logs only a stable code, never error.message", () => {
  assert.doesNotMatch(rateLimitSrc, /console\.error\([^)]*error\.message/);
  assert.match(rateLimitSrc, /error\.code/);
});

// --- release gate: checkRateLimit fails closed even if construction/the RPC
// call THROWS, not just when the RPC returns an error (review round 1: this
// previously escaped uncaught when SUPABASE_SERVICE_ROLE_KEY was unset). ----

test("release gate: checkRateLimit wraps its body in try/catch, with createAdminClient() inside the try", () => {
  const body = extractCheckRateLimit();
  assert.match(body, /try\s*\{/, "checkRateLimit must wrap its body in try/catch");

  const tryIdx = body.indexOf("try");
  const createIdx = body.indexOf("createAdminClient()");
  assert.ok(tryIdx !== -1 && createIdx !== -1, "expected both `try` and a createAdminClient() call");
  assert.ok(
    tryIdx < createIdx,
    "createAdminClient() must be called INSIDE the try block so its synchronous throw is caught",
  );
});

test("release gate: checkRateLimit's catch branch fails closed and logs only a stable code", () => {
  const body = extractCheckRateLimit();
  const catchBranch = body.match(/\}\s*catch[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(catchBranch, "checkRateLimit must have a catch branch");
  assert.match(
    catchBranch[1],
    /return false/,
    "a thrown error (e.g. createAdminClient() missing the service-role key) must deny the attempt",
  );
  assert.doesNotMatch(catchBranch[1], /return true/, "the catch branch must never allow the attempt");
  assert.doesNotMatch(
    catchBranch[1],
    /console\.error\([^)]*\.message/,
    "the catch branch must log only a stable code, never a caught error's .message (could be a raw env-var error string)",
  );
  assert.match(
    catchBranch[1],
    /console\.error\(\s*["']rate_limit_client_error["']/,
    "expected a distinct stable code for the construction/throw path, separate from rate_limit_rpc_error",
  );
});

// --- release gate: enforceAuthRateLimit does not short-circuit, and the
// tradeoff of not doing so is documented honestly ---------------------------

test("release gate: enforceAuthRateLimit consumes every scope (no early return inside the loop)", () => {
  // Matched up to its own distinctive final `return allowed;` rather than a
  // generic "\n}" — the function's destructured-parameter type annotation
  // (`}: { scopes: ... }`) contains an unindented "}" of its own partway
  // through, which a naive "first \n}" match would stop at prematurely.
  const fnMatch = rateLimitSrc.match(
    /export async function enforceAuthRateLimit[\s\S]*?return allowed;\n\}/,
  );
  assert.ok(fnMatch, "enforceAuthRateLimit function body not found");
  const body = fnMatch[0];

  const loopMatch = body.match(/for\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(loopMatch, "enforceAuthRateLimit must contain a for-loop over scopes");
  assert.doesNotMatch(
    loopMatch[1],
    /return/,
    "the loop must not return early — every scope must be consumed even after a denial",
  );
  assert.doesNotMatch(loopMatch[1], /\bbreak\b/, "the loop must not break early either");
});

test("release gate: the non-short-circuit tradeoff is documented honestly, not dismissed as harmless", () => {
  assert.match(rateLimitSrc, /TRADEOFF/);
  assert.match(rateLimitSrc, /real cost/i);
  assert.doesNotMatch(
    rateLimitSrc,
    /does(?:n't| not) open a new attack angle/i,
    "must not dismiss the tradeoff outright — it has a real (accepted) cost",
  );
});

// --- release gate: never batch multiple consume_rate_limit calls into one
// transaction — exactly one RPC call site, invoked once per scope via the loop.

test("release gate: exactly one consume_rate_limit call site exists (per-scope looping, not batching)", () => {
  const matches = rateLimitSrc.match(/\.rpc\(\s*["']consume_rate_limit["']/g) ?? [];
  assert.equal(
    matches.length,
    1,
    "consume_rate_limit should be called from exactly one place (checkRateLimit), invoked once per scope by the caller loop — never batched",
  );
});

// --- release gate: actions.ts wiring — each action consumes its specified
// scopes, and the check runs before the Supabase auth call. -----------------

function extractAction(name, nextName) {
  const re = new RegExp(
    `export async function ${name}\\([\\s\\S]*?(?=export async function ${nextName}\\()`,
  );
  const match = actionsSrc.match(re);
  assert.ok(match, `could not locate ${name} in actions.ts`);
  return match[0];
}

test("release gate: signIn consumes login_ip + login_email, before signInWithPassword", () => {
  const body = extractAction("signIn", "signUp");
  const rateLimitIdx = body.indexOf("enforceAuthRateLimit");
  const supabaseCallIdx = body.indexOf("signInWithPassword");
  assert.ok(body.includes('"login_ip"'));
  assert.ok(body.includes('"login_email"'));
  assert.ok(rateLimitIdx !== -1 && supabaseCallIdx !== -1);
  assert.ok(rateLimitIdx < supabaseCallIdx, "rate limit check must run before the Supabase call");
});

test("release gate: signUp consumes signup_ip, before auth.signUp", () => {
  const body = extractAction("signUp", "signInWithMagicLink");
  const rateLimitIdx = body.indexOf("enforceAuthRateLimit");
  const supabaseCallIdx = body.indexOf("supabase.auth.signUp(");
  assert.ok(body.includes('"signup_ip"'));
  assert.ok(rateLimitIdx !== -1 && supabaseCallIdx !== -1);
  assert.ok(rateLimitIdx < supabaseCallIdx, "rate limit check must run before the Supabase call");
});

test("release gate: signInWithMagicLink consumes magic_link_email + login_ip, before signInWithOtp", () => {
  const body = extractAction("signInWithMagicLink", "signOut");
  const rateLimitIdx = body.indexOf("enforceAuthRateLimit");
  const supabaseCallIdx = body.indexOf("signInWithOtp");
  assert.ok(body.includes('"magic_link_email"'));
  assert.ok(body.includes('"login_ip"'));
  assert.ok(rateLimitIdx !== -1 && supabaseCallIdx !== -1);
  assert.ok(rateLimitIdx < supabaseCallIdx, "rate limit check must run before the Supabase call");
});

test("release gate: requestPasswordReset consumes password_reset_ip + password_reset_email, before resetPasswordForEmail", () => {
  const body = extractAction("requestPasswordReset", "updatePassword");
  const rateLimitIdx = body.indexOf("enforceAuthRateLimit");
  const supabaseCallIdx = body.indexOf("resetPasswordForEmail");
  assert.ok(body.includes('"password_reset_ip"'));
  assert.ok(body.includes('"password_reset_email"'));
  assert.ok(rateLimitIdx !== -1 && supabaseCallIdx !== -1);
  assert.ok(rateLimitIdx < supabaseCallIdx, "rate limit check must run before the Supabase call");
});

// --- release gate: scope literals used in actions.ts must exactly match the
// allowlist hard-coded in the migration (typo guard). ------------------------

test("release gate: every rate-limit scope literal used in actions.ts is a scope the migration actually recognizes", () => {
  const knownScopes = [
    "login_ip",
    "login_email",
    "password_reset_ip",
    "password_reset_email",
    "signup_ip",
    "magic_link_email",
  ];

  // Every scope this test cares about is only ever referenced in actions.ts
  // as `["scope_name", ...]` inside an enforceAuthRateLimit({ scopes }) call
  // — scoping the match to that exact tuple shape (rather than a generic
  // `["...",` scan) avoids false positives from unrelated arrays elsewhere in
  // the file (e.g. PASSWORD_ERROR_CODES).
  const usedScopes = knownScopes.filter((scope) =>
    new RegExp(`\\[\\s*["']${scope}["']\\s*,`).test(actionsSrc),
  );

  // login_ip is used twice (signIn + signInWithMagicLink); every other scope
  // once each — 6 distinct scopes total, all of which must be present.
  assert.deepEqual(usedScopes.sort(), [...knownScopes].sort());

  for (const scope of usedScopes) {
    assert.match(
      migrationSrc,
      new RegExp(`when\\s+'${scope}'`),
      `migration does not define a case for scope "${scope}"`,
    );
  }
});

// --- release gate: no client component or client-reachable module ever
// imports the service-role admin client except through rate-limit.ts. -------

test("release gate: actions.ts never imports lib/supabase/admin directly — only through rate-limit.ts", () => {
  assert.doesNotMatch(actionsSrc, /from ["']@\/lib\/supabase\/admin["']/);
  assert.match(actionsSrc, /from ["']@\/lib\/rate-limit["']/);
});

// --- APPSEC-08 follow-up (Task 5's brief): actions.ts must no longer leak
// raw Supabase SDK error.message to the caller. Mirrors the RAW_DB_ERROR_LEAK
// pattern in tests/security-regressions.test.mjs (APPSEC-07), applied here to
// (auth)/actions.ts specifically, which that scan does not cover. -----------

test("release gate: actions.ts no longer returns a raw error.message to the caller", () => {
  assert.doesNotMatch(
    actionsSrc,
    /error:\s*[A-Za-z]*[Ee]rror\??\.message/,
    "actions.ts appears to return a raw SDK error message again",
  );
});

test("release gate: every Supabase auth error in actions.ts logs only a stable code, never .message", () => {
  assert.doesNotMatch(actionsSrc, /console\.error\([^)]*error\.message/);
  const errorCodeLogs = actionsSrc.match(/console\.error\([^)]*error\.code/g) ?? [];
  assert.ok(
    errorCodeLogs.length >= 5,
    "expected a stable-code console.error for each of signIn/signUp/signInWithMagicLink/requestPasswordReset/updatePassword",
  );
});

// --- i18n: tooManyAttempts exists in both locales, with genuine Arabic copy -

test("i18n: auth.actions.tooManyAttempts exists in en.json and is non-empty, non-placeholder", () => {
  const en = readJson("messages/en.json");
  const message = en.auth?.actions?.tooManyAttempts;
  assert.equal(typeof message, "string");
  assert.ok(message.length > 0);
  assert.doesNotMatch(message, /^(TODO|TBD|FIXME)/i);
});

test("i18n: auth.actions.tooManyAttempts exists in ar.json with genuine Arabic script", () => {
  const ar = readJson("messages/ar.json");
  const message = ar.auth?.actions?.tooManyAttempts;
  assert.equal(typeof message, "string");
  assert.ok(message.length > 0);
  assert.match(message, /[؀-ۿ]/, "expected Arabic script, not English/placeholder text");
});

test("i18n: en.json and ar.json declare the exact same auth.actions key set (purely additive)", () => {
  const en = readJson("messages/en.json");
  const ar = readJson("messages/ar.json");
  const enKeys = Object.keys(en.auth.actions).sort();
  const arKeys = Object.keys(ar.auth.actions).sort();
  assert.deepEqual(enKeys, arKeys);
  for (const key of [
    "tooManyAttempts",
    "invalidCredentials",
    "signUpFailed",
    "magicLinkFailed",
    "passwordResetFailed",
    "updatePasswordFailed",
  ]) {
    assert.ok(enKeys.includes(key), `en.json missing auth.actions.${key}`);
  }
});

// --- database.types.ts: hand-authored RPC declaration -----------------------

test("release gate: database.types.ts declares consume_rate_limit alongside the other hand-authored RPCs", () => {
  const typesSrc = readSrc("lib/database.types.ts");
  const match = typesSrc.match(/consume_rate_limit:\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(match, "consume_rate_limit entry not found in database.types.ts Functions block");
  assert.match(match[1], /scope:\s*string/);
  assert.match(match[1], /identifier:\s*string/);
  assert.match(match[1], /Returns:\s*boolean/);
  // Still alongside the other named exports the brief warns not to drop.
  assert.match(typesSrc, /claim_customer_records:/);
  assert.match(typesSrc, /create_business:\s*\{/);
});
