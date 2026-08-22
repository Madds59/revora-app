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
 * FAILS CLOSED: any RPC-level error (network, permission, unexpected scope,
 * anything) denies the attempt rather than silently disabling the limiter. A
 * broken limiter must never quietly turn into no limiter at all. This is the
 * OPPOSITE contract from `lib/password-breach.js`, which fails OPEN by
 * deliberate design — do not "fix" this to match that one, and do not "fix"
 * that one to match this.
 *
 * Only a stable error code is ever logged — never `error.message`, which
 * could echo back scope/identifier-derived SQL text.
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  identifier: string,
): Promise<boolean> {
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
