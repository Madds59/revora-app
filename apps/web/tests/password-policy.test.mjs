import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-10 (auth hardening) Task 1 — the single canonical password rule set.
// Pure logic, no I/O, no React. Consumed later by a Server Action
// (`passwordSchema`) and by a CLIENT component (`passwordRules`), which is why
// several tests below assert this module never grows a Node-only or
// browser-unsafe dependency.

import {
  COMMON_PASSWORDS,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  firstValidationMessage,
  passwordRules,
  passwordSchema,
} from "../src/lib/validation/password.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(
  path.join(here, "..", "src", "lib", "validation", "password.js"),
  "utf8",
);

const ok = (r) => r.success === true;
const enc = new TextEncoder();

/**
 * Build a password of an EXACT UTF-8 byte length that still satisfies every
 * other rule (>=12 chars, 3-of-4 classes, no control chars, not an email
 * local-part, not a denylist entry) so the byte-boundary tests isolate only
 * the byte-length rule. Pads with a 4-byte emoji, then 1-byte ASCII, so any
 * target length >= 3 is reachable exactly.
 */
function passwordOfByteLength(target) {
  let s = "Ab1"; // lower + upper + digit already present (3 of 4 classes).
  const filler = "\u{1F697}"; // car emoji, 4 bytes in UTF-8.
  while (enc.encode(s).length + 4 <= target) s += filler;
  while (enc.encode(s).length < target) s += "x";
  return s;
}

// A strong baseline password used when a test wants everything to pass except
// the one rule under test.
const STRONG = "Ab1!Ab1!Ab1!"; // 12 chars, all 4 classes, no email/denylist hit.

test("baseline: a strong password with no email context is accepted", () => {
  assert.equal(ok(passwordSchema().safeParse(STRONG)), true);
});

// --- length ------------------------------------------------------------

test("length: below the minimum is rejected; at the minimum is accepted", () => {
  assert.equal(ok(passwordSchema().safeParse("Ab1!Ab1!Ab1")), false); // 11 chars
  assert.equal(ok(passwordSchema().safeParse(STRONG)), true); // 12 chars
});

test("rules: length rule id reflects the character-count boundary", () => {
  assert.equal(
    passwordRules("a".repeat(PASSWORD_MIN_LENGTH - 1)).find((r) => r.id === "length").met,
    false,
  );
  assert.equal(
    passwordRules("a".repeat(PASSWORD_MIN_LENGTH)).find((r) => r.id === "length").met,
    true,
  );
});

// --- byte-length (bcrypt truncation) ------------------------------------

test("bytes: a 72-byte Arabic/emoji password is accepted, 73 bytes is rejected", () => {
  const at72 = passwordOfByteLength(PASSWORD_MAX_BYTES);
  const at73 = passwordOfByteLength(PASSWORD_MAX_BYTES + 1);
  assert.equal(enc.encode(at72).length, 72);
  assert.equal(enc.encode(at73).length, 73);
  assert.equal(ok(passwordSchema().safeParse(at72)), true);
  assert.equal(ok(passwordSchema().safeParse(at73)), false);
});

test("bytes: an all-Arabic password is measured in UTF-8 bytes, not UTF-16 length", () => {
  // Arabic letters are 2 bytes each in UTF-8 but 1 UTF-16 code unit each, so
  // password.length would under-count and let an over-limit password through.
  const arabicChar = "ش"; // ش
  const oversized = "Ab1!" + arabicChar.repeat(35); // 4 + 70 = 74 bytes
  assert.ok(oversized.length < PASSWORD_MAX_BYTES); // .length alone looks fine
  assert.ok(enc.encode(oversized).length > PASSWORD_MAX_BYTES); // but bytes exceed it
  assert.equal(ok(passwordSchema().safeParse(oversized)), false);
});

// --- 3-of-4 character classes -------------------------------------------

