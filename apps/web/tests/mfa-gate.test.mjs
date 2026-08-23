import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-10 (auth hardening) Task 7 — MFA challenge at login and AAL enforcement.
//
// `lib/mfa-gate.js` is the pure decision the middleware enforces. Everything
// below drives it with plain inputs and asserts the OUTPUT — no assertion in
// this file reads the source text of mfa-gate.js, because there is no excuse
// for a spelling-pin against a function that is already pure and callable.
//
// The reason this module was extracted at all is the last section: a redirect
// gate that sends a request to a page the gate also redirects away from is an
// infinite loop, and an infinite loop does NOT surface as a failing test
// unless somebody writes the test that looks for it. `simulate()` below is
// that test — it actually iterates the gate, feeding it its own answer, and
// fails if the sequence does not reach a fixed point.
//
// The static checks at the very bottom are a deliberate exception, confined to
// three release-gate properties that cannot be observed by calling anything
// under `node --test`: that middleware.ts DELEGATES to this module rather than
// reimplementing the rules inline, that /login/mfa is in its public-path
// allowlist, and that mfa-gate.js itself stays browser-safe (see the "release
// gate" test near the bottom — mfa-client.tsx, a "use client" component, now
// imports MFA_ENROLLMENT_PATH from this module, so it ships in the client
// bundle too, same as lib/validation/password.js does). Those are structural
// facts about files that import next/server or ship in a browser bundle.

import {
  challengePageMode,
  MFA_CHALLENGE_PATH,
  MFA_ENROLLMENT_PATH,
  mfaRedirectFor,
  safeReturnPath,
} from "../src/lib/mfa-gate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, "../src");

function readSrc(relativeToWebSrc) {
  return readFileSync(path.join(webSrc, relativeToWebSrc), "utf8");
}

/**
 * A caller-friendly wrapper: every field is explicit at each call site in the
 * truth table below, so a test never silently depends on a default.
 */
function decide({ currentLevel, nextLevel, isSuperAdmin, hasVerifiedFactor, path: p }) {
  return mfaRedirectFor({ currentLevel, nextLevel, isSuperAdmin, hasVerifiedFactor, path: p });
}

// Convenience states. `aal1WithFactor` is the session that just passed a
// password check and owns a verified factor it has not used yet.
const noFactor = { currentLevel: "aal1", nextLevel: "aal1", hasVerifiedFactor: false };
const aal1WithFactor = { currentLevel: "aal1", nextLevel: "aal2", hasVerifiedFactor: true };
const aal2 = { currentLevel: "aal2", nextLevel: "aal2", hasVerifiedFactor: true };

// --- rule 2: any session at aal1 that could be aal2 must challenge ---------

test("a session with a verified factor it has not used is sent to the challenge", () => {
  for (const p of ["/", "/vehicles", "/jobs/123", "/portal", "/settings/business"]) {
    assert.equal(
      decide({ ...aal1WithFactor, isSuperAdmin: false, path: p }),
      MFA_CHALLENGE_PATH,
      `expected ${p} to be gated for an aal1 session holding a verified factor`,
    );
  }
});

test("a session already at aal2 is never redirected", () => {
  for (const p of ["/", "/admin", "/admin/tenants", "/settings/security", "/login/mfa"]) {
    for (const isSuperAdmin of [false, true]) {
      assert.equal(decide({ ...aal2, isSuperAdmin, path: p }), null);
    }
  }
});

test("a session with no verified factor is not challenged outside /admin", () => {
  for (const p of ["/", "/vehicles", "/portal", "/settings/security", "/onboarding"]) {
    assert.equal(decide({ ...noFactor, isSuperAdmin: false, path: p }), null);
  }
});

