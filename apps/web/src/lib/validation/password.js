// Canonical password policy (APPSEC-10 auth hardening, Task 1).
//
// This is the single source of truth for password strength, consumed both by
// Server Actions (`passwordSchema`, imported from a .ts action file) and by a
// CLIENT component (`passwordRules`, for a live "as you type" checklist —
// Task 3). Written as .js (ESM) for the same reason as the rest of
// `lib/validation/`: it must run unmodified in Server Actions AND in the
// offline `node --test tests/*.test.mjs` suite (see validation/common.js).
//
// BROWSER-SAFETY IS LOAD-BEARING, not stylistic: this module ships in a client
// bundle. No `node:crypto`, no `Buffer`, no `fs`, no network, no `next/*`
// imports. Byte-length is measured with `TextEncoder`, which exists in both
// Node and the browser — `Buffer.byteLength` does not exist in the browser and
// would break that bundle.
//
// Every user-facing message is curated here; raw Zod issues are never
// surfaced (see `firstValidationMessage` in ./common.js). `passwordRules`
// deliberately returns rule ids, not sentences — the client component renders
// those ids through i18n, so no English text belongs in that function.

import { z } from "zod";

import { firstValidationMessage } from "./common.js";

export { firstValidationMessage };

/** Same convention as validation/admin.js: escape sequences, never literal
 * control bytes in source. */
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

const LOWER_RE = /[a-z]/;
const UPPER_RE = /[A-Z]/;
const DIGIT_RE = /[0-9]/;
// "Symbol" = not lowercase, not uppercase, not a digit, and not whitespace.
const SYMBOL_RE = /[^a-zA-Z0-9\s]/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72; // bcrypt truncates silently past this.

/**
 * Weakest, most commonly breached passwords, checked case-insensitively.
 * Also rejected with a trailing "!" or "1" appended — the two suffixes people
 * reach for first when a form demands "more complexity".
 */
export const COMMON_PASSWORDS = [
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

const DENYLIST = new Set(
  COMMON_PASSWORDS.flatMap((word) => [word, `${word}!`, `${word}1`]).map((word) =>
    word.toLowerCase(),
  ),
);

function classesPresent(password) {
  return {
    lowercase: LOWER_RE.test(password),
    uppercase: UPPER_RE.test(password),
    digit: DIGIT_RE.test(password),
    symbol: SYMBOL_RE.test(password),
  };
}

function classCount(password) {
  const classes = classesPresent(password);
  return Object.values(classes).filter(Boolean).length;
}

function emailLocalPart(email) {
  if (typeof email !== "string") return "";
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

/** Below 4 characters the substring test produces too many false rejections
 * to be worth it. */
function containsEmailLocalPart(password, email) {
  const local = emailLocalPart(email).trim();
  if (local.length < 4) return false;
  return password.toLowerCase().includes(local.toLowerCase());
}

function isCommonPassword(password) {
  return DENYLIST.has(password.toLowerCase());
}

/**
 * Live, per-keystroke rule status for client-side display (Task 3). Rule ids
 * only, in a fixed order — no English text, so the caller can render each id
 * through i18n.
 */
export function passwordRules(password, { email } = {}) {
  const value = typeof password === "string" ? password : "";
  const classes = classesPresent(value);
  return [
    { id: "length", met: value.length >= PASSWORD_MIN_LENGTH },
    { id: "lowercase", met: classes.lowercase },
    { id: "uppercase", met: classes.uppercase },
    { id: "digit", met: classes.digit },
    { id: "symbol", met: classes.symbol },
    { id: "notEmail", met: !containsEmailLocalPart(value, email) },
    { id: "notCommon", met: !isCommonPassword(value) },
  ];
}

/**
 * Canonical password schema. `email`, when supplied, is used only to reject a
 * password containing its local-part — it is never itself validated here.
 */
export function passwordSchema({ email } = {}) {
  return z
    .string({ message: "Please enter a password." })
    .refine((v) => v.trim().length > 0, "Please enter a password.")
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .refine(
      (v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_BYTES,
      "Password is too long.",
    )
    .refine(
      (v) => !CONTROL_CHARS_RE.test(v),
      "Password contains characters that aren't allowed.",
    )
    .refine(
      (v) => classCount(v) >= 3,
      "Password must include at least 3 of: lowercase letters, uppercase letters, numbers, and symbols.",
    )
    .refine(
      (v) => !containsEmailLocalPart(v, email),
      "Password must not contain your email address.",
    )
    .refine(
      (v) => !isCommonPassword(v),
      "This password is too common. Please choose a different one.",
    );
}
