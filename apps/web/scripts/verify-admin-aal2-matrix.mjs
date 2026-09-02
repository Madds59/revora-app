// Five-caller security matrix for platform-admin authority, exercised at the
// DATABASE boundary against a LOCAL Postgres. NOT part of `pnpm test` / CI.
//
//   node scripts/verify-admin-aal2-matrix.mjs
//   node scripts/verify-admin-aal2-matrix.mjs --negative-control
//   node scripts/verify-admin-aal2-matrix.mjs --tenant-noninterference
//
// Why this exists: the MFA gate in middleware is a ROUTING control. It cannot
// speak to what happens when someone POSTs to /rest/v1/rpc/admin_list_users
// with a stolen aal1 admin token. This script tests the predicate the database
// itself enforces, with the UI removed from consideration entirely.
//
// BOUNDED SIMULATION -- stated explicitly, as the mandate requires:
//   Callers are simulated by setting `request.jwt.claims`, which is exactly what
//   PostgREST sets after it verifies the JWT signature. auth.uid() and auth.jwt()
//   read that setting, so the predicate under test sees precisely what it would
//   see on a real request. What this does NOT exercise is signature verification
//   itself (GoTrue/PostgREST's job, not ours) or the HTTP layer. The grant
//   posture that governs the HTTP layer is measured separately, from pg_catalog.
//
// Everything runs inside a transaction that is ALWAYS rolled back, so no test
// admin, user or row survives the run.

import pg from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const NEGATIVE_CONTROL = process.argv.includes("--negative-control");
const TENANT_MODE = process.argv.includes("--tenant-noninterference");

