import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-10 (auth hardening) Task 3 — wiring the Task 1 policy module and
// Task 2 breach check into the actual signup / password-reset Server Actions
// and their forms.
//
// `actions.ts` imports `next/headers`, `next/navigation` and `next-intl/server`,
// so (like the existing *-security.test.mjs suites) it cannot be imported and
// executed directly under plain `node --test`. Behavioural intent is instead
// proven two ways: (1) structural assertions against the action source itself
// — the same convention as admin-security.test.mjs — and (2) direct,
// functional tests of the real `passwordSchema` / `isPasswordBreached`
// exports against the exact decision predicate (`checked && breached`) that
// the action source is asserted to contain.

import {
  PASSWORD_MIN_LENGTH,
  passwordRules,
  passwordSchema,
} from "../src/lib/validation/password.js";
import { isPasswordBreached } from "../src/lib/password-breach.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, "..", "src", p), "utf8");

const ACTIONS_PATH = "app/[locale]/(auth)/actions.ts";
const SIGNUP_CLIENT_PATH = "app/[locale]/(auth)/signup/signup-client.tsx";
const RESET_CLIENT_PATH = "app/[locale]/(auth)/reset-password/reset-password-client.tsx";
const REQUIREMENTS_PATH = "components/password-requirements.tsx";

const actions = src(ACTIONS_PATH);
const signupClient = src(SIGNUP_CLIENT_PATH);
const resetClient = src(RESET_CLIENT_PATH);
const requirements = src(REQUIREMENTS_PATH);

const en = JSON.parse(src("messages/en.json"));
const ar = JSON.parse(src("messages/ar.json"));

const ok = (r) => r.success === true;

/** Slice one top-level `export async function name(...) { ... }` block out of
 * actions.ts, the same technique admin-security.test.mjs uses. */
function functionBody(name) {
  const start = actions.indexOf(`export async function ${name}`);
  assert.ok(start > -1, `${name} not found in ${ACTIONS_PATH}`);
  const body = actions.slice(start);
  const end = body.indexOf("\n}\n");
  return body.slice(0, end > -1 ? end + 1 : undefined);
}

function sha1Upper(password) {
  return createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
}

/** Stub HIBP response body containing `password`'s own suffix at `count`. */
function stubBodyFor(password, count) {
  const full = sha1Upper(password);
  const suffix = full.slice(5);
  return [`${suffix}:${count}`, "AAAA000000000000000000000000000AAAA:9"].join("\r\n");
}

// --- import wiring -----------------------------------------------------

test("wiring: actions.ts imports passwordSchema from the shared policy module", () => {
  assert.match(
    actions,
    /import \{[^}]*passwordSchema[^}]*\} from "@\/lib\/validation\/password"/,
  );
  assert.match(actions, /import \{[^}]*firstValidationMessage[^}]*\} from "@\/lib\/validation\/password"/);
});

test("wiring: actions.ts imports isPasswordBreached from the server-only breach module", () => {
  assert.match(actions, /import \{ isPasswordBreached \} from "@\/lib\/password-breach"/);
});

// --- signUp --------------------------------------------------------------

test("signUp: parses the password through passwordSchema({ email }) before calling Supabase", () => {
  const fn = functionBody("signUp");
  const parseAt = fn.indexOf("passwordSchema({ email }).safeParse(password)");
  const supabaseAt = fn.indexOf("supabase.auth.signUp(");
  assert.ok(parseAt > -1, "signUp must call passwordSchema({ email }).safeParse(password)");
  assert.ok(supabaseAt > -1, "signUp must still call supabase.auth.signUp");
  assert.ok(parseAt < supabaseAt, "the schema must run before Supabase is touched");
});