test("an UNVERIFIED enrollment does not satisfy the gate and does not trigger a challenge", () => {
  // What an abandoned enrollment looks like: a factor row exists, but the SDK
  // reports nextLevel "aal1" because it counts verified factors only. Nothing
  // about this state may be read as "has MFA".
  const abandoned = {
    currentLevel: "aal1",
    nextLevel: "aal1",
    hasVerifiedFactor: false,
    isSuperAdmin: false,
  };
  assert.equal(decide({ ...abandoned, path: "/" }), null);
  // ...and for an admin it routes to ENROLLMENT, not to a challenge the user
  // could not possibly pass.
  assert.equal(
    decide({ ...abandoned, isSuperAdmin: true, path: "/admin" }),
    MFA_ENROLLMENT_PATH,
  );
});

// --- rules 3 and 4: platform admins, scoped to /admin ---------------------

test("a platform admin with no factor is sent to ENROLL under /admin, never locked out", () => {
  for (const p of ["/admin", "/admin/tenants", "/admin/users/42"]) {
    assert.equal(
      decide({ ...noFactor, isSuperAdmin: true, path: p }),
      MFA_ENROLLMENT_PATH,
      `expected ${p} to route a factorless admin to enrollment`,
    );
  }
});

test("the factorless-admin rule is scoped to /admin and does not fire elsewhere", () => {
  // The 2026-08-22 amendment. Firing globally would convert an enrollment
  // failure (e.g. TOTP disabled on the hosted project) into a total lockout;
  // scoped, the same misconfiguration costs an admin only the admin area.
  for (const p of ["/", "/vehicles", "/settings/business", "/portal", "/onboarding"]) {
    assert.equal(
      decide({ ...noFactor, isSuperAdmin: true, path: p }),
      null,
      `expected ${p} to stay reachable for an admin who has not enrolled yet`,
    );
  }
});

test("'/administration' is not treated as being under '/admin'", () => {
  assert.equal(decide({ ...noFactor, isSuperAdmin: true, path: "/administration" }), null);
  assert.equal(decide({ ...noFactor, isSuperAdmin: true, path: "/adminx/y" }), null);
});

test("a platform admin who has a factor but is only at aal1 must challenge for /admin", () => {
  assert.equal(
    decide({
      currentLevel: "aal1",
      nextLevel: "aal2",
      hasVerifiedFactor: true,
      isSuperAdmin: true,
      path: "/admin",
    }),
    MFA_CHALLENGE_PATH,
  );
});

test("an admin whose AAL is unreadable still cannot reach /admin with a factor present", () => {
  // currentLevel absent (not "aal2") with a verified factor: rule 4 catches it
  // even though rule 2's aal1/aal2 pattern does not match.
  assert.equal(
    decide({
      currentLevel: null,
      nextLevel: null,
      hasVerifiedFactor: true,
      isSuperAdmin: true,
      path: "/admin/tenants",
    }),
    MFA_CHALLENGE_PATH,
  );
});

test("a non-admin is never subject to the admin rules, even on an /admin path", () => {
  // Non-admins hitting /admin are handled by requireSuperAdmin in the app,
  // not by this gate — it must not manufacture an MFA reason to redirect them.
  assert.equal(decide({ ...noFactor, isSuperAdmin: false, path: "/admin" }), null);
});

// --- loop prevention ------------------------------------------------------

test("the challenge page never redirects to itself", () => {
  for (const isSuperAdmin of [false, true]) {
    assert.equal(decide({ ...aal1WithFactor, isSuperAdmin, path: MFA_CHALLENGE_PATH }), null);
  }
});

test("the enrollment page never redirects to itself", () => {
  assert.equal(
    decide({ ...noFactor, isSuperAdmin: true, path: MFA_ENROLLMENT_PATH }),
    null,
  );
});

test("descendants of a redirect target are not redirected to their own ancestor", () => {
  assert.equal(
    decide({ ...aal1WithFactor, isSuperAdmin: false, path: `${MFA_CHALLENGE_PATH}/step-2` }),
    null,
  );
});

test("Supabase auth callback routes are never gated", () => {
  for (const p of ["/auth", "/auth/callback", "/auth/confirm?token=x".split("?")[0]]) {
    assert.equal(decide({ ...aal1WithFactor, isSuperAdmin: true, path: p }), null);
    assert.equal(decide({ ...noFactor, isSuperAdmin: true, path: p }), null);
  }
});

