// Live verification for TOTP MFA enrollment/challenge (APPSEC-10 Task 6)
// against a LOCAL Supabase stack ONLY. This is NOT part of `pnpm test` / CI
// — it needs a running local stack (`supabase start` from the repo root)
// with `[auth.mfa.totp] enroll_enabled = true` / `verify_enabled = true` in
// supabase/config.toml, and it signs up a disposable throwaway user to
// exercise the real GoTrue MFA endpoints end-to-end. Run it manually:
//
//   node scripts/verify-mfa-enrollment.mjs
//
// It imports the SAME pure functions the app ships
// (../src/lib/validation/mfa.js) and drives them against the REAL
// `supabase.auth.mfa` client — not a stub — proving the abandoned-enrollment
// recovery, the wrong-code rejection, and the "unenroll requires a fresh
// valid code" rule against actual GoTrue behavior, not just our
// understanding of its contract. `tests/mfa-enrollment.test.mjs` (the
// committed, CI-run suite) covers the same logic offline with a stubbed
// client; this script is the live counterpart for local, manual spot-checks.
//
// A minimal TOTP code generator (HMAC-SHA1, RFC 6238) is implemented right
// here so the script can submit a VALID code — this is throwaway
// verification tooling, not application code, so it does not conflict with
// "add no new QR/TOTP dependency" (that constraint is about the shipped app).
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) — defaults to
//     http://127.0.0.1:54321, the standard local Supabase API port.
//   SUPABASE_ANON_KEY — defaults to the well-known local demo anon key
//     (same one apps/web/scripts/e2e.mjs and verify-rate-limit.mjs use).
//   ALLOW_NONLOCAL_MFA_VERIFY=1 — required to target a non-local host.
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  enrollTotpFactor,
  unenrollFactorWithFreshCode,
  verifyTotpEnrollment,
} from "../src/lib/validation/mfa.js";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}
loadEnvLocal();

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const ALLOW_NONLOCAL = process.env.ALLOW_NONLOCAL_MFA_VERIFY === "1";