test("classes: exactly 2 of 4 present is rejected, exactly 3 of 4 is accepted", () => {
  const twoClasses = "abcdefgh1234"; // lower + digit only, 12 chars
  assert.equal(passwordRules(twoClasses).filter((r) => r.met && isClassId(r.id)).length, 2);
  assert.equal(ok(passwordSchema().safeParse(twoClasses)), false);

  const threeClasses = "Abcdefghij12"; // lower + upper + digit, no symbol, 12 chars
  assert.equal(passwordRules(threeClasses).filter((r) => r.met && isClassId(r.id)).length, 3);
  assert.equal(ok(passwordSchema().safeParse(threeClasses)), true);
});

function isClassId(id) {
  return id === "lowercase" || id === "uppercase" || id === "digit" || id === "symbol";
}

test("classes: symbol means 'none of the other three, and not whitespace'", () => {
  const withSpaceOnly = "Ab1 Ab1 Ab1 "; // lower, upper, digit, and a literal space
  const rules = passwordRules(withSpaceOnly);
  assert.equal(rules.find((r) => r.id === "symbol").met, false, "whitespace must not count as a symbol");

  const withPunctuation = "Ab1?Ab1?Ab1?";
  assert.equal(passwordRules(withPunctuation).find((r) => r.id === "symbol").met, true);
});

test("classes: each single-class rule id reflects only its own class", () => {
  const rules = passwordRules("Ab1!Ab1!Ab1!");
  for (const id of ["lowercase", "uppercase", "digit", "symbol"]) {
    assert.equal(rules.find((r) => r.id === id).met, true, id);
  }
});

// --- control characters --------------------------------------------------

test("control characters: a NUL or other control byte is rejected even in an otherwise-valid password", () => {
  const withNul = `Ab1!Ab1!${String.fromCharCode(0)}Ab1!`;
  assert.ok(withNul.length >= PASSWORD_MIN_LENGTH);
  assert.equal(ok(passwordSchema().safeParse(withNul)), false);

  const withDel = `Ab1!Ab1!${String.fromCharCode(0x7f)}Ab1!`;
  assert.equal(ok(passwordSchema().safeParse(withDel)), false);

  const withEscape = `Ab1!Ab1!${String.fromCharCode(0x1b)}Ab1!`;
  assert.equal(ok(passwordSchema().safeParse(withEscape)), false);
});

// --- trimmed-empty ---------------------------------------------------------

test("trimmed-empty: a password that is only whitespace is rejected even at 12+ characters", () => {
  const allSpaces = " ".repeat(PASSWORD_MIN_LENGTH);
  assert.equal(allSpaces.length, PASSWORD_MIN_LENGTH);
  assert.equal(ok(passwordSchema().safeParse(allSpaces)), false);
  const result = passwordSchema().safeParse(allSpaces);
  assert.equal(firstValidationMessage(result), "Please enter a password.");
});

test("trimmed-empty: an empty string is rejected", () => {
  assert.equal(ok(passwordSchema().safeParse("")), false);
});

// --- email local-part ------------------------------------------------------

test("email: password containing the local-part (>=4 chars) is rejected, case-insensitively", () => {
  const email = "johndoe@example.com"; // local-part "johndoe", 7 chars
  const containing = "MyJohndoe12!"; // contains "Johndoe" case-insensitively, 12 chars, all 4 classes
  assert.equal(ok(passwordSchema({ email }).safeParse(containing)), false);
  assert.equal(passwordRules(containing, { email }).find((r) => r.id === "notEmail").met, false);
});

test("email: local-part shorter than 4 characters is exempt from the substring check", () => {
  const email = "abc@example.com"; // local-part "abc", 3 chars — below the threshold
  const containingShortLocal = "MyAbc12345!!"; // contains "abc" but must still pass
  assert.equal(ok(passwordSchema({ email }).safeParse(containingShortLocal)), true);
  assert.equal(
    passwordRules(containingShortLocal, { email }).find((r) => r.id === "notEmail").met,
    true,
  );
});

test("email: no email supplied never triggers the rule", () => {
  assert.equal(ok(passwordSchema().safeParse(STRONG)), true);
  assert.equal(passwordRules(STRONG).find((r) => r.id === "notEmail").met, true);
});

test("email: a password NOT containing the local-part is unaffected", () => {
  const email = "johndoe@example.com";
  assert.equal(ok(passwordSchema({ email }).safeParse(STRONG)), true);
});