test("signUp: on schema failure, returns the curated message and never reaches Supabase", () => {
  const fn = functionBody("signUp");
  assert.match(fn, /if \(!parsedPassword\.success\) \{\s*return \{ error: firstValidationMessage\(parsedPassword\) \};/);
});

test("signUp: calls isPasswordBreached after the schema succeeds and before Supabase", () => {
  const fn = functionBody("signUp");
  const parseAt = fn.indexOf("passwordSchema({ email }).safeParse(password)");
  const breachAt = fn.indexOf("isPasswordBreached(password)");
  const supabaseAt = fn.indexOf("supabase.auth.signUp(");
  assert.ok(breachAt > -1, "signUp must call isPasswordBreached(password)");
  assert.ok(parseAt < breachAt, "the breach check must run after the schema, never before");
  assert.ok(breachAt < supabaseAt, "the breach check must run before Supabase is touched");
});

test("signUp: rejects only on checked && breached, never on breached alone", () => {
  const fn = functionBody("signUp");
  assert.match(fn, /if \(checked && breached\) return \{ error: t\("passwordBreached"\) \};/);
});

// --- updatePassword --------------------------------------------------------

test("updatePassword: parses the password through passwordSchema() (no email in scope) before Supabase", () => {
  const fn = functionBody("updatePassword");
  const parseAt = fn.indexOf("passwordSchema().safeParse(password)");
  const supabaseAt = fn.indexOf("supabase.auth.updateUser(");
  assert.ok(parseAt > -1, "updatePassword must call passwordSchema().safeParse(password)");
  assert.ok(supabaseAt > -1, "updatePassword must still call supabase.auth.updateUser");
  assert.ok(parseAt < supabaseAt, "the schema must run before Supabase is touched");
  // Must NOT pass an email — none is in scope for this action.
  assert.ok(!fn.includes("passwordSchema({ email })"), "updatePassword has no email in scope");
});

test("updatePassword: keeps the confirm_password mismatch check", () => {
  const fn = functionBody("updatePassword");
  assert.match(fn, /if \(password !== confirmPassword\) return \{ error: t\("passwordMismatch"\) \};/);
});

test("updatePassword: calls isPasswordBreached after the schema succeeds and before Supabase", () => {
  const fn = functionBody("updatePassword");
  const parseAt = fn.indexOf("passwordSchema().safeParse(password)");
  const breachAt = fn.indexOf("isPasswordBreached(password)");
  const supabaseAt = fn.indexOf("supabase.auth.updateUser(");
  assert.ok(breachAt > -1, "updatePassword must call isPasswordBreached(password)");
  assert.ok(parseAt < breachAt);
  assert.ok(breachAt < supabaseAt);
});

test("updatePassword: rejects only on checked && breached, never on breached alone", () => {
  const fn = functionBody("updatePassword");
  assert.match(fn, /if \(checked && breached\) return \{ error: t\("passwordBreached"\) \};/);
});

// --- schema-before-breach-check guards against an absurdly long password ----

test("guard: an absurdly long password fails the schema before any breach lookup would run", () => {
  // The schema is what stands between an attacker-controlled FormData value
  // and isPasswordBreached; it must reject before that call is ever reached.
  const huge = "a".repeat(5000);
  assert.equal(ok(passwordSchema({ email: "x@example.com" }).safeParse(huge)), false);
  assert.equal(ok(passwordSchema().safeParse(huge)), false);
});

// --- breach-check decision predicate (functional) --------------------------

test("breach gate: a breached password trips the exact predicate actions.ts uses (checked && breached)", async () => {
  const password = "Ab1!Ab1!Ab1!correcthorsebatterystaple";
  const body = stubBodyFor(password, 37);
  const { breached, checked } = await isPasswordBreached(password, {
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }),
  });
  assert.equal(checked && breached, true, "a real, confirmed breach must trip the reject condition");
});

test("breach gate: a clean password does not trip the reject condition", async () => {
  const password = "Zx9!Qw8@Pl7#Mn6$";
  const body = stubBodyFor(password, 0); // present only as a zero-count padding entry
  const { breached, checked } = await isPasswordBreached(password, {
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }),
  });
  assert.equal(checked && breached, false);
});