/**
 * Follows the gate the way a browser follows redirects: take the answer, make
 * it the new path, ask again. A correct gate reaches null (a page renders)
 * within a couple of hops. A looping gate never does — and would exhaust
 * `limit` here instead of hanging a real request forever.
 *
 * @returns {{ hops: string[], settled: boolean }}
 */
function simulate(state, startPath, limit = 12) {
  const hops = [startPath];
  let current = startPath;
  for (let i = 0; i < limit; i += 1) {
    const next = mfaRedirectFor({ ...state, path: current });
    if (next === null) return { hops, settled: true };
    if (hops.includes(next)) {
      hops.push(next);
      return { hops, settled: false };
    }
    hops.push(next);
    current = next;
  }
  return { hops, settled: false };
}

test("following the gate's own answer always terminates, for every state and entry point", () => {
  const states = [
    { ...noFactor, isSuperAdmin: false },
    { ...noFactor, isSuperAdmin: true },
    { ...aal1WithFactor, isSuperAdmin: false },
    { ...aal1WithFactor, isSuperAdmin: true },
    { ...aal2, isSuperAdmin: false },
    { ...aal2, isSuperAdmin: true },
    // Inconsistent/unreadable AAL shapes the SDK should never produce, but
    // which must still not be able to build a loop.
    { currentLevel: null, nextLevel: null, hasVerifiedFactor: false, isSuperAdmin: true },
    { currentLevel: null, nextLevel: "aal2", hasVerifiedFactor: true, isSuperAdmin: true },
    { currentLevel: "aal1", nextLevel: "aal2", hasVerifiedFactor: false, isSuperAdmin: true },
    { currentLevel: "aal2", nextLevel: "aal2", hasVerifiedFactor: false, isSuperAdmin: true },
  ];
  const entryPoints = [
    "/",
    "/admin",
    "/admin/tenants",
    "/vehicles",
    "/portal",
    "/onboarding",
    "/reset-password",
    "/auth/callback",
    MFA_CHALLENGE_PATH,
    MFA_ENROLLMENT_PATH,
  ];

  for (const state of states) {
    for (const entry of entryPoints) {
      const { hops, settled } = simulate(state, entry);
      assert.ok(
        settled,
        `redirect loop from ${entry} with ${JSON.stringify(state)}: ${hops.join(" -> ")}`,
      );
      // A terminating gate should also be a SHORT one: at most one redirect
      // before a page renders. More than that means a target is itself gated.
      assert.ok(
        hops.length <= 2,
        `too many hops from ${entry}: ${hops.join(" -> ")}`,
      );
    }
  }
});

test("a factorless admin sent to enrollment is not then bounced back to /admin", () => {
  // The exact ping-pong the /admin scoping is meant to avoid: having arrived
  // at the enrollment page, the very next evaluation must be null.
  const state = { ...noFactor, isSuperAdmin: true };
  const first = mfaRedirectFor({ ...state, path: "/admin" });
  assert.equal(first, MFA_ENROLLMENT_PATH);
  assert.equal(mfaRedirectFor({ ...state, path: first }), null);
});

test("a malformed or non-absolute path is never redirected", () => {
  for (const p of ["", "admin", "https://evil.example/admin", null, undefined, 42]) {
    assert.equal(decide({ ...aal1WithFactor, isSuperAdmin: true, path: p }), null);
  }
});

// --- safeReturnPath: the ?next= value round-trips through the browser ------

test("safeReturnPath keeps ordinary internal paths", () => {
  for (const p of ["/", "/admin", "/admin/tenants", "/settings/business", "/jobs/abc-123"]) {
    assert.equal(safeReturnPath(p), p);
  }
});

