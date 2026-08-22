// Verification for the auth rate-limit store (public.consume_rate_limit /
// public.auth_rate_limits) against a LOCAL Supabase stack. This is NOT part
// of `pnpm test` / CI — it needs a running local stack and mutates rows
// directly with the service-role key to simulate window roll-over. Run it
// manually from apps/web, with the local stack up (`supabase start` from the
// repo root):
//
//   node scripts/verify-rate-limit.mjs
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) — defaults to
//     http://127.0.0.1:54321, the standard local Supabase API port.
//   SUPABASE_ANON_KEY — defaults to the well-known local demo anon key
//     (same one apps/web/scripts/e2e.mjs uses).
//   SUPABASE_SERVICE_ROLE_KEY — required. Used only to read rows and
//     backdate window_start directly for assertions (service_role bypasses
//     RLS locally); never used to call consume_rate_limit itself — every
//     consume_rate_limit call in this script goes through the anon client,
//     the same role the unauthenticated auth flows use.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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

if (!SERVICE_KEY) {
  console.error(
    [
      "SUPABASE_SERVICE_ROLE_KEY is required (the local stack's service_role key).",
      "It's used only to read auth_rate_limits rows and backdate window_start",
      "directly, to assert internal state and simulate window roll-over.",
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

async function consume(scope, identifier) {
  const { data, error } = await anon.rpc("consume_rate_limit", { scope, identifier });
  if (error) throw new Error(`consume_rate_limit(${scope}) failed: ${error.message}`);
  return data;
}

const stamp = Date.now();
console.log("\n== auth_rate_limits / consume_rate_limit verification (live local DB) ==\n");

try {
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
  {
    const idA = `verify-scope-a-${stamp}`;
    const idB = `verify-scope-b-${stamp}`;
    for (let i = 1; i <= 3; i++) await consume("login_ip", idA);
    await consume("signup_ip", idB);
    const rowB = await readRow(bucketKeyFor("signup_ip", idB));
    assert(
      rowB?.attempt_count === 1,
      "different scopes/identifiers land in separate buckets",
      `count=${rowB?.attempt_count}`,
    );
  }

  // 4. The same identifier used in a different scope stays independent.
  {
    const sharedIdentifier = `198.51.100.${stamp % 250}`;
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

  // 5. anon cannot read auth_rate_limits directly (no policies + explicit revoke).
  {
    const { data, error } = await anon.from("auth_rate_limits").select("bucket_key").limit(1);
    assert(
      !!error,
      "anon SELECT on auth_rate_limits is denied",
      error ? undefined : `unexpectedly succeeded: ${JSON.stringify(data)}`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EPERM|connect/i.test(message)) {
    console.error(
      [
        "",
        `Could not reach the local Supabase stack at ${SUPABASE_URL}.`,
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
}

console.log(`\n== ${passed} passed, ${failed} failed ==\n`);
process.exit(failed > 0 ? 1 : 0);
