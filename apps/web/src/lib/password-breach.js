// Breached-password screening via HIBP k-anonymity (APPSEC-10 auth hardening,
// Task 2).
//
// SERVER-ONLY. This module uses `node:crypto` deliberately — unlike
// `lib/validation/password.js` (Task 1), it is never imported into a client
// bundle. Task 3 imports it only from a Server Action (`actions.ts`).
//
// How k-anonymity keeps the password private: we SHA-1 the password locally,
// then send Have I Been Pwned only the first 5 hex characters of that hash
// (the "prefix"). HIBP responds with every breached hash sharing that prefix,
// as SUFFIX:COUNT lines, and we compare the remaining 35 characters (the
// "suffix") locally. The password itself and the full hash never leave this
// process — only a 5-character prefix shared by (on average) hundreds of
// other hashes does.
//
// SHA-1 IS NOT A SECURITY CHOICE HERE. It is mandated by HIBP's range API,
// which is keyed on SHA-1 prefixes. Do not "upgrade" this to SHA-256 or any
// other hash — that would silently turn every lookup into a no-op (HIBP would
// never match anything), not a stronger check.
//
// FAIL-OPEN CONTRACT — the one deliberate fail-open in this whole design.
// Every other module in this codebase fails closed by default; this one does
// not, on purpose. HIBP is a third-party dependency sitting on the signup
// path. If it's down, slow, or returns something unexpected, that must not
// become an outage for Revora signups. Any non-200 response, network error,
// timeout, or malformed body returns `{ breached: false, checked: false }`
// and logs a stable code only (never a message body, never any part of the
// password or hash). Callers (Task 3) must treat `checked: false` as "we
// could not determine" and decide accordingly — never as "known safe". A
// future reader who "fixes" this into fail-closed will take signups down
// during every HIBP outage; don't do that.

import { createHash } from "node:crypto";

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

// A password this long cannot possibly be a legitimate submission: the
// password schema (Task 1, `lib/validation/password.js`) already rejects
// anything over PASSWORD_MAX_BYTES (72 bytes, the bcrypt truncation point)
// before this module is ever called. We don't import that module (this one
// must stay import-free of Task 1's, per the brief), so we keep an
// intentionally generous local bound instead of importing PASSWORD_MAX_BYTES
// exactly — the goal here isn't to re-enforce the password policy, it's to
// stop an attacker from making the server hash a multi-megabyte string (real
// CPU burn) on a path that runs before any other validation. Anything this
// large was never going to pass the schema anyway.
const MAX_INPUT_BYTES = 1024;

/**
 * Check a candidate password against the Have I Been Pwned breached-password
 * corpus, without ever transmitting the password or its full hash.
 *
 * @param {string} password
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ breached: boolean, checked: boolean }>}
 *   `checked: false` means "we could not determine" (network/timeout/HIBP
 *   error/malformed body) and is independent of `breached` — callers must not
 *   collapse the two. `checked: true` means the lookup completed and
 *   `breached` reflects a real result.
 */
export async function isPasswordBreached(
  password,
  { fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {},
) {
  if (typeof password !== "string" || password.length === 0) {
    return { breached: false, checked: false };
  }

  // Guard against hashing an absurdly large attacker-supplied string before
  // doing any work. See MAX_INPUT_BYTES comment above.
  if (new TextEncoder().encode(password).length > MAX_INPUT_BYTES) {
    return { breached: false, checked: false };
  }

  // SHA-1 is required by HIBP's range API — see module header. Not a security
  // choice; do not change this hash algorithm.
  const fullHash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = fullHash.slice(0, 5);
  const suffix = fullHash.slice(5);

  let response;
  try {
    response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.error("password breach check unavailable", error?.name ?? "fetch_error");
    return { breached: false, checked: false };
  }

  if (!response.ok) {
    console.error("password breach check unavailable", `http_${response.status}`);
    return { breached: false, checked: false };
  }

  let body;
  try {
    body = await response.text();
  } catch {
    console.error("password breach check unavailable", "body_read_error");
    return { breached: false, checked: false };
  }

  if (typeof body !== "string" || body.length === 0) {
    console.error("password breach check unavailable", "empty_body");
    return { breached: false, checked: false };
  }

  let sawValidLine = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const lineSuffix = line.slice(0, separatorIndex);
    const countText = line.slice(separatorIndex + 1);
    const count = Number(countText);
    if (!Number.isFinite(count) || count < 0) continue;

    sawValidLine = true;

    // Padding entries (count 0) are HIBP's response-size camouflage, not real
    // breach data, and must never be treated as a match — this is the subtle
    // bug most k-anonymity implementations get wrong.
    if (count === 0) continue;

    if (lineSuffix.length === suffix.length && lineSuffix.toUpperCase() === suffix) {
      return { breached: true, checked: true };
    }
  }

  if (!sawValidLine) {
    console.error("password breach check unavailable", "malformed_body");
    return { breached: false, checked: false };
  }

  return { breached: false, checked: true };
}
