#!/usr/bin/env node
// Systematic audit for the anonymous SECURITY DEFINER execution class.
//
// WHY THIS EXISTS
// A SECURITY DEFINER function runs as its owner (`postgres` here), which owns
// every table and is therefore never subject to RLS. So EXECUTE on one is a
// standing authorization decision, and EXECUTE held by `anon` means an
// unauthenticated caller can reach it as POST /rest/v1/rpc/<name> with the
// public anon key.
//
// WHY THE CLASS KEPT COMING BACK
// PostgreSQL grants EXECUTE on every newly created function to PUBLIC. That is
// the built-in default, not something a migration asked for, and `anon` and
// `authenticated` are members of PUBLIC. 0038 tried to close this with
//   alter default privileges in schema public revoke execute on functions from anon;
// which removes the 0003_api_grants.sql default for the NAMED role `anon` and
// leaves PostgreSQL's own PUBLIC grant completely untouched. Every function
// created after 0038 therefore came back anon-callable through PUBLIC. The
// ACLs show it plainly: the offenders read `=X/postgres` -- an empty grantee,
// meaning PUBLIC -- with no `anon` entry at all.
//
// WHY NOT MATCH THE ACL TEXT
// The pre-existing check in supabase/tests/dvi_security_tests.sql looked for
//   array_to_string(proacl, ' ') like '%anon=X%'
// which is exactly the wrong test: the offending grant never names anon. It
// also only considered functions whose name matched '%inspection%', and it
// printed a boolean instead of raising, so nothing could fail. This audit asks
// PostgreSQL the real question, has_function_privilege(role, oid, 'EXECUTE'),
// across the whole schema, and exits nonzero.
//
// THE INVARIANT
// The set of SECURITY DEFINER functions in `public` that `anon` can execute
// must equal ALLOWLIST exactly -- checked in both directions. An extra entry
// is an unauthenticated door. A missing entry means the public inspection-share
// link silently stopped working, which is a real regression and not a win.
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const DB = process.env.REVORA_TEST_DB || "revora_sec_test";
const SELF_TEST = process.argv.includes("--self-test");

// The only two functions an unauthenticated caller is meant to reach. Both are
// token-gated: they take the share token as bytea and resolve nothing without
// it. Adding to this list is a security decision, not a convenience.
const ALLOWLIST = [
  "public.resolve_inspection_share(bytea)",
  "public.resolve_inspection_share_items(bytea)",
];

// `direct_anon_acl` reproduces the OLD, insufficient test so the self-test can
// require the two to disagree on a PUBLIC-only grant.
const AUDIT_SQL = `
set search_path = pg_catalog;
select p.oid::regprocedure::text as sig,
       pg_get_function_result(p.oid) as result_type,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_exec,
       (coalesce(array_to_string(p.proacl, ' '), '') like '%anon=X%') as direct_anon_acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
 order by 1
`;

const SELF_TEST_SETUP = `
-- 1. The real-world shape: SECURITY DEFINER, never granted to anon by NAME,
--    reachable by anon purely because PUBLIC holds EXECUTE.
--
--    The grant is explicit here, and must stay explicit. Before 0047 this
--    fixture needed no grant at all -- PostgreSQL's built-in default handed
--    EXECUTE to PUBLIC on creation, which is precisely the defect. Now that
--    0047 has closed that default, relying on it would silently stop building
--    the condition under test, and the detector would look fine while proving
--    nothing. Granting to PUBLIC directly keeps the fixture independent of the
--    ambient default, so this control means the same thing on a database at
--    0046 and at 0047.
create or replace function public._fnaudit_public_only()
returns integer language sql security definer as $fn$ select 1 $fn$;
revoke execute on function public._fnaudit_public_only() from anon, authenticated;
grant execute on function public._fnaudit_public_only() to public;

-- 2. An explicit direct grant to anon.
create or replace function public._fnaudit_direct_anon()
returns integer language sql security definer as $fn$ select 1 $fn$;
revoke execute on function public._fnaudit_direct_anon() from public;
grant execute on function public._fnaudit_direct_anon() to anon;

-- 3. Correctly closed: neither PUBLIC nor anon.
create or replace function public._fnaudit_clean()
returns integer language sql security definer as $fn$ select 1 $fn$;
revoke execute on function public._fnaudit_clean() from public, anon;

-- 4. Stands in for an allowlisted function that LOST its anon access, so the
--    missing-entry direction is exercised too.
create or replace function public._fnaudit_required()
returns integer language sql security definer as $fn$ select 1 $fn$;
revoke execute on function public._fnaudit_required() from public, anon;
`;

const SELF_TEST_TEARDOWN = `
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '\\_fnaudit\\_%'
  loop
    execute format('drop function if exists %s', f.sig);
  end loop;
end $$;
`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", DB,
      "-X", "-q", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
}

function readFunctions() {
  return psql(AUDIT_SQL)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sig, resultType, anon, auth, svc, directAcl] = line.split("\t");
      const t = (v) => v === "t" || v === "true";
      return { sig, resultType, anonExec: t(anon), authExec: t(auth), svcExec: t(svc), directAcl: t(directAcl) };
    });
}