// --- common-password denylist ----------------------------------------------

test("denylist: contains at least the required 20 entries", () => {
  const required = [
    "password",
    "password1",
    "password123",
    "123456",
    "12345678",
    "123456789",
    "qwerty",
    "qwerty123",
    "letmein",
    "welcome",
    "welcome1",
    "admin",
    "admin123",
    "iloveyou",
    "monkey",
    "dragon",
    "sunshine",
    "princess",
    "football",
    "changeme",
  ];
  for (const word of required) {
    assert.ok(COMMON_PASSWORDS.includes(word), `missing denylist entry: ${word}`);
  }
  assert.ok(COMMON_PASSWORDS.length >= 20);
});

test("denylist: a bare denylist entry is rejected", () => {
  assert.equal(ok(passwordSchema().safeParse("qwerty123")), false);
  assert.equal(passwordRules("qwerty123").find((r) => r.id === "notCommon").met, false);
});

test("denylist: entries are also rejected with a trailing '!' or '1' appended", () => {
  assert.equal(ok(passwordSchema().safeParse("letmein!")), false);
  assert.equal(ok(passwordSchema().safeParse("letmein1")), false);
  assert.equal(passwordRules("letmein!").find((r) => r.id === "notCommon").met, false);
});

test("denylist: matching is case-insensitive and isolated from the other rules (>=12 chars, 3-of-4 classes)", () => {
  // "password123" + "1" appended = "password1231" (12 chars); capitalising the
  // first letter still satisfies lower+upper+digit (3 of 4 classes) and every
  // other rule, isolating the denylist check as the sole failure.
  const candidate = "Password1231";
  assert.equal(candidate.length, 12);
  assert.equal(passwordRules(candidate).filter((r) => r.met && isClassId(r.id)).length, 3);
  assert.equal(ok(passwordSchema().safeParse(candidate)), false);
  const rules = passwordRules(candidate);
  assert.equal(rules.find((r) => r.id === "notCommon").met, false);
  // Every rule id EXCEPT symbol (not needed — 3 of 4 is already satisfied
  // without it) and notCommon is satisfied, so notCommon is the sole reason
  // the schema rejects this password.
  for (const id of ["length", "lowercase", "uppercase", "digit", "notEmail"]) {
    assert.equal(rules.find((r) => r.id === id).met, true, id);
  }
  assert.equal(rules.find((r) => r.id === "symbol").met, false);
});

test("denylist: an unrelated strong password is not flagged", () => {
  assert.equal(passwordRules(STRONG).find((r) => r.id === "notCommon").met, true);
});

// --- curated messages -------------------------------------------------------

test("messages: failures never surface raw Zod issue text", () => {
  const cases = [
    "",
    "short",
    "abcdefgh1234", // 2 of 4 classes
    passwordOfByteLength(PASSWORD_MAX_BYTES + 1),
    `Ab1!Ab1!${String.fromCharCode(0)}Ab1!`,
    "qwerty123",
  ];
  for (const bad of cases) {
    const result = passwordSchema().safeParse(bad);
    assert.equal(result.success, false);
    const msg = firstValidationMessage(result);
    assert.equal(typeof msg, "string");
    assert.ok(msg.length > 0 && msg.length <= 160);
    assert.doesNotMatch(msg, /zod|ZodError|issues|invalid_type|too_small|custom/i);
  }
});

test("rules: passwordRules never returns English sentences, only fixed ids", () => {
  const ids = passwordRules(STRONG, { email: "a@b.com" }).map((r) => r.id);
  assert.deepEqual(ids, [
    "length",
    "lowercase",
    "uppercase",
    "digit",
    "symbol",
    "notEmail",
    "notCommon",
  ]);
  for (const rule of passwordRules(STRONG)) {
    assert.equal(typeof rule.met, "boolean");
    assert.ok(!/[A-Za-z]{4,} /.test(rule.id), "rule id must not be a sentence");
  }
});

// --- fail-closed on malformed input -----------------------------------------

test("fail-closed: non-string input is rejected, not coerced", () => {
  for (const bad of [null, undefined, 12345678901234, {}, [], true]) {
    assert.equal(ok(passwordSchema().safeParse(bad)), false);
  }
});