test("breach gate: checked === false (HIBP unreachable) must proceed, never reject — the fail-open contract", async () => {
  const password = "Ab1!Ab1!Ab1!";
  const { breached, checked } = await isPasswordBreached(password, {
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(checked, false, "an unreachable HIBP must report checked: false");
  assert.equal(
    checked && breached,
    false,
    "checked: false must never be collapsed into breached: true — it means 'proceed'",
  );
});

// --- client/server boundary --------------------------------------------------

test("boundary: PasswordRequirements never imports the server-only breach module or node:crypto", () => {
  assert.ok(!requirements.includes("password-breach"));
  assert.ok(!requirements.includes("node:crypto"));
  assert.match(requirements, /^"use client";/);
});

test("boundary: PasswordRequirements only imports the browser-safe policy module", () => {
  assert.match(requirements, /from "@\/lib\/validation\/password"/);
  assert.match(requirements, /import \{ passwordRules \}/);
});

// --- release gate: the client checklist is UX only, never the authority -----

test("release gate: actions.ts still imports and calls passwordSchema — the client is not the sole enforcement point", () => {
  assert.match(actions, /passwordSchema/);
  const signUpFn = functionBody("signUp");
  const updateFn = functionBody("updatePassword");
  assert.match(signUpFn, /passwordSchema\(\{ email \}\)\.safeParse\(password\)/);
  assert.match(updateFn, /passwordSchema\(\)\.safeParse\(password\)/);
});

test("release gate: PasswordRequirements documents itself as a UX affordance only, and never decides acceptance", () => {
  assert.match(requirements, /UX AFFORDANCE ONLY/);
  assert.ok(!requirements.includes("createClient"));
  assert.ok(!requirements.includes("supabase"));
  assert.ok(!requirements.includes(".rpc("));
});

// --- client form wiring -------------------------------------------------

test("forms: minLength is 12 (PASSWORD_MIN_LENGTH), not the old 8, on every password input", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 12);
  assert.ok(!signupClient.includes("minLength={8}"));
  assert.ok(!resetClient.includes("minLength={8}"));
  assert.match(signupClient, /minLength=\{12\}/);
  const resetMinLengths = resetClient.match(/minLength=\{12\}/g) ?? [];
  assert.equal(resetMinLengths.length, 2, "both password and confirm_password must be minLength 12");
});

test("forms: both signup and reset-password wire PasswordRequirements as a controlled input", () => {
  assert.match(signupClient, /import \{ PasswordRequirements \} from "@\/components\/password-requirements"/);
  assert.match(signupClient, /<PasswordRequirements password=\{password\} email=\{email\} \/>/);
  assert.match(resetClient, /import \{ PasswordRequirements \} from "@\/components\/password-requirements"/);
  assert.match(resetClient, /<PasswordRequirements password=\{password\} \/>/);
});

// --- rule-id / i18n key wiring ------------------------------------------

test("i18n wiring: PasswordRequirements renders every rule id through auth.password.rules.<id>", () => {
  assert.match(requirements, /useTranslations\("auth\.password"\)/);
  assert.match(requirements, /t\(`rules\.\$\{id\}`\)/);
  assert.match(requirements, /t\("requirementsTitle"\)/);
});

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

test("i18n parity: en.json and ar.json have IDENTICAL key sets under auth.password (parsed JSON, not source text)", () => {
  assert.ok(en.auth?.password, "en.json is missing auth.password");
  assert.ok(ar.auth?.password, "ar.json is missing auth.password");
  const enKeys = collectKeys(en.auth.password).sort();
  const arKeys = collectKeys(ar.auth.password).sort();
  assert.deepEqual(
    arKeys,
    enKeys,
    "a missing (or extra) Arabic key under auth.password would ship as a raw key string to users",
  );
});

test("i18n parity: every passwordRules() id has a real, non-empty translation in both locales", () => {
  const ruleIds = passwordRules("placeholder").map((r) => r.id);
  assert.deepEqual(
    ruleIds.sort(),
    ["digit", "length", "lowercase", "notCommon", "notEmail", "symbol", "uppercase"],
  );
  for (const id of ruleIds) {
    for (const [locale, messages] of [["en", en], ["ar", ar]]) {
      const text = messages.auth.password.rules[id];
      assert.equal(typeof text, "string", `${locale} auth.password.rules.${id} must be a string`);
      assert.ok(text.trim().length > 0, `${locale} auth.password.rules.${id} must not be empty`);
    }
  }
});

test("i18n: auth.actions.passwordBreached exists with real copy in both locales (not English placeholder in ar.json)", () => {
  const enMsg = en.auth.actions.passwordBreached;
  const arMsg = ar.auth.actions.passwordBreached;
  assert.equal(typeof enMsg, "string");
  assert.ok(enMsg.trim().length > 0);
  assert.equal(typeof arMsg, "string");
  assert.ok(arMsg.trim().length > 0);
  // A genuinely Arabic string should not be composed only of ASCII characters.
  assert.ok(/[؀-ۿ]/.test(arMsg), "ar.json passwordBreached must contain real Arabic script");
});

test("i18n: auth.password.requirementsTitle and every rule contain real Arabic script in ar.json", () => {
  assert.ok(/[؀-ۿ]/.test(ar.auth.password.requirementsTitle));
  for (const id of Object.keys(ar.auth.password.rules)) {
    assert.ok(
      /[؀-ۿ]/.test(ar.auth.password.rules[id]),
      `ar.json auth.password.rules.${id} must contain real Arabic script`,
    );
  }
});
