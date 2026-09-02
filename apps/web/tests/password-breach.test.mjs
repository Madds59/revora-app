import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-10 (auth hardening) Task 2 — breached-password screening via HIBP
// k-anonymity. Server-only (node:crypto is expected and correct here, unlike
// Task 1's browser-safe password.js). Every test below stubs `fetchImpl` —
// none may touch the network, per the module's own testability contract.

import { isPasswordBreached } from "../src/lib/password-breach.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(path.join(here, "..", "src", "lib", "password-breach.js"), "utf8");

function sha1Upper(password) {
  return createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
}

function splitHash(password) {
  const full = sha1Upper(password);
  return { prefix: full.slice(0, 5), suffix: full.slice(5), full };
}

/** Build a stub fetchImpl that returns a fixed body for any prefix request. */
function stubFetch(body, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    text: async () => body,
  });
}

// --- known-breached suffix ---------------------------------------------

test("breached: a suffix present in the stubbed response with a nonzero count is a breach", async () => {
  const password = "correcthorsebatterystaple";
  const { suffix } = splitHash(password);
  const body = [`${suffix}:37`, "AAAA000000000000000000000000000AAAA:5"].join("\r\n");
  const result = await isPasswordBreached(password, { fetchImpl: stubFetch(body) });
  assert.deepEqual(result, { breached: true, checked: true });
});

// --- clean password ------------------------------------------------------

test("clean: a suffix absent from the response is not a breach", async () => {
  const password = "Zx9!Qw8@Pl7#Mn6$";
  const body = ["FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:12", "0000000000000000000000000000000000:0"].join(
    "\r\n",
  );
  const result = await isPasswordBreached(password, { fetchImpl: stubFetch(body) });
  assert.deepEqual(result, { breached: false, checked: true });
});

// --- padding entries must not count -------------------------------------

test("padding: a matching suffix with count 0 is NOT treated as a breach", async () => {
  const password = "paddedButNotReallyBreached123";
  const { suffix } = splitHash(password);
  // This is the subtle bug: the suffix matches, but the count is the HIBP
  // padding sentinel (0), so it must not register as a breach.
  const body = [`${suffix}:0`, "AAAA000000000000000000000000000AAAA:9"].join("\r\n");
  const result = await isPasswordBreached(password, { fetchImpl: stubFetch(body) });
  assert.deepEqual(result, { breached: false, checked: true });
});

test("padding: a real breach line and a zero-count padding line for a different suffix coexist correctly", async () => {
  const password = "anotherRealBreachExample456";
  const { suffix } = splitHash(password);
  const body = [`${suffix}:4821`, "BEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEE:0"].join("\r\n");
  const result = await isPasswordBreached(password, { fetchImpl: stubFetch(body) });
  assert.deepEqual(result, { breached: true, checked: true });
});

// --- case-insensitive suffix matching ------------------------------------

test("case: suffix matching is case-insensitive", async () => {
  const password = "caseInsensitiveCheck789";
  const { suffix } = splitHash(password);
  const body = [`${suffix.toLowerCase()}:8`].join("\r\n");
  const result = await isPasswordBreached(password, { fetchImpl: stubFetch(body) });
  assert.deepEqual(result, { breached: true, checked: true });
});

// --- fail-open paths -------------------------------------------------------

test("fail-open: non-200 response returns checked:false, breached:false", async () => {
  const result = await isPasswordBreached("whatever-password-here", {
    fetchImpl: stubFetch("", { ok: false, status: 503 }),
  });
  assert.deepEqual(result, { breached: false, checked: false });
});

test("fail-open: a thrown network error returns checked:false, breached:false", async () => {
  const fetchImpl = async () => {
    throw new Error("getaddrinfo ENOTFOUND api.pwnedpasswords.com");
  };
  const result = await isPasswordBreached("whatever-password-here", { fetchImpl });
  assert.deepEqual(result, { breached: false, checked: false });
});

test("fail-open: a timeout (AbortError) returns checked:false, breached:false", async () => {
  const fetchImpl = async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };
  const result = await isPasswordBreached("whatever-password-here", {
    fetchImpl,
    timeoutMs: 1,
  });
  assert.deepEqual(result, { breached: false, checked: false });
});

test("fail-open: a malformed body (no parseable SUFFIX:COUNT lines) returns checked:false, breached:false", async () => {
  const result = await isPasswordBreached("whatever-password-here", {
    fetchImpl: stubFetch("<html>not what you expected</html>"),
  });
  assert.deepEqual(result, { breached: false, checked: false });
});

test("fail-open: an empty body returns checked:false, breached:false", async () => {
  const result = await isPasswordBreached("whatever-password-here", {
    fetchImpl: stubFetch(""),
  });
  assert.deepEqual(result, { breached: false, checked: false });
});