test("fail-closed: passwordRules tolerates non-string input without throwing", () => {
  assert.doesNotThrow(() => passwordRules(undefined));
  assert.doesNotThrow(() => passwordRules(null));
  const rules = passwordRules(undefined);
  for (const id of ["length", "lowercase", "uppercase", "digit", "symbol"]) {
    assert.equal(rules.find((r) => r.id === id).met, false, id);
  }
  // An empty password contains no denylist entry and no email local-part.
  assert.equal(rules.find((r) => r.id === "notEmail").met, true);
  assert.equal(rules.find((r) => r.id === "notCommon").met, true);
});

// --- release gate: this module must stay browser-safe -----------------------

test("release gate: password.js has no Node-only or browser-unsafe dependency", () => {
  assert.ok(!moduleSource.includes("localStorage"), "must not touch localStorage");
  assert.ok(!moduleSource.includes("sessionStorage"), "must not touch sessionStorage");
  assert.ok(!/\bfetch\s*\(/.test(moduleSource), "must not make a network call");
  assert.ok(!moduleSource.includes("XMLHttpRequest"), "must not make a network call");
  // Real usage, not documentation: the header comment legitimately explains
  // in prose why Buffer/fs/node:*/next/* are avoided, so only flag actual
  // code use (a Buffer.* call, `new Buffer`, or an import of it).
  assert.ok(!/\bBuffer\s*\.\s*\w+\s*\(/.test(moduleSource), "must not call a Buffer method");
  assert.ok(!/\bnew\s+Buffer\s*\(/.test(moduleSource), "must not construct a Buffer");
  assert.ok(!/from\s+["']node:/.test(moduleSource), "must not import a node: builtin");
  assert.ok(!/from\s+["']buffer["']/.test(moduleSource), "must not import the buffer module");
  assert.ok(!/require\(/.test(moduleSource), "must not use require()");
  assert.ok(!/from\s+["']next\//.test(moduleSource), "must not import next/*");
  assert.ok(!moduleSource.includes("process.env"), "must not read server-only env vars");
});

test("release gate: the byte bound is measured with TextEncoder, never with .length or Buffer.byteLength", () => {
  assert.match(
    moduleSource,
    /new TextEncoder\(\)\.encode\([^)]*\)\.length\s*<=\s*PASSWORD_MAX_BYTES/,
    "the max-byte check must run the value through TextEncoder().encode(...).length",
  );
  assert.ok(!/\bBuffer\s*\.\s*byteLength\s*\(/.test(moduleSource), "must not use Buffer.byteLength");
  // Guard against a regression back to raw `password.length <= PASSWORD_MAX_BYTES`
  // (UTF-16 code units, not UTF-8 bytes) anywhere else in the file: exactly one
  // "<= PASSWORD_MAX_BYTES" comparison should exist, and it's the TextEncoder one.
  const boundComparisons = moduleSource.match(/\.length\s*<=\s*PASSWORD_MAX_BYTES/g) ?? [];
  assert.equal(boundComparisons.length, 1, "expected exactly one byte-bound comparison");
});

test("release gate: CONTROL_CHARS_RE is written with escape sequences, not literal control bytes", () => {
  assert.match(moduleSource, /CONTROL_CHARS_RE\s*=\s*\/\[\\u0000-\\u001F\\u007F\]\//);
  // No raw control byte (0x00-0x1F or 0x7F) appears anywhere in the source file.
  for (let i = 0; i < moduleSource.length; i++) {
    const code = moduleSource.charCodeAt(i);
    const isNewlineOrTab = code === 0x0a || code === 0x0d || code === 0x09;
    if (!isNewlineOrTab) {
      assert.ok(
        !(code <= 0x1f || code === 0x7f),
        `raw control byte 0x${code.toString(16)} found at offset ${i}`,
      );
    }
  }
});

test("release gate: passwordRules and the schema never log or embed the raw password", () => {
  // The source must never pass its `password`/`v` parameter to console.* — a
  // password is secret material and must not be logged, not even in an error path.
  assert.ok(!/console\.(log|error|warn|info|debug)\(/.test(moduleSource));
});
