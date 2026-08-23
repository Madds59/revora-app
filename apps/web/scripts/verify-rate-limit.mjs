// Verification for the auth rate-limit store (public.consume_rate_limit /
// public.auth_rate_limits) against a LOCAL Supabase stack ONLY. This is NOT
// part of `pnpm test` / CI — it needs a running local stack and mutates rows
// directly with the service-role key to simulate window roll-over. Run it
// manually from apps/web, with the local stack up (`supabase start` from the
// repo root):
//
//   node scripts/verify-rate-limit.mjs
//
// consume_rate_limit is service_role-only (see 0031_auth_rate_limits.sql —
// anon/authenticated were deliberately dropped from its grants: Task 5 calls
// it from Next.js Server Actions via the service-role client at
// apps/web/src/lib/supabase/admin.ts, never from the browser). So every
// consume_rate_limit call in this script goes through the admin
// (service-role) client, mirroring that real caller — not the anon client.
//
// This script refuses to run against anything but 127.0.0.1/localhost: it
// resolves the target host from the environment (falling back to
// .env.local, same as apps/web/scripts/grant-super-admin.mjs), and a
// developer whose .env.local happens to point at a hosted project must not
// have this script silently backdate rate-limit rows in production. Set
// ALLOW_NONLOCAL_RATE_LIMIT_VERIFY=1 to override, deliberately.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) — defaults to
//     http://127.0.0.1:54321, the standard local Supabase API port.
//   SUPABASE_ANON_KEY — defaults to the well-known local demo anon key
//     (same one apps/web/scripts/e2e.mjs uses). Used only for the "anon is
//     denied" checks — never to call consume_rate_limit.
//   SUPABASE_SERVICE_ROLE_KEY — required. Used to call consume_rate_limit
//     (the real caller identity per Task 5), to read/backdate rows directly
//     for assertions, and to open a direct Postgres connection (below) for
//     pg_catalog introspection that PostgREST doesn't expose.
//   SUPABASE_DB_URL — direct Postgres connection string, for the two
//     pg_catalog checks (relrowsecurity, pg_policies) that have no REST
//     surface. Defaults to the standard local Supabase Postgres URL
//     (postgres:postgres@127.0.0.1:54322), a well-known local-dev-only
//     credential, not a secret.
//   ALLOW_NONLOCAL_RATE_LIMIT_VERIFY=1 — required to target a non-local host.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

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
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL =
  process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ALLOW_NONLOCAL = process.env.ALLOW_NONLOCAL_RATE_LIMIT_VERIFY === "1";

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
      "This script backdates auth_rate_limits rows directly with the",
      "service-role key — pointing it at a hosted project would silently",
      "corrupt production rate-limit state.",
      "",
      "If this is genuinely intentional, set ALLOW_NONLOCAL_RATE_LIMIT_VERIFY=1",
      "and re-run. Otherwise point NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL /",
      "SUPABASE_DB_URL at your local stack (http://127.0.0.1:54321).",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
assertLocal(SUPABASE_URL, "the Supabase API URL");
assertLocal(DB_URL, "the Postgres connection URL (SUPABASE_DB_URL)");