function assertLocal(url) {
  let host;
  try {
    host = new URL(url.replace(/^postgres(ql)?:\/\//, "http://")).hostname;
  } catch {
    host = null;
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.error(
      `Refusing to run against non-local database host "${host ?? "unparseable"}".\n` +
        "This script writes rows and redefines functions inside a transaction.",
    );
    process.exit(1);
  }
}
assertLocal(DB_URL);

let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (got ${actual}, want ${expected})`);
}

// Claims exactly as PostgREST presents them post-verification.
function claims({ sub, role = "authenticated", aal = null }) {
  const payload = { role, sub };
  if (aal) payload.aal = aal;
  return JSON.stringify(payload);
}

async function callerCan(client, jwtClaims, fn) {
  // Each probe runs inside its own savepoint. A denial raises, which would
  // otherwise poison the enclosing transaction and turn every later probe into a
  // misleading "current transaction is aborted" failure.
  await client.query("savepoint probe");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims]);
    await client.query(`select ${fn}`);
    await client.query("release savepoint probe");
    return "ALLOW";
  } catch (error) {
    await client.query("rollback to savepoint probe");
    await client.query("release savepoint probe");
    // 42501 is what assert_admin_aal2 raises; the admin_* bodies raise a bare
    // 'forbidden'. Both are denials. Anything else is a real fault worth seeing
    // rather than silently counting as a pass.
    if (error.code === "42501" || /forbidden/i.test(error.message)) return "DENY";
    return `ERROR:${error.code ?? "?"}`;
  }
}

const client = new pg.Client(DB_URL);

try {
  await client.connect();
  await client.query("begin");

  if (NEGATIVE_CONTROL) {
    // Prove the matrix can fail: restore the pre-0033 predicate (role only, no
    // AAL) and confirm the admin-aal1 row flips to ALLOW. Without this, a
    // matrix that passes proves nothing about whether the AAL2 check is load-
    // bearing or merely present.
    await client.query(`
      create or replace function public.is_super_admin()
      returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()); $$;
    `);
  }

  const adminId = "00000000-0000-4000-8000-00000000ad11";
  const plainId = "00000000-0000-4000-8000-00000000u5e2".replace(/u/g, "b");

  await client.query(
    "insert into auth.users(id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2) on conflict do nothing",
    [adminId, `aal2-matrix-admin@example.invalid`],
  );
  await client.query(
    "insert into auth.users(id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2) on conflict do nothing",
    [plainId, `aal2-matrix-user@example.invalid`],
  );
  await client.query("insert into public.platform_admins(user_id) values ($1) on conflict do nothing", [
    adminId,
  ]);

  if (TENANT_MODE) {
    // A business member must keep reaching tenant-scoped functions at aal1. The
    // tenant guard is `not is_business_member(...) and not is_super_admin()`, so
    // tightening the admin branch must not disturb the member branch.
    // The question this answers: does requiring aal2 for admin authority lock
    // ordinary business users out of their own tenant data? It must not. The
    // tenant guard is `not is_business_member(id) and not is_super_admin()`, so
    // a member has to keep passing on the FIRST branch at aal1.
    const bizId = "00000000-0000-4000-8000-0000000b1200";
    await client.query("insert into public.businesses(id, name) values ($1,$2) on conflict do nothing", [
      bizId,
      "AAL2 matrix control business",
    ]);
    await client.query(
      "insert into public.business_members(business_id, user_id, role) values ($1,$2,'business_owner') on conflict do nothing",
      [bizId, plainId],
    );

    // 0033 must not have touched the member predicate at all.
    const untouched = await client.query(
      "select pg_get_functiondef(p.oid) ilike '%aal%' as touches_aal from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_business_member'",
    );
    check("is_business_member is free of any AAL dependency", untouched.rows[0].touches_aal, false);

    // A business owner at aal1 reaches their own tenant function.
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      claims({ sub: plainId, aal: "aal1" }),
    ]);
    const memberSees = await client.query("select public.is_business_member($1) as v", [bizId]);
    check("business owner at aal1 still passes the member branch", memberSees.rows[0].v, true);

    // And is still NOT an admin, so the tightening did not leak authority.
    const memberIsAdmin = await client.query("select public.is_super_admin() as v");
    check("business owner at aal1 is not treated as platform admin", memberIsAdmin.rows[0].v, false);

    // The admin fallback still works for a genuine admin at aal2.
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      claims({ sub: adminId, aal: "aal2" }),
    ]);
    const adminFallback = await client.query("select public.is_super_admin() as v");
    check("platform admin at aal2 still reaches the admin fallback", adminFallback.rows[0].v, true);
  } else {
    const ADMIN_FN = "public.admin_list_users()";

    check("anonymous", await callerCan(client, claims({ sub: null, role: "anon" }), ADMIN_FN), "DENY");
    check(
      "authenticated non-admin aal1",
      await callerCan(client, claims({ sub: plainId, aal: "aal1" }), ADMIN_FN),
      "DENY",
    );
    check(
      "authenticated non-admin aal2",
      await callerCan(client, claims({ sub: plainId, aal: "aal2" }), ADMIN_FN),
      "DENY",
    );
    check(
      "platform admin aal1",
      await callerCan(client, claims({ sub: adminId, aal: "aal1" }), ADMIN_FN),
      NEGATIVE_CONTROL ? "ALLOW" : "DENY",
    );
    check(
      "platform admin aal2",
      await callerCan(client, claims({ sub: adminId, aal: "aal2" }), ADMIN_FN),
      "ALLOW",
    );

    // A missing aal claim must not be treated as satisfied.
    check(
      "platform admin, aal claim absent entirely",
      await callerCan(client, claims({ sub: adminId }), ADMIN_FN),
      NEGATIVE_CONTROL ? "ALLOW" : "DENY",
    );

    // Grant posture, measured from the catalog rather than asserted.
    await client.query("reset role");
    const grants = await client.query(`
      select count(*)::int as anon_execs
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'admin\\_%'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    `);
    check("anon EXECUTE grants on admin_* functions", grants.rows[0].anon_execs, 0);
  }

  await client.query("rollback");
} catch (error) {
  failed++;
  console.error("HARNESS ERROR:", error.message);
  try {
    await client.query("rollback");
  } catch {
    /* connection already gone */
  }
} finally {
  await client.end().catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed`);
if (NEGATIVE_CONTROL) {
  // Under the negative control the pre-0033 predicate is restored, so the aal1
  // rows are EXPECTED to allow. Passing here means the matrix genuinely detects
  // the difference; the rollback above discards the weakened function.
  if (failed === 0) console.log("NEGATIVE_CONTROL_CAUGHT_REGRESSION");
  process.exit(failed === 0 ? 0 : 1);
}
if (TENANT_MODE) {
  if (failed === 0) console.log("TENANT_FUNCTIONS_UNAFFECTED");
  process.exit(failed === 0 ? 0 : 1);
}
if (failed === 0) console.log("MATRIX_5_OF_5_AS_EXPECTED");
process.exit(failed === 0 ? 0 : 1);
