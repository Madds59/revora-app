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
// two release-gate properties that cannot be observed by calling anything
// under `node --test`: that middleware.ts DELEGATES to this module rather than
// reimplementing the rules inline, and that /login/mfa is in its public-path
// allowlist. Those are structural facts about a file that imports next/server.

import {
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