test("safeReturnPath refuses anything that could leave the site", () => {
  for (const hostile of [
    "//evil.example",
    "//evil.example/admin",
    "https://evil.example",
    "http:/evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/admin?next=//evil.example",
    "/admin#@evil.example",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(
      safeReturnPath(hostile),
      "/",
      `expected ${JSON.stringify(hostile)} to be rejected`,
    );
  }
});

test("safeReturnPath never returns the challenge page itself", () => {
  // Otherwise a successful verification would land the user right back on the
  // page they just completed.
  assert.equal(safeReturnPath(MFA_CHALLENGE_PATH), "/");
  assert.equal(safeReturnPath(`${MFA_CHALLENGE_PATH}/anything`), "/");
});

// --- i18n: auth.mfa key parity + real Arabic copy --------------------------
//
// Same convention as password-enforcement.test.mjs and mfa-enrollment.test.mjs:
// these run against the PARSED JSON, so they describe the data that ships
// rather than how the file happens to be spelled. A key present in en.json and
// absent from ar.json renders the raw key path to Arabic users.

const en = JSON.parse(readSrc("messages/en.json"));
const ar = JSON.parse(readSrc("messages/ar.json"));

function collectKeys(node, prefix = "") {
  return Object.entries(node).flatMap(([k, v]) =>
    v && typeof v === "object" ? collectKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const ARABIC_SCRIPT = /[؀-ۿ]/;
const at = (node, key) => key.split(".").reduce((n, k) => n[k], node);

test("i18n parity: en.json and ar.json have IDENTICAL key sets under auth.mfa", () => {
  assert.ok(en.auth?.mfa, "en.json is missing auth.mfa");
  assert.ok(ar.auth?.mfa, "ar.json is missing auth.mfa");
  assert.deepEqual(collectKeys(ar.auth.mfa).sort(), collectKeys(en.auth.mfa).sort());
});

test("i18n: every auth.mfa string is non-empty in en and real Arabic in ar", () => {
  for (const key of collectKeys(en.auth.mfa)) {
    assert.ok(at(en.auth.mfa, key).trim().length > 0, `en auth.mfa.${key} is empty`);
    assert.ok(
      ARABIC_SCRIPT.test(at(ar.auth.mfa, key)),
      `ar auth.mfa.${key} must be real Arabic, not an English placeholder`,
    );
  }
});

test("i18n: both gate pages carry their own localized metadata", () => {
  // /login/mfa, and the moved /settings/security page — which lost the title
  // it used to inherit from the (dashboard) layout.
  for (const key of ["mfaTitle", "mfaDescription", "securityTitle", "securityDescription"]) {
    assert.ok(en.metadata?.[key]?.trim(), `en.json metadata.${key} is missing or empty`);
    assert.ok(
      ARABIC_SCRIPT.test(ar.metadata?.[key] ?? ""),
      `ar.json metadata.${key} must be real Arabic`,
    );
  }
});

// --- the challenge page's three states, and why they cannot be collapsed ---
//
// Review round 2 finding. The page reaches an EMPTY factor list from two very
// different situations, and treating them as one shipped a link that bounced
// the user back to the page they were trying to leave:
//
//   (a) the AAL read failed, or genuinely reports no second factor;
//   (b) the AAL read succeeded and says a verified factor EXISTS, but
//       `listFactors()` — a live network call, unlike the AAL read's local JWT
//       decode — failed on its own.
//
// The first test below is the one that makes (b) dangerous, and it is stated
// against the real gate rather than described in a comment.

test("/settings/security is NOT a safe destination once a verified factor exists", () => {
  // Exactly why the enrollment link must not be offered in state (b):
  // following it returns the user straight to the challenge page.
  assert.equal(
    mfaRedirectFor({
      currentLevel: "aal1",
      nextLevel: "aal2",
      isSuperAdmin: false,
      hasVerifiedFactor: true,
      path: MFA_ENROLLMENT_PATH,
    }),
    MFA_CHALLENGE_PATH,
  );
});

test("/settings/security IS reachable when no verified factor exists", () => {
  // ...and equally why the link is correct in state (a).
  for (const isSuperAdmin of [false, true]) {
    assert.equal(
      mfaRedirectFor({
        currentLevel: "aal1",
        nextLevel: "aal1",
        isSuperAdmin,
        hasVerifiedFactor: false,
        path: MFA_ENROLLMENT_PATH,
      }),
      null,
    );
  }
});

test("challengePageMode: a listed factor means challenge", () => {
  for (const hasVerifiedFactor of [true, false]) {
    for (const listedFactorCount of [1, 3]) {
      assert.equal(
        challengePageMode({ hasVerifiedFactor, listedFactorCount }),
        "challenge",
      );
    }
  }
});

test("challengePageMode: empty list + a factor known to exist is a TRANSIENT error, not enrollment", () => {
  // State (b). Offering enrollment here is wrong as copy and broken as a link.
  assert.equal(
    challengePageMode({ hasVerifiedFactor: true, listedFactorCount: 0 }),
    "unavailable",
  );
});

test("challengePageMode: empty list with no known factor offers enrollment", () => {
  // State (a) — including the unreadable-AAL case, which must arrive as false.
  assert.equal(
    challengePageMode({ hasVerifiedFactor: false, listedFactorCount: 0 }),
    "enroll",
  );
});

test("challengePageMode never offers enrollment from a state where the gate would bounce it", () => {
  // The cross-cutting invariant, tied back to the gate itself rather than
  // asserted independently: whenever the page would show the enrollment link,
  // the enrollment path must actually be reachable from that same state.
  for (const hasVerifiedFactor of [true, false]) {
    for (const listedFactorCount of [0, 1, 2]) {
      const mode = challengePageMode({ hasVerifiedFactor, listedFactorCount });
      if (mode !== "enroll") continue;
      const bounce = mfaRedirectFor({
        currentLevel: "aal1",
        nextLevel: hasVerifiedFactor ? "aal2" : "aal1",
        isSuperAdmin: false,
        hasVerifiedFactor,
        path: MFA_ENROLLMENT_PATH,
      });
      assert.equal(
        bounce,
        null,
        `mode "enroll" offered from a state where ${MFA_ENROLLMENT_PATH} redirects to ${bounce}`,
      );
    }
  }
});

test("every challengePageMode result has description copy in both locales", () => {
  // A mode with no matching message key renders a raw key path to the user.
  const modes = new Set();
  for (const hasVerifiedFactor of [true, false]) {
    for (const listedFactorCount of [0, 1]) {
      modes.add(challengePageMode({ hasVerifiedFactor, listedFactorCount }));
    }
  }
  assert.deepEqual([...modes].sort(), ["challenge", "enroll", "unavailable"]);

  const descriptionKey = {
    challenge: "description",
    unavailable: "unavailableDescription",
    enroll: "noFactorDescription",
  };
  for (const mode of modes) {
    for (const [name, bundle] of [
      ["en", en],
      ["ar", ar],
    ]) {
      const value = bundle.auth.mfa[descriptionKey[mode]];
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${name}.json is missing auth.mfa.${descriptionKey[mode]} for mode "${mode}"`,
      );
    }
  }
  // The transient state needs its own retry affordance in both locales.
  for (const [name, bundle] of [
    ["en", en],
    ["ar", ar],
  ]) {
    assert.ok(bundle.auth.mfa.retry?.trim(), `${name}.json is missing auth.mfa.retry`);
  }
});

// --- release gate: middleware must delegate, not reimplement ---------------

const middlewareSrc = readSrc("lib/supabase/middleware.ts");

test("middleware delegates the decision to mfaRedirectFor", () => {
  assert.match(
    middlewareSrc,
    /from "@\/lib\/mfa-gate"/,
    "middleware.ts no longer imports the gate module",
  );
  assert.match(
    middlewareSrc,
    /mfaRedirectFor\(/,
    "middleware.ts no longer calls mfaRedirectFor",
  );
});

test("middleware does not reimplement the AAL rules inline", () => {
  // If these string literals appear in middleware.ts, the decision has been
  // (re)written there and the tests above no longer describe what ships.
  const withoutGateCall = middlewareSrc.replace(/mfaRedirectFor\([\s\S]*?\n  \}\);/, "");
  assert.doesNotMatch(
    withoutGateCall,
    /currentLevel === "aal1"/,
    "the aal1/aal2 decision appears to have been inlined into middleware.ts",
  );
});

test("middleware does not import isSuperAdmin from lib/auth", () => {
  // lib/auth.ts builds its client via lib/supabase/server.ts, which calls
  // cookies() from next/headers — unavailable in middleware.
  assert.doesNotMatch(middlewareSrc, /isSuperAdmin.*from "@\/lib\/auth"/);
  assert.match(
    middlewareSrc,
    /from\("platform_admins"\)/,
    "middleware.ts should query platform_admins with its own local client",
  );
});

test("the platform_admins lookup stays off the non-admin hot path", () => {
  // The lookup costs a database round trip; both rules that need it are scoped
  // to /admin, so a plain dashboard navigation must not pay for it.
  const lookupIndex = middlewareSrc.indexOf('from("platform_admins")');
  assert.ok(lookupIndex > 0);
  const preceding = middlewareSrc.slice(0, lookupIndex);
  assert.match(
    preceding.slice(-400),
    /startsWith\("\/admin\/"\)/,
    "the platform_admins query is not guarded by an /admin path check",
  );
});

test("/login/mfa is in the middleware public-path allowlist", () => {
  // Without this, an AAL1 session redirected to the challenge page would be
  // redirected straight back to /login by the unauthenticated-user rule.
  const allowlist = middlewareSrc.slice(
    middlewareSrc.indexOf("function isPublicPath"),
    middlewareSrc.indexOf("function isPublicPath") + 700,
  );
  assert.ok(
    allowlist.includes("MFA_CHALLENGE_PATH") || allowlist.includes("/login/mfa"),
    "isPublicPath does not allow the MFA challenge path",
  );
});

// --- release gate: mfa-gate.js itself must stay browser-safe ---------------
//
// mfa-client.tsx (a "use client" component) imports MFA_ENROLLMENT_PATH from
// this module, so mfa-gate.js ships in the client bundle, not just the
// middleware/server bundle. It has always been dependency-free in practice,
// but nothing enforced that as a release gate the way
// tests/password-policy.test.mjs does for lib/validation/password.js — this
// is that gate's equivalent for mfa-gate.js. Uses the same widened
// next[/-] pattern for the same reason (a bare "next/" check would miss a
// future "next-intl" import).
const NEXT_PACKAGE_IMPORT_RE = /from\s+["']next[/-]/;
const mfaGateSrc = readSrc("lib/mfa-gate.js");

test("release gate: mfa-gate.js has no Node-only or browser-unsafe dependency", () => {
  assert.ok(!mfaGateSrc.includes("localStorage"), "must not touch localStorage");
  assert.ok(!mfaGateSrc.includes("sessionStorage"), "must not touch sessionStorage");
  assert.ok(!/\bfetch\s*\(/.test(mfaGateSrc), "must not make a network call");
  assert.ok(!mfaGateSrc.includes("XMLHttpRequest"), "must not make a network call");
  assert.ok(!/\bBuffer\s*\.\s*\w+\s*\(/.test(mfaGateSrc), "must not call a Buffer method");
  assert.ok(!/\bnew\s+Buffer\s*\(/.test(mfaGateSrc), "must not construct a Buffer");
  assert.ok(!/from\s+["']node:/.test(mfaGateSrc), "must not import a node: builtin");
  assert.ok(!/from\s+["']buffer["']/.test(mfaGateSrc), "must not import the buffer module");
  assert.ok(!/require\(/.test(mfaGateSrc), "must not use require()");
  assert.ok(!NEXT_PACKAGE_IMPORT_RE.test(mfaGateSrc), "must not import next/* or next-* (e.g. next-intl)");
  assert.ok(!mfaGateSrc.includes("process.env"), "must not read server-only env vars");
});