if (!SERVICE_KEY) {
  console.error(
    [
      "SUPABASE_SERVICE_ROLE_KEY is required (the local stack's service_role key).",
      "consume_rate_limit is service_role-only, so this script calls it as the",
      "admin client — the same way Task 5's Server Actions do — and also uses",
      "it to read/backdate auth_rate_limits rows directly for assertions.",
      "",
      "Export it (or add it to apps/web/.env.local), then re-run:",
      "  node scripts/verify-rate-limit.mjs",
    ].join("\n"),
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(label) {
  passed++;
  console.log(`  PASS  ${label}`);
}
function bad(label, detail) {
  failed++;
  console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

// Mirrors the RPC's own hashing exactly: scope || ':' || digest(lower(identifier), 'sha256')
function bucketKeyFor(scope, identifier) {
  const hash = createHash("sha256").update(identifier.toLowerCase()).digest("hex");
  return `${scope}:${hash}`;
}

const anon = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new pg.Client({ connectionString: DB_URL });

async function readRow(bucketKey) {
  const { data, error } = await admin
    .from("auth_rate_limits")
    .select("bucket_key, window_start, attempt_count")
    .eq("bucket_key", bucketKey)
    .maybeSingle();
  if (error) throw new Error(`admin read of auth_rate_limits failed: ${error.message}`);
  return data;
}

async function backdateWindow(bucketKey, secondsAgo) {
  const past = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const { error } = await admin
    .from("auth_rate_limits")
    .update({ window_start: past })
    .eq("bucket_key", bucketKey);
  if (error) throw new Error(`admin backdate of auth_rate_limits failed: ${error.message}`);
}

// The real caller identity per Task 5: consume_rate_limit is service_role-only.
async function consume(scope, identifier) {
  const { data, error } = await admin.rpc("consume_rate_limit", { scope, identifier });
  if (error) throw new Error(`consume_rate_limit(${scope}) failed: ${error.message}`);
  return data;
}

const stamp = Date.now();
console.log("\n== auth_rate_limits / consume_rate_limit verification (live local DB) ==\n");

try {
  await db.connect();

  // 1. Nth call flips to false. magic_link_email allows 5 attempts / hour.
  {
    const identifier = `verify-nth-${stamp}@example.com`;
    let lastResult = null;
    for (let i = 1; i <= 5; i++) {
      lastResult = await consume("magic_link_email", identifier);
    }
    assert(lastResult === true, "magic_link_email: 5th call within limit returns true", `got ${lastResult}`);
    const sixth = await consume("magic_link_email", identifier);
    assert(sixth === false, "magic_link_email: 6th call (over limit) flips to false", `got ${sixth}`);
  }

  // 2. Window roll-over. password_reset_email allows 5 attempts / 3600s.
  {
    const identifier = `verify-rollover-${stamp}@example.com`;
    const bucketKey = bucketKeyFor("password_reset_email", identifier);
    for (let i = 1; i <= 5; i++) {
      await consume("password_reset_email", identifier);
    }
    const exhausted = await consume("password_reset_email", identifier);
    assert(exhausted === false, "password_reset_email: exhausted before roll-over", `got ${exhausted}`);

    await backdateWindow(bucketKey, 3600 + 10); // older than the 3600s window
    const afterRollover = await consume("password_reset_email", identifier);
    assert(
      afterRollover === true,
      "password_reset_email: allowed again after window roll-over",
      `got ${afterRollover}`,
    );
    const row = await readRow(bucketKey);
    assert(
      row?.attempt_count === 1,
      "password_reset_email: attempt_count reset to 1 on roll-over",
      `count=${row?.attempt_count}`,
    );
  }

  // 3. Different scopes with different identifiers don't share a bucket.
  // Assert BOTH sides: a bug that dropped writes entirely (e.g. an upsert
  // that never incremented) could still pass if only rowB were checked.
  {
    const idA = `verify-scope-a-${stamp}`;
    const idB = `verify-scope-b-${stamp}`;
    for (let i = 1; i <= 3; i++) await consume("login_ip", idA);
    await consume("signup_ip", idB);
    const rowA = await readRow(bucketKeyFor("login_ip", idA));
    const rowB = await readRow(bucketKeyFor("signup_ip", idB));
    assert(rowA?.attempt_count === 3, "login_ip bucket accumulated its own 3 calls", `count=${rowA?.attempt_count}`);
    assert(
      rowB?.attempt_count === 1,
      "different scopes/identifiers land in separate buckets",
      `count=${rowB?.attempt_count}`,
    );
  }

  // 4. The same identifier used in a different scope stays independent.
  // Use the full stamp (not a truncated/modulo value) so this never
  // collides with another run's identifier inside the same time window.
  {
    const sharedIdentifier = `verify-shared-${stamp}`;
    for (let i = 1; i <= 4; i++) await consume("login_ip", sharedIdentifier);
    const first = await consume("signup_ip", sharedIdentifier);
    assert(first === true, "same identifier in a different scope starts fresh (allowed)", `got ${first}`);
    const row = await readRow(bucketKeyFor("signup_ip", sharedIdentifier));
    assert(
      row?.attempt_count === 1,
      "same identifier in a different scope has an independent count",
      `count=${row?.attempt_count}`,
    );
  }

  // 5. auth_rate_limits is unreachable directly, via BOTH mechanisms the
  // migration's comments claim: the explicit revoke (anon gets a specific
  // permission-denied error code, not just "any error") and RLS-with-no-
  // policies (checked directly against pg_catalog, since a schema-cache
  // miss or transport hiccup must not read as a false PASS here).
  {
    const { data, error } = await anon.from("auth_rate_limits").select("bucket_key").limit(1);
    assert(
      error?.code === "42501",
      "anon SELECT on auth_rate_limits is denied with permission-denied (42501)",
      error ? `got code=${error.code} message=${error.message}` : `unexpectedly succeeded: ${JSON.stringify(data)}`,
    );

    const rls = await db.query(
      "select relrowsecurity from pg_class where oid = 'public.auth_rate_limits'::regclass",
    );
    assert(
      rls.rows[0]?.relrowsecurity === true,
      "auth_rate_limits has row level security enabled",
      `relrowsecurity=${rls.rows[0]?.relrowsecurity}`,
    );

    const policies = await db.query(
      "select policyname from pg_policies where schemaname = 'public' and tablename = 'auth_rate_limits'",
    );
    assert(
      policies.rows.length === 0,
      "auth_rate_limits has zero policies (RLS-with-no-policies denies by default)",
      `found ${policies.rows.length}: ${policies.rows.map((r) => r.policyname).join(", ")}`,
    );
  }

  // 6. THE HEADLINE CHECK, and the one this script previously did NOT make:
  // anon must not be able to CALL consume_rate_limit. Check 5 above only
  // proves anon can't SELECT the table directly — it says nothing about the
  // RPC, which is Task 4's entire round-2 fix and the actual attack surface
  // (POST /rest/v1/rpc/consume_rate_limit with the public anon key would let
  // anyone burn a victim's login_email bucket without ever attempting a
  // login; see 0031_auth_rate_limits.sql's grant comments).
  //
  // This calls the LIVE RPC as the anon client (mirroring check 5's shape,
  // and the real unauthenticated-attacker path) rather than querying
  // information_schema/pg_catalog for the grant — a live call is what
  // actually caught the original bug. The first attempt at the Task 4
  // round-2 fix was `revoke ... from public` alone, which was a SILENT
  // NO-OP: 0003_api_grants.sql's `alter default privileges ... grant execute
  // ... to anon` grants EXECUTE to anon DIRECTLY, independent of PUBLIC, so
  // revoking only from PUBLIC left the RPC fully reachable with the anon
  // key. That was caught only by live probing, not by a catalog query — this
  // check exists so a future re-grant (accidental or "helpful") fails this
  // script instead of shipping silently, exactly the failure mode a
  // catalog-only check would stay green through.
  {
    const identifier = `verify-anon-denied-${stamp}@example.com`;
    const { data, error } = await anon.rpc("consume_rate_limit", {
      scope: "login_email",
      identifier,
    });
    assert(
      error?.code === "42501",
      "anon RPC call to consume_rate_limit is denied with permission-denied (42501)",
      error ? `got code=${error.code} message=${error.message}` : `unexpectedly succeeded: ${JSON.stringify(data)}`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EPERM|connect/i.test(message)) {
    console.error(
      [
        "",
        `Could not reach the local Supabase stack at ${SUPABASE_URL} (or Postgres at ${DB_URL}).`,
        "Start it first (from the repo root):",
        "  supabase start",
        `Original error: ${message}`,
        "",
      ].join("\n"),
    );
    process.exit(2);
  }
  console.error(`\nUnexpected error: ${message}\n`);
  process.exit(1);
} finally {
  await db.end().catch(() => {});
}

console.log(`\n== ${passed} passed, ${failed} failed ==\n`);
process.exit(failed > 0 ? 1 : 0);