test("fail-open: response.text() throwing returns checked:false, breached:false", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => {
      throw new Error("stream error");
    },
  });
  const result = await isPasswordBreached("whatever-password-here", { fetchImpl });
  assert.deepEqual(result, { breached: false, checked: false });
});

// --- input guards ----------------------------------------------------------

test("guard: non-string or empty input returns checked:false without calling fetchImpl", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "AAAA:1" };
  };
  for (const bad of [null, undefined, 42, {}, [], true, ""]) {
    const result = await isPasswordBreached(bad, { fetchImpl });
    assert.deepEqual(result, { breached: false, checked: false });
  }
  assert.equal(called, false, "fetchImpl must not be called for invalid input");
});

test("guard: an absurdly long password is rejected before hashing, without calling fetchImpl", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "AAAA:1" };
  };
  const huge = "a".repeat(5_000_000); // multi-megabyte attacker-supplied string
  const result = await isPasswordBreached(huge, { fetchImpl });
  assert.deepEqual(result, { breached: false, checked: false });
  assert.equal(called, false, "fetchImpl must not be called for an oversized password");
});

test("guard: a normal-length legitimate password is not rejected by the length guard", async () => {
  const password = "Ab1!Ab1!Ab1!"; // 12 chars, well under any reasonable bound
  const { suffix } = splitHash(password);
  const result = await isPasswordBreached(password, {
    fetchImpl: stubFetch(`${suffix}:1`),
  });
  assert.deepEqual(result, { breached: true, checked: true });
});

// --- release gate: no secret material leaves the process --------------------

test("release gate: the outbound request URL contains only the 5-char prefix, never the full hash or suffix", async () => {
  const password = "release-gate-check-password";
  const { prefix, suffix, full } = splitHash(password);
  let requestedUrl;
  const fetchImpl = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => `${suffix}:1` };
  };
  await isPasswordBreached(password, { fetchImpl });

  assert.ok(requestedUrl.endsWith(`/range/${prefix}`), "URL must end with /range/<5-char-prefix>");
  assert.equal(prefix.length, 5);
  assert.ok(!requestedUrl.includes(suffix), "URL must not contain the 35-char suffix");
  assert.ok(!requestedUrl.includes(full), "URL must not contain the full hash");
  assert.ok(!requestedUrl.toLowerCase().includes(password.toLowerCase()), "URL must not contain the password");
});

test("release gate: the full hash never appears in any console.error call, across every failure path", async () => {
  const password = "release-gate-log-check-password";
  const { full } = splitHash(password);
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    await isPasswordBreached(password, { fetchImpl: stubFetch("", { ok: false, status: 500 }) });
    await isPasswordBreached(password, {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    await isPasswordBreached(password, { fetchImpl: stubFetch("not valid at all") });
    await isPasswordBreached(password, { fetchImpl: stubFetch("") });
  } finally {
    console.error = originalError;
  }
  assert.ok(logged.length > 0, "expected at least one logged fail-open code");
  for (const line of logged) {
    assert.ok(!line.includes(full), "full hash must never appear in a logged string");
    assert.ok(!line.toLowerCase().includes(password.toLowerCase()), "password must never appear in a logged string");
  }
});

test("release gate: the module source only ever logs stable codes, never a caught error's message", () => {
  // Curated, non-enumerating errors: console.error must be called with a
  // literal label plus a stable code, never with error.message / err.message
  // (which could leak upstream SDK/network text).
  assert.ok(!/console\.error\([^)]*\.message/.test(moduleSource), "must not log error.message");
  assert.ok((moduleSource.match(/console\.error\(/g) ?? []).length >= 3);
});

test("release gate: SHA-1 is documented as an HIBP-mandated choice, not upgradeable to SHA-256", () => {
  assert.match(moduleSource, /createHash\(\s*["']sha1["']\s*\)/);
  assert.match(moduleSource, /NOT A SECURITY CHOICE/i);
});

test("release gate: the Add-Padding header is sent so response size cannot leak hit count", () => {
  assert.match(moduleSource, /Add-Padding/);
});

test("release gate: fail-open is documented as the deliberate exception in this codebase", () => {
  assert.match(moduleSource, /FAIL-OPEN CONTRACT/);
  assert.match(moduleSource, /fail-open/i);
});

test("release gate: checked and breached are independent flags, never collapsed", async () => {
  // checked:false must always pair with breached:false (never breached:true
  // reported when we couldn't actually verify).
  const failOpenResult = await isPasswordBreached("some-password-value", {
    fetchImpl: stubFetch("", { ok: false, status: 500 }),
  });
  assert.equal(failOpenResult.checked, false);
  assert.equal(failOpenResult.breached, false);

  const cleanResult = await isPasswordBreached("some-other-password-value", {
    fetchImpl: stubFetch("0000000000000000000000000000000000:0"),
  });
  assert.equal(cleanResult.checked, true);
  assert.equal(cleanResult.breached, false);
});