function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
function assertLocal(rawUrl, label) {
  const host = hostOf(rawUrl);
  if (ALLOW_NONLOCAL) return;
  if (host && LOCAL_HOSTS.has(host)) return;
  console.error(
    [
      "",
      `Refusing to run: ${label} resolves to a non-local host (${host ?? rawUrl}).`,
      "This script signs up a disposable user and enrolls/verifies/removes a",
      "real TOTP factor — pointing it at a hosted project would create junk",
      "auth users and factors there.",
      "",
      "If this is genuinely intentional, set ALLOW_NONLOCAL_MFA_VERIFY=1 and",
      "re-run. Otherwise point NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL at",
      "your local stack (http://127.0.0.1:54321).",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
assertLocal(SUPABASE_URL, "the Supabase API URL");

// --- minimal RFC 6238 TOTP, for submitting a VALID code in step 4/7 below --

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error(`invalid base32 char: ${char}`);
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secretBase32, timeStepSeconds = 30, digits = 6, at = Date.now()) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(at / 1000 / timeStepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** digits).padStart(digits, "0");
}

function ok(label) {
  console.log(`ok  - ${label}`);
}

async function main() {
  const email = `mfa-live-check-${Date.now()}@example.com`;
  const password = "Correct-Horse-Battery-Staple-9!";
  const supabase = createClient(SUPABASE_URL, ANON_KEY);

  console.log(`Signing up disposable test user: ${email}`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw new Error(`signUp failed: ${signUpError.code} ${signUpError.message}`);
  if (!signUpData.session) throw new Error("signUp did not return a session — is email confirmation required locally?");
  ok("signed up disposable user and got a session");

  // 1. Happy-path enroll.
  const first = await enrollTotpFactor(supabase.auth.mfa);
  if (!first.ok) throw new Error(`expected enroll to succeed, got ${JSON.stringify(first)}`);
  if (!first.qrCode.startsWith("data:image/svg+xml")) {
    throw new Error(`qr_code does not look like an SVG data URI: ${first.qrCode.slice(0, 40)}...`);
  }
  ok(`enrolled factor ${first.factorId} (qr_code is an SVG data URI, secret length ${first.secret.length})`);

  // 2. Abandon it — enroll again WITHOUT verifying. Must recover by
  // unenrolling the stale unverified factor and retrying once.
  const recovered = await enrollTotpFactor(supabase.auth.mfa);
  if (!recovered.ok) throw new Error(`expected recovery enroll to succeed, got ${JSON.stringify(recovered)}`);
  if (recovered.factorId === first.factorId) {
    throw new Error("expected a NEW factor id after recovering from an abandoned enrollment");
  }
  const { data: afterRecovery } = await supabase.auth.mfa.listFactors();
  if (afterRecovery.all.some((f) => f.id === first.factorId)) {
    throw new Error("the abandoned factor was not cleaned up");
  }
  ok(`abandoned-enrollment recovery: old unverified factor ${first.factorId} removed, new factor ${recovered.factorId} created`);

  // 3. Verify with a WRONG code — must fail, factor stays unverified.
  const wrongVerify = await verifyTotpEnrollment(supabase.auth.mfa, { factorId: recovered.factorId, code: "000000" });
  if (wrongVerify.ok) throw new Error("expected a wrong code to be rejected");
  ok(`wrong verification code rejected (code=${wrongVerify.code}, stage=${wrongVerify.stage})`);

  // 4. Verify with a REAL, freshly-computed TOTP code.
  const validCode = totp(recovered.secret);
  const verify = await verifyTotpEnrollment(supabase.auth.mfa, { factorId: recovered.factorId, code: validCode });
  if (!verify.ok) throw new Error(`expected the real code to verify, got ${JSON.stringify(verify)}`);
  ok(`activated factor ${recovered.factorId} with a real computed TOTP code`);

  // 5. Re-enroll while already verified — must refuse, never touch it.
  const alreadyEnrolled = await enrollTotpFactor(supabase.auth.mfa);
  if (alreadyEnrolled.ok || alreadyEnrolled.code !== "already_enrolled") {
    throw new Error(`expected already_enrolled, got ${JSON.stringify(alreadyEnrolled)}`);
  }
  const { data: stillVerified } = await supabase.auth.mfa.listFactors();
  if (!stillVerified.totp.some((f) => f.id === recovered.factorId)) {
    throw new Error("the verified factor was touched by a refused re-enroll attempt");
  }
  ok("re-enrolling while already verified was refused (already_enrolled) and the verified factor was left untouched");

  // 6. unenroll with a WRONG code — must NOT remove the factor.
  const wrongUnenroll = await unenrollFactorWithFreshCode(supabase.auth.mfa, { factorId: recovered.factorId, code: "000000" });
  if (wrongUnenroll.ok) throw new Error("expected wrong-code unenroll to fail");
  const { data: afterWrongUnenroll } = await supabase.auth.mfa.listFactors();
  if (!afterWrongUnenroll.totp.some((f) => f.id === recovered.factorId)) {
    throw new Error("the factor was removed despite a wrong code — this is the critical property this task requires");
  }
  ok(`unenroll with a wrong code was rejected (code=${wrongUnenroll.code}, stage=${wrongUnenroll.stage}) and the factor was NOT removed`);

  // 7. unenroll with a fresh REAL code — must succeed.
  const freshCode = totp(recovered.secret);
  const realUnenroll = await unenrollFactorWithFreshCode(supabase.auth.mfa, { factorId: recovered.factorId, code: freshCode });
  if (!realUnenroll.ok) throw new Error(`expected fresh-code unenroll to succeed, got ${JSON.stringify(realUnenroll)}`);
  const { data: finalFactors } = await supabase.auth.mfa.listFactors();
  if (finalFactors.all.some((f) => f.id === recovered.factorId)) {
    throw new Error("factor still present after a successful unenroll");
  }
  ok("unenrolled the factor with a fresh real code");

  await supabase.auth.signOut();
  console.log("\nAll live MFA checks passed against the local Supabase stack.");
}

main().catch((err) => {
  console.error("\nLIVE MFA VERIFICATION FAILED");
  console.error(err);
  process.exitCode = 1;
});