function fail(lines, token) {
  for (const l of lines) process.stdout.write(`  - ${l}\n`);
  process.stdout.write(`${token}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-test: prove the detector catches the PUBLIC route, catches a direct
// grant, clears a closed function, and notices a MISSING allowlist entry.
// ---------------------------------------------------------------------------
if (SELF_TEST) {
  const problems = [];
  try {
    psql(SELF_TEST_SETUP);
    const fns = readFunctions();
    const get = (name) => fns.find((f) => f.sig === `public.${name}()`);

    const pub = get("_fnaudit_public_only");
    if (!pub) problems.push("fixture _fnaudit_public_only was not enumerated");
    else {
      if (!pub.anonExec) problems.push("a SECURITY DEFINER function anon reaches through PUBLIC was NOT seen as anon-executable");
      // The whole reason this script exists.
      if (pub.directAcl) problems.push("the PUBLIC-only fixture also names anon in its ACL, so it does not isolate the PUBLIC route");
    }

    const direct = get("_fnaudit_direct_anon");
    if (!direct) problems.push("fixture _fnaudit_direct_anon was not enumerated");
    else {
      if (!direct.anonExec) problems.push("a direct anon EXECUTE grant was NOT seen");
      if (!direct.directAcl) problems.push("the direct-grant fixture does not register in the ACL, so it is not testing the direct path");
    }

    const clean = get("_fnaudit_clean");
    if (!clean) problems.push("fixture _fnaudit_clean was not enumerated");
    else if (clean.anonExec) problems.push("a function with PUBLIC and anon revoked was still reported anon-executable");

    // Extra-entry direction, against the real allowlist.
    const anonSet = fns.filter((f) => f.anonExec).map((f) => f.sig);
    for (const n of ["_fnaudit_public_only", "_fnaudit_direct_anon"]) {
      if (!anonSet.includes(`public.${n}()`)) problems.push(`${n} would not be reported as an unapproved anon-executable function`);
    }
    if (anonSet.includes("public._fnaudit_clean()")) problems.push("_fnaudit_clean would be wrongly reported");

    // Missing-entry direction, against a temporarily extended allowlist.
    const extended = [...ALLOWLIST, "public._fnaudit_required()"];
    const missing = extended.filter((sig) => !anonSet.includes(sig));
    if (!missing.includes("public._fnaudit_required()")) {
      problems.push("an allowlisted function that is NOT anon-executable would not be reported missing");
    }
    for (const sig of ALLOWLIST) {
      if (missing.includes(sig)) problems.push(`the real allowlist entry ${sig} is not anon-executable in this database`);
    }
  } catch (err) {
    problems.push(`self-test could not run: ${err.message}`);
  } finally {
    try {
      psql(SELF_TEST_TEARDOWN);
    } catch (err) {
      problems.push(`could not drop the self-test fixtures: ${err.message}`);
    }
  }

  if (problems.length) fail(problems, "FUNCTION_PRIVILEGE_SELFTEST_FAILED");
  process.stdout.write(
    "self-test: PUBLIC-route function detected (and absent from the old ACL test),\n" +
      "           direct anon grant detected, closed function cleared,\n" +
      "           missing allowlist entry reported\n",
  );
  process.stdout.write("FUNCTION_PRIVILEGE_SELFTEST_OK\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Real audit.
// ---------------------------------------------------------------------------
let fns;
try {
  fns = readFunctions();
} catch (err) {
  process.stderr.write(
    `cannot reach ${DB} in ${CONTAINER}. Run: node scripts/db-test.mjs --reset\n` +
      `${err.stderr || ""}`,
  );
  process.stdout.write("FUNCTION_PRIVILEGE_AUDIT_UNAVAILABLE\n");
  process.exit(1);
}

if (fns.length === 0) {
  // Fail closed: the schema has had SECURITY DEFINER functions since 0001, so
  // an empty set means the query is wrong or the database was never built.
  process.stderr.write(
    "no SECURITY DEFINER functions found in schema public -- the audit query or the database is wrong\n",
  );
  process.stdout.write("FUNCTION_PRIVILEGE_AUDIT_FAILED\n");
  process.exit(1);
}

const anonExecutable = fns.filter((f) => f.anonExec).map((f) => f.sig).sort();
const extra = anonExecutable.filter((s) => !ALLOWLIST.includes(s));
const missing = ALLOWLIST.filter((s) => !anonExecutable.includes(s));

process.stdout.write(
  `secdef=${fns.length} anon_executable=${anonExecutable.length} allowlisted=${ALLOWLIST.length} ` +
    `unapproved=${extra.length} missing=${missing.length}\n`,
);

if (extra.length || missing.length) {
  if (extra.length) {
    process.stdout.write("SECURITY DEFINER functions an unauthenticated caller can execute, but should not:\n");
    for (const sig of extra) {
      const f = fns.find((x) => x.sig === sig);
      const route = f && !f.directAcl ? "via PUBLIC (no anon entry in the ACL)" : "direct anon grant";
      process.stdout.write(`  - ${sig} -> ${f ? f.resultType : "?"}   [${route}]\n`);
    }
    process.stdout.write(
      "Fix, using the full identity signature so overloads cannot be confused:\n" +
        "     revoke execute on function <signature> from public, anon;\n",
    );
  }
  if (missing.length) {
    process.stdout.write("Allowlisted anonymous functions that are NO LONGER reachable (public share links break):\n");
    for (const sig of missing) process.stdout.write(`  - ${sig}\n`);
    process.stdout.write("     grant execute on function <signature> to anon;\n");
  }
  process.stdout.write("FUNCTION_PRIVILEGE_AUDIT_FAILED\n");
  process.exit(1);
}

for (const sig of anonExecutable) process.stdout.write(`  allowlisted: ${sig}\n`);
process.stdout.write("FUNCTION_PRIVILEGE_AUDIT_OK\n");
