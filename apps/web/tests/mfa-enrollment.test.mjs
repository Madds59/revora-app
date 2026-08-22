import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-10 (auth hardening) Task 6 — TOTP MFA enrollment and challenge.
//
// `lib/validation/mfa.js` is authored as plain .js (ESM), like
// lib/validation/password.js and lib/validation/rate-limit-key.js, precisely
// so its orchestration logic can be exercised directly here with a stubbed
// `supabase.auth.mfa` client — no Next.js runtime, no network, no live
// Supabase project. It is the single place that decides call ORDER
// (enroll -> recover-and-retry, challenge -> verify -> unenroll); the
// "use server" wrapper in `(dashboard)/settings/security/actions.ts` only
// maps its results to curated copy and cannot itself be imported under plain
// `node --test` (it pulls in next/navigation, next-intl/server, etc.) — for
// that file, and for the client component, this suite falls back to the same
// static source-text convention already used by admin-security.test.mjs and
// security-regressions.test.mjs.
//
// The MOST IMPORTANT property this file proves is behavioral, not textual:
// `unenrollFactorWithFreshCode` cannot reach `mfa.unenroll` unless a fresh
// challenge+verify just succeeded. The stub below makes `unenroll` (and, for
// the enrollment-recovery tests, `verify`) THROW when called somewhere a
// well-behaved caller should never reach it, so an accidental reordering
// during a future refactor fails LOUDLY here rather than silently.

import {
  enrollTotpFactor,
  TOTP_FRIENDLY_NAME,
  unenrollFactorWithFreshCode,
  verifyTotpEnrollment,
} from "../src/lib/validation/mfa.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, "../src");
const repoRoot = path.resolve(here, "../../..");

function readSrc(relativeToWebSrc) {
  return readFileSync(path.join(webSrc, relativeToWebSrc), "utf8");
}

const actionsSrc = readSrc("app/[locale]/(dashboard)/settings/security/actions.ts");
const clientSrc = readSrc("app/[locale]/(dashboard)/settings/security/security-client.tsx");
const mfaLibSrc = readSrc("lib/validation/mfa.js");
const en = JSON.parse(readSrc("messages/en.json"));
const ar = JSON.parse(readSrc("messages/ar.json"));
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "apps/web/package.json"), "utf8"));

// --- stub `supabase.auth.mfa` client ---------------------------------------
//
// Each of `enroll`/`challenge`/`verify`/`unenroll`/`listFactors` can be given
// either a fixed `{ data, error }` response, or a function `(params, callNo)
// => { data, error }` for tests that need different answers on successive
// calls (e.g. "conflict on the first enroll, success on the retry"). Every
// call is recorded in `calls` so tests can assert not just the RESULT but
// which underlying operations ran, in what order, and with what arguments —
// the thing a purely textual assertion cannot prove.
function createMfaStub(overrides = {}) {
  const calls = { enroll: [], challenge: [], verify: [], unenroll: [], listFactors: 0 };

  // `callNo` is the count of PRIOR calls to this same method (0 for the
  // first call, 1 for the second, ...) — computed from `calls[name].length`
  // BEFORE this call is recorded, so a stub function can tell "first
  // attempt" from "retry after recovery" without off-by-one surprises.
  function resolve(name, params, callNo) {
    const impl = overrides[name];
    if (typeof impl === "function") return impl(params, callNo);
    return impl ?? { data: null, error: { code: "unexpected_failure" } };
  }

  return {
    calls,
    async enroll(params) {
      const result = await resolve("enroll", params, calls.enroll.length);
      calls.enroll.push(params);
      return result;
    },
    async challenge(params) {
      const result = await resolve("challenge", params, calls.challenge.length);
      calls.challenge.push(params);
      return result;
    },
    async verify(params) {
      const result = await resolve("verify", params, calls.verify.length);
      calls.verify.push(params);
      return result;
    },
    async unenroll(params) {
      const result = await resolve("unenroll", params, calls.unenroll.length);
      calls.unenroll.push(params);
      return result;
    },
    async listFactors() {
      const result = await resolve("listFactors", undefined, calls.listFactors);
      calls.listFactors += 1;
      return result;
    },
  };
}

