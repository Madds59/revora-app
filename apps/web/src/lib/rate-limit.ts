import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The full scope allowlist recognized by `consume_rate_limit()`
 * (supabase/migrations/0031_auth_rate_limits.sql). The limits and windows
 * live inside that SECURITY DEFINER function, never here — this union exists
 * only so a typo'd scope name is caught at compile time instead of raising at
 * the database. Passing anything outside this list makes the RPC raise,
 * which `checkRateLimit` below treats as a normal RPC error (fail closed).
 */
export type RateLimitScope =
  | "login_ip"
  | "login_email"
  | "password_reset_ip"
  | "password_reset_email"
  | "signup_ip"
  | "magic_link_email";

/**
 * Consume one attempt from a single rate-limit bucket via the
 * SECURITY DEFINER `consume_rate_limit` RPC.
 *
 * CALLED THROUGH THE SERVICE-ROLE CLIENT ON PURPOSE — never the
 * request-scoped client from `lib/supabase/server.ts`. EXECUTE on this
 * function is granted only to `service_role` and explicitly revoked from
 * `public`/`anon`/`authenticated` (see the migration's own comments): if
 * `anon` could call it, the RPC would be directly reachable at
 * `POST /rest/v1/rpc/consume_rate_limit` with the public anon key, letting
 * anyone who knows a victim's email burn that victim's `login_email` bucket
 * in 8 requests and lock them out for 15 minutes — a targeted account-lockout
 * weapon. Using the request-scoped client here would fail with
 * `42501 permission denied`; that failure is not a bug to route around by
 * granting anything in SQL, it's the intended boundary.
 *
 * FAILS CLOSED: ANY failure here denies the attempt rather than silently
 * disabling the limiter — a broken limiter must never quietly turn into no
 * limiter at all. This is the OPPOSITE contract from `lib/password-breach.js`,
 * which fails OPEN by deliberate design — do not "fix" this to match that
 * one, and do not "fix" that one to match this.
 *
 * The whole body is wrapped in try/catch, not just the RPC call: this is
 * deliberate, because `createAdminClient()` itself throws synchronously if
 * `SUPABASE_SERVICE_ROLE_KEY` is unset (see `lib/supabase/admin.ts`), and an
 * uncaught throw there would previously have escaped this function entirely
 * — bypassing the curated `tooManyAttempts` message, surfacing a raw
 * unhandled-action failure (and, in dev, the raw env-var error text) to the
 * user instead. Catching it here means EVERY failure mode — RPC error,
 * client construction, network — funnels through the same fail-closed path
 * with the same stable logged code.
 *
 * Only a stable error code is ever logged — never `error.message`/a caught
 * error's `.message`, which could echo back scope/identifier-derived SQL
 * text or environment details.
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  identifier: string,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      scope,
      identifier,
    });

    if (error) {
      console.error("rate_limit_rpc_error", scope, error.code ?? "unknown");
      return false;
    }

    return data === true;
  } catch {
    // Covers createAdminClient() throwing (missing service-role key) and any
    // other unexpected throw from the client/network layer. Deliberately no
    // caught-error detail is logged — only this stable code — since the
    // thrown value here could be an env-var error message or other
    // unstructured text we don't want in logs.
    console.error("rate_limit_client_error", scope);
    return false;
  }
}

/**
 * Enforce rate limiting across every bucket a single auth action depends on
 * (e.g. an IP bucket AND an identifier bucket for the same call — dual-key
 * on purpose: an identifier-only bucket lets an attacker lock a victim out by
 * spamming failed attempts against their email from anywhere, and an
 * IP-only bucket is beaten by distributing attempts across IPs).
 *
 * Every listed scope is consumed, even after an earlier one has already
 * denied the attempt — this does NOT short-circuit. That keeps the
 * "which buckets did this call consume" contract simple and total (every
 * scope passed in is always attempted exactly once), and avoids a request
 * that touches N buckets partially draining only some of them depending on
 * scope order.
 *
 * TRADEOFF, stated honestly rather than dismissed: not short-circuiting has
 * a real cost. An attacker whose OWN `login_ip` bucket is already exhausted
 * can keep issuing requests against arbitrary victims' `login_email` (etc.)
 * buckets at zero marginal benefit to themselves but real cost to the
 * victim — short-circuiting on the IP denial would force them to rotate IPs
 * to keep draining a victim's email bucket; not short-circuiting doesn't.
 * This is a deliberate, accepted tradeoff, not an oversight: the likelier
 * real-world effect of not short-circuiting is a legitimate NAT/shared-IP
 * user burning their OWN email bucket alongside their IP bucket on repeated
 * failed logins, and every email bucket is already capped at a small number
 * of attempts (8 for `login_email`) regardless of what the paired IP bucket
 * is doing — so the attack this tradeoff enables doesn't get an attacker
 * more attempts against a given email than they'd already have without it,
 * it just removes the extra friction of having to rotate IPs to use them.
 *
 * IMPORTANT: each `[scope, identifier]` pair below results in its own
 * `checkRateLimit` call, i.e. its own PostgREST request and therefore its own
 * Postgres transaction. Never rewrite this to batch multiple scopes into one
 * RPC call/transaction — Postgres `now()` is `transaction_timestamp()`, so
 * calls sharing a transaction would share a frozen clock and mis-evaluate
 * window roll-over.
 *
 * Returns `true` only when every scope allowed the attempt.
 */
export async function enforceAuthRateLimit({
  scopes,
}: {
  scopes: Array<[RateLimitScope, string]>;
}): Promise<boolean> {
  let allowed = true;
  for (const [scope, identifier] of scopes) {
    const result = await checkRateLimit(scope, identifier);
    if (!result) allowed = false;
  }
  return allowed;
}