const enrolledFactor = {
  data: {
    id: "factor-1",
    type: "totp",
    totp: { qr_code: "data:image/svg+xml;utf-8,<svg></svg>", secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" },
  },
  error: null,
};

// --- enrollTotpFactor: happy path -------------------------------------------

test("enrollTotpFactor: happy path enrolls on the first try and never consults listFactors/unenroll", async () => {
  const mfa = createMfaStub({ enroll: enrolledFactor });
  const result = await enrollTotpFactor(mfa);
  assert.deepEqual(result, {
    ok: true,
    factorId: "factor-1",
    qrCode: "data:image/svg+xml;utf-8,<svg></svg>",
    secret: "JBSWY3DPEHPK3PXP",
  });
  assert.equal(mfa.calls.enroll.length, 1);
  assert.equal(mfa.calls.listFactors, 0);
  assert.equal(mfa.calls.unenroll.length, 0);
});

test("enrollTotpFactor: always enrolls under the fixed, non-localized friendly name", async () => {
  const mfa = createMfaStub({ enroll: enrolledFactor });
  await enrollTotpFactor(mfa);
  assert.equal(mfa.calls.enroll[0].factorType, "totp");
  assert.equal(mfa.calls.enroll[0].friendlyName, TOTP_FRIENDLY_NAME);
  assert.equal(typeof TOTP_FRIENDLY_NAME, "string");
  assert.ok(TOTP_FRIENDLY_NAME.length > 0);
});

test("enrollTotpFactor: a non-conflict enroll error is returned immediately, without consulting listFactors", async () => {
  const mfa = createMfaStub({
    enroll: { data: null, error: { code: "too_many_enrolled_mfa_factors" } },
  });
  const result = await enrollTotpFactor(mfa);
  assert.deepEqual(result, { ok: false, code: "too_many_enrolled_mfa_factors" });
  assert.equal(mfa.calls.listFactors, 0);
});

test("enrollTotpFactor: an error without a .code falls back to \"unknown\" rather than throwing or returning undefined", async () => {
  const mfa = createMfaStub({ enroll: { data: null, error: {} } });
  const result = await enrollTotpFactor(mfa);
  assert.deepEqual(result, { ok: false, code: "unknown" });
});

// --- enrollTotpFactor: abandoned-enrollment recovery (the brief's headline case) ---

test("enrollTotpFactor: recovers from an abandoned enrollment — unenrolls only the stale UNVERIFIED factor sharing our name, then retries enroll exactly once", async () => {
  const mfa = createMfaStub({
    enroll: (_params, callNo) =>
      callNo === 0
        ? { data: null, error: { code: "mfa_factor_name_conflict" } }
        : enrolledFactor,
    listFactors: () => ({
      data: {
        all: [
          {
            id: "stale-unverified",
            factor_type: "totp",
            friendly_name: TOTP_FRIENDLY_NAME,
            status: "unverified",
            created_at: "2026-01-01T00:00:00Z",
          },
          // An unrelated, unrelated-name phone factor must never be touched.
          {
            id: "other-phone",
            factor_type: "phone",
            friendly_name: "some-other-name",
            status: "verified",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    }),
    unenroll: { data: {}, error: null },
  });

  const result = await enrollTotpFactor(mfa);
  assert.equal(result.ok, true);
  assert.equal(result.factorId, "factor-1");
  assert.equal(mfa.calls.enroll.length, 2, "must retry exactly once — never loop");
  assert.equal(mfa.calls.listFactors, 1);
  assert.deepEqual(
    mfa.calls.unenroll.map((c) => c.factorId),
    ["stale-unverified"],
    "only the stale UNVERIFIED totp factor under our friendly name is removed",
  );
});

test("enrollTotpFactor: refuses to touch a VERIFIED factor sharing the name — reports already_enrolled and never calls unenroll", async () => {
  const mfa = createMfaStub({
    enroll: { data: null, error: { code: "mfa_factor_name_conflict" } },
    listFactors: () => ({
      data: {
        all: [
          {
            id: "verified-1",
            factor_type: "totp",
            friendly_name: TOTP_FRIENDLY_NAME,
            status: "verified",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    }),
    unenroll: () => {
      throw new Error("must never unenroll a VERIFIED factor during recovery");
    },
  });

  const result = await enrollTotpFactor(mfa);
  assert.deepEqual(result, { ok: false, code: "already_enrolled" });
  assert.equal(mfa.calls.enroll.length, 1, "must not retry enroll once a verified factor is confirmed to hold the name");
  assert.equal(mfa.calls.unenroll.length, 0);
});

test("enrollTotpFactor: if listFactors itself fails during recovery, that error is returned and enroll is not blindly retried", async () => {
  const mfa = createMfaStub({
    enroll: { data: null, error: { code: "mfa_factor_name_conflict" } },
    listFactors: () => ({ data: null, error: { code: "unexpected_failure" } }),
  });
  const result = await enrollTotpFactor(mfa);
  assert.deepEqual(result, { ok: false, code: "unexpected_failure" });
  assert.equal(mfa.calls.enroll.length, 1);
});

test("enrollTotpFactor: if unenrolling the stale factor fails, that error is returned and enroll is not retried", async () => {
  const mfa = createMfaStub({
    enroll: { data: null, error: { code: "mfa_factor_name_conflict" } },
    listFactors: () => ({
      data: {
        all: [
          {
            id: "stale-unverified",
            factor_type: "totp",
            friendly_name: TOTP_FRIENDLY_NAME,
            status: "unverified",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    }),
    unenroll: { data: null, error: { code: "mfa_factor_not_found" } },
  });
  const result = await enrollTotpFactor(mfa);
  assert.deepEqual(result, { ok: false, code: "mfa_factor_not_found" });
  assert.equal(mfa.calls.enroll.length, 1);
});

// --- verifyTotpEnrollment ----------------------------------------------------

test("verifyTotpEnrollment: a challenge failure is returned with stage 'challenge' and verify is never called", async () => {
  const mfa = createMfaStub({
    challenge: { data: null, error: { code: "mfa_factor_not_found" } },
    verify: () => {
      throw new Error("verify must never run after a failed challenge");
    },
  });
  const result = await verifyTotpEnrollment(mfa, { factorId: "f1", code: "000000" });
  assert.deepEqual(result, { ok: false, code: "mfa_factor_not_found", stage: "challenge" });
  assert.equal(mfa.calls.verify.length, 0);
});

test("verifyTotpEnrollment: a wrong code is returned with stage 'verify', using the challenge's own id", async () => {
  const mfa = createMfaStub({
    challenge: { data: { id: "chal-1" }, error: null },
    verify: { data: null, error: { code: "mfa_verification_failed" } },
  });
  const result = await verifyTotpEnrollment(mfa, { factorId: "f1", code: "000000" });
  assert.deepEqual(result, { ok: false, code: "mfa_verification_failed", stage: "verify" });
  assert.deepEqual(mfa.calls.verify[0], { factorId: "f1", challengeId: "chal-1", code: "000000" });
});

test("verifyTotpEnrollment: success returns ok:true", async () => {
  const mfa = createMfaStub({
    challenge: { data: { id: "chal-2" }, error: null },
    verify: { data: {}, error: null },
  });
  const result = await verifyTotpEnrollment(mfa, { factorId: "f9", code: "123456" });
  assert.deepEqual(result, { ok: true });
});

// --- unenrollFactorWithFreshCode: the release-gate property --------------
//
// "Removing a second factor is a privilege reduction and must itself be
// authenticated" (task-6-brief.md). These three tests are the actual proof
// requested by the brief: `mfa.unenroll` is unreachable without an
// immediately-preceding successful challenge+verify.

test("unenrollFactorWithFreshCode: CANNOT reach mfa.unenroll when the challenge itself fails", async () => {
  const mfa = createMfaStub({
    challenge: { data: null, error: { code: "mfa_factor_not_found" } },
    verify: () => {
      throw new Error("verify must never run after a failed challenge");
    },
    unenroll: () => {
      throw new Error("unenroll must never run without a prior successful verify");
    },
  });
  const result = await unenrollFactorWithFreshCode(mfa, { factorId: "f1", code: "000000" });
  assert.deepEqual(result, { ok: false, code: "mfa_factor_not_found", stage: "challenge" });
  assert.equal(mfa.calls.unenroll.length, 0);
});

test("unenrollFactorWithFreshCode: CANNOT reach mfa.unenroll when the code is wrong (verify fails)", async () => {
  const mfa = createMfaStub({
    challenge: { data: { id: "chal-1" }, error: null },
    verify: { data: null, error: { code: "mfa_verification_failed" } },
    unenroll: () => {
      throw new Error("unenroll must never run without a prior successful verify");
    },
  });
  const result = await unenrollFactorWithFreshCode(mfa, { factorId: "f1", code: "000000" });
  assert.deepEqual(result, { ok: false, code: "mfa_verification_failed", stage: "verify" });
  assert.equal(
    mfa.calls.unenroll.length,
    0,
    "removing a factor is a privilege reduction — it must never happen off a rejected code",
  );
});

test("unenrollFactorWithFreshCode: reaches mfa.unenroll ONLY after a fresh challenge+verify succeeds", async () => {
  const mfa = createMfaStub({
    challenge: { data: { id: "chal-1" }, error: null },
    verify: { data: {}, error: null },
    unenroll: { data: {}, error: null },
  });
  const result = await unenrollFactorWithFreshCode(mfa, { factorId: "f1", code: "123456" });
  assert.deepEqual(result, { ok: true });
  assert.equal(mfa.calls.verify.length, 1);
  assert.deepEqual(mfa.calls.unenroll[0], { factorId: "f1" });
});

test("unenrollFactorWithFreshCode: if verify succeeds but the unenroll call itself then fails, that is reported distinctly (stage 'unenroll') — proof verify DID run", async () => {
  const mfa = createMfaStub({
    challenge: { data: { id: "chal-1" }, error: null },
    verify: { data: {}, error: null },
    unenroll: { data: null, error: { code: "unexpected_failure" } },
  });
  const result = await unenrollFactorWithFreshCode(mfa, { factorId: "f1", code: "123456" });
  assert.deepEqual(result, { ok: false, code: "unexpected_failure", stage: "unenroll" });
  assert.equal(mfa.calls.verify.length, 1, "verify ran and succeeded — the failure is in the removal step itself");
});

// --- lib/validation/mfa.js: browser/runtime-safety + no secret logging -----

test("lib/validation/mfa.js never logs anything (no console.*) — the TOTP secret must never reach logs", () => {
  assert.doesNotMatch(mfaLibSrc, /console\./, "this module must never call console.* directly");
});

test("lib/validation/mfa.js imports nothing from next/* — it must stay runnable under plain node --test", () => {
  assert.doesNotMatch(mfaLibSrc, /from\s+["']next/);
});

// --- actions.ts: structural checks (cannot be imported under plain node --test) ---

test("actions.ts: every exported MFA action starts with requireUser()", () => {
  for (const name of ["startEnrollment", "verifyEnrollment", "unenrollFactor"]) {
    const re = new RegExp(
      `export async function ${name}\\([^)]*\\)[^{]*\\{\\s*await requireUser\\(\\);`,
    );
    assert.match(actionsSrc, re, `${name} must call requireUser() as its first statement`);
  }
});

test("actions.ts: never returns a raw Supabase error.message to the caller (constraint 3)", () => {
  assert.doesNotMatch(
    actionsSrc,
    /error:\s*[A-Za-z]*[Ee]rror\??\.message/,
    "must return curated t(...) copy, never error.message",
  );
});

test("actions.ts: only the SDK error code is logged — the TOTP secret is never passed to console.*", () => {
  assert.doesNotMatch(actionsSrc, /console\.\w+\([^;]*secret/i);
  // The three console.error calls this file does make must log a `.code`-shaped
  // value (our own result.code), not the request body / formData / secret.
  assert.match(actionsSrc, /console\.error\("mfa_enroll_error", result\.code\)/);
  assert.match(actionsSrc, /console\.error\("mfa_verify_error", result\.code\)/);
  assert.match(actionsSrc, /console\.error\("mfa_unenroll_error", result\.code\)/);
});

test("actions.ts: unenrollFactor distinguishes a post-verify removal failure (stage 'unenroll') from a rejected code, instead of collapsing both into the same curated message", () => {
  assert.match(actionsSrc, /result\.stage === "unenroll"/);
});

// --- security-client.tsx: the OTP input contract from the brief ------------

test("security-client.tsx: the 6-digit code field is never type=\"number\" and is wired for real OTP entry", () => {
  assert.doesNotMatch(
    clientSrc,
    /<Input[^>]*name="code"[^>]*type="number"/s,
    'the OTP field must not be type="number" — spinners and locale digit grouping break code entry',
  );
  assert.match(clientSrc, /inputMode="numeric"/);
  assert.match(clientSrc, /pattern="\[0-9\]\*"/);
  assert.match(clientSrc, /autoComplete="one-time-code"/);
});

test("security-client.tsx: renders the server-issued QR SVG directly — no client-side QR generation library is imported or invoked", () => {
  // Deliberately narrow: our own `startState.qrCode` field/prop legitimately
  // contains the substring "qrcode" (case-insensitively), so this checks for
  // an actual QR *library* import or constructor call, not that substring.
  assert.doesNotMatch(clientSrc, /from\s+["']qrcode|require\(["']qrcode|new QRCode\(|<QRCode[\s/>]/i);
  assert.match(clientSrc, /src=\{startState\.qrCode\}/);
});

// --- release gate: no new QR/TOTP dependency --------------------------------

test("release gate: no QR-code or TOTP-generation library was added to package.json — Supabase's native mfa.enroll() already returns an SVG data URI", () => {
  const banned = [
    "qrcode",
    "qrcode.react",
    "qr-image",
    "otplib",
    "speakeasy",
    "otpauth",
    "@types/qrcode",
    "jsqr",
    "node-qrcode",
  ];
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of banned) {
    assert.ok(!(name in deps), `package.json must not depend on "${name}"`);
  }
});

// --- i18n: settings.security key parity + real Arabic copy -----------------

function collectKeys(obj, prefix = "") {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(collectKeys(value, keyPath));
    } else {
      keys.push(keyPath);
    }
  }
  return keys;
}

function getAt(obj, keyPath) {
  return keyPath.split(".").reduce((o, k) => o?.[k], obj);
}

test("i18n parity: en.json and ar.json have IDENTICAL key sets under settings.security", () => {
  assert.ok(en.settings?.security, "en.json is missing settings.security");
  assert.ok(ar.settings?.security, "ar.json is missing settings.security");
  const enKeys = collectKeys(en.settings.security).sort();
  const arKeys = collectKeys(ar.settings.security).sort();
  assert.deepEqual(
    arKeys,
    enKeys,
    "a missing (or extra) Arabic key under settings.security would ship as a raw key string to users",
  );
});

test("i18n: every settings.security string in ar.json is non-empty and contains real Arabic script (not an English placeholder)", () => {
  // The 6-digit code placeholder intentionally stays in Western digits in
  // both locales: a TOTP code is always Western Arabic numerals regardless
  // of UI language, so localizing the placeholder's digit glyphs would be
  // actively misleading about what to type.
  const EXCLUDED = new Set(["enroll.codePlaceholder"]);
  for (const key of collectKeys(ar.settings.security)) {
    const value = getAt(ar.settings.security, key);
    assert.equal(typeof value, "string", `ar.json settings.security.${key} must be a string`);
    assert.ok(value.trim().length > 0, `ar.json settings.security.${key} must not be empty`);
    if (EXCLUDED.has(key)) continue;
    assert.ok(
      /[؀-ۿ]/.test(value),
      `ar.json settings.security.${key} must contain real Arabic script, not an English placeholder: "${value}"`,
    );
  }
});

test("i18n: every settings.security string in en.json is non-empty", () => {
  for (const key of collectKeys(en.settings.security)) {
    const value = getAt(en.settings.security, key);
    assert.equal(typeof value, "string", `en.json settings.security.${key} must be a string`);
    assert.ok(value.trim().length > 0, `en.json settings.security.${key} must not be empty`);
  }
});
