#!/usr/bin/env node
// Systematic audit for the view-privilege class.
//
// WHY THIS EXISTS
// Migration 0043 created public.jobs_missing_vehicle and its own comment
// claimed "the view inherits the RLS of the underlying table for the querying
// role". That is false on PostgreSQL 15+. A view executes with the privileges
// of its OWNER unless `security_invoker = true` is set, the owner here is
// `postgres`, and RLS never applies to a table owner -- so the view read
// public.jobs with row-level security bypassed entirely. Separately,
// 0003_api_grants.sql sets ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES,
// which applies to VIEWS as well as tables, so the view also acquired INSERT,
// UPDATE and DELETE for `anon` and `authenticated` -- on a view PostgreSQL
// treats as auto-updatable. The result was an unauthenticated cross-tenant
// read, and a cross-tenant write path, through a reporting view.
//
// None of the 210 database test cases caught it: every one of them asserts
// against tables. This audit closes that blind spot as a rule rather than as a
// one-off fix, so the NEXT view inherits the check instead of reintroducing the
// class.
//
// WHY THIS NO LONGER READS information_schema FOR GRANTS
// The first version of this script resolved grants from
// information_schema.role_table_grants filtered to `anon`/`authenticated`.
// PostgreSQL documents that those views show privileges granted TO a named
// role -- a privilege reaching the role through PUBLIC appears under grantee
// `PUBLIC` instead and is therefore invisible to that filter. `anon` and
// `authenticated` are members of PUBLIC, so a single
// `grant insert on <view> to public` would have been real, usable, and
// completely unreported. The audit now asks PostgreSQL the question it
// actually cares about -- has_table_privilege(role, view, priv) -- which
// resolves direct grants, PUBLIC, and role inheritance together. The
// --self-test below proves that difference rather than asserting it.
//
// THE INVARIANT, for every ordinary view in schema `public`:
//   1. `security_invoker = true` -- the view evaluates RLS as its caller.
//   2. No EFFECTIVE INSERT / UPDATE / DELETE / TRUNCATE for `anon` or
//      `authenticated`, however the privilege arrives. A view is a report, not
//      a write path. SELECT is fine: with (1) in place, RLS decides what the
//      caller actually sees.
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const DB = process.env.REVORA_TEST_DB || "revora_sec_test";
const SELF_TEST = process.argv.includes("--self-test");
// Set by the cleanup positive control to prove the `finally` path really runs.
const FAULT = process.env.REVORA_VIEW_AUDIT_FAULT === "1";

const PROTECTED_ROLES = ["anon", "authenticated"];
const WRITE_PRIVS = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];

// `effective_writes` is PostgreSQL's own privilege evaluation, so it includes
// PUBLIC and inherited roles. `direct_writes` is deliberately kept alongside
// it: it reproduces the OLD, insufficient query, and the self-test requires the
// two to disagree on a PUBLIC-only grant. Without that column the repair would
// be untested.
const AUDIT_SQL = `
select c.relname::text as view_name,
       (coalesce(c.reloptions::text, '') like '%security_invoker=true%') as invoker,
       coalesce(e.effective, '') as effective_writes,
       coalesce(d.direct, '') as direct_writes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join lateral (
    select string_agg(r.role || ':' || p.priv, ',' order by r.role, p.priv) as effective
      from (values ${PROTECTED_ROLES.map((r) => `('${r}')`).join(",")}) as r(role),
           (values ${WRITE_PRIVS.map((p) => `('${p}')`).join(",")}) as p(priv)
     where has_table_privilege(r.role, c.oid, p.priv)
  ) e on true
  left join lateral (
    select string_agg(distinct g.grantee || ':' || g.privilege_type, ',' order by g.grantee || ':' || g.privilege_type) as direct
      from information_schema.role_table_grants g
     where g.table_schema = 'public'
       and g.table_name = c.relname
       and g.grantee in (${PROTECTED_ROLES.map((r) => `'${r}'`).join(",")})
       and g.privilege_type in (${WRITE_PRIVS.map((p) => `'${p}'`).join(",")})
  ) d on true
 where n.nspname = 'public'
   and c.relkind = 'v'
 order by c.relname
`;

// Four fixtures, one per case the detector must decide. Names are prefixed
// `_vwaudit_` so teardown can find them by pattern even if this list drifts.
const SELF_TEST_SETUP = `
-- 1. Owner rights, no write grants: must be flagged for exactly one reason.
create or replace view public._vwaudit_owner_rights as
  select id, business_id from public.jobs;
revoke all on public._vwaudit_owner_rights from public, anon, authenticated;
grant select on public._vwaudit_owner_rights to authenticated;

-- 2. Correct invoker rights, but a DIRECT write grant to anon.
create or replace view public._vwaudit_direct_write with (security_invoker = true) as
  select id, business_id from public.jobs;
revoke all on public._vwaudit_direct_write from public, anon, authenticated;
grant select, insert on public._vwaudit_direct_write to anon;

-- 3. Correct invoker rights, write granted ONLY to PUBLIC. anon and
--    authenticated hold it through membership; no ACL entry names them. This
--    is the case the previous information_schema query could not see.
create or replace view public._vwaudit_public_write with (security_invoker = true) as
  select id, business_id from public.jobs;
revoke all on public._vwaudit_public_write from public, anon, authenticated;
grant select, insert on public._vwaudit_public_write to public;

-- 4. Correct in both respects: must NOT be flagged.
create or replace view public._vwaudit_clean with (security_invoker = true) as
  select id, business_id from public.jobs;
revoke all on public._vwaudit_clean from public, anon, authenticated;
grant select on public._vwaudit_clean to authenticated;
`;

const SELF_TEST_TEARDOWN = `
do $$
declare v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like '\\_vwaudit\\_%'
  loop
    execute format('drop view if exists public.%I', v.relname);
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

function readViews() {
  return psql(AUDIT_SQL)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, invoker, effective, direct] = line.split("\t");
      return {
        name,
        invoker: invoker === "t" || invoker === "true",
        effectiveWrites: effective ? effective.split(",") : [],
        directWrites: direct ? direct.split(",") : [],
      };
    });
}

function violations(views) {
  return views.flatMap((v) => {
    const reasons = [];
    if (!v.invoker) reasons.push("security_invoker is not true (runs as owner, RLS bypassed)");
    if (v.effectiveWrites.length) {
      const hidden = v.directWrites.length === 0 ? " -- reaching the role through PUBLIC, not a direct grant" : "";
      reasons.push(`effective write privileges: ${v.effectiveWrites.join(" ")}${hidden}`);
    }
    return reasons.length ? [{ name: v.name, reasons, view: v }] : [];
  });
}

function fail(lines, token) {
  for (const l of lines) process.stdout.write(`  - ${l}\n`);
  process.stdout.write(`${token}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-test. A detector for an absence that was never shown failing proves
// nothing, so this builds all four cases and requires the exact verdict on
// each -- including that the repaired query disagrees with the old one.
// ---------------------------------------------------------------------------
if (SELF_TEST) {
  let views;
  const problems = [];
  try {
    psql(SELF_TEST_SETUP);
    if (FAULT) throw new Error("injected fault after fixture setup (REVORA_VIEW_AUDIT_FAULT=1)");
    views = readViews();

    const found = violations(views);
    const by = (n) => found.find((v) => v.name === n);
    const all = (n) => views.find((v) => v.name === n);

    for (const n of ["_vwaudit_owner_rights", "_vwaudit_direct_write", "_vwaudit_public_write", "_vwaudit_clean"]) {
      if (!all(n)) problems.push(`fixture ${n} was not created or not enumerated`);
    }

    const owner = by("_vwaudit_owner_rights");
    if (!owner) problems.push("the owner-rights view was NOT flagged");
    else if (!owner.reasons.some((r) => r.includes("security_invoker"))) {
      problems.push("the owner-rights view was flagged, but not for owner rights");
    } else if (owner.reasons.length !== 1) {
      problems.push(`the owner-rights view should be flagged for exactly one reason, got ${owner.reasons.length}: ${owner.reasons.join("; ")}`);
    }

    const direct = by("_vwaudit_direct_write");
    if (!direct) problems.push("the DIRECT anon write grant was NOT flagged");
    else {
      if (!direct.reasons.some((r) => r.includes("effective write privileges"))) problems.push("the direct-grant view was flagged, but not for writes");
      if (!direct.view.directWrites.length) problems.push("the direct-grant fixture did not register as a direct grant, so it is not testing the direct path");
    }

    const pub = by("_vwaudit_public_write");
    if (!pub) problems.push("a write grant made only to PUBLIC was NOT flagged -- the PUBLIC route is still invisible");
    else {
      if (!pub.reasons.some((r) => r.includes("effective write privileges"))) problems.push("the PUBLIC-grant view was flagged, but not for writes");
      // The whole point of the repair: the old query must be blind to this.
      if (pub.view.directWrites.length) {
        problems.push("the PUBLIC-only fixture also shows a direct grant, so it does not isolate the PUBLIC route");
      }
      const roles = pub.view.effectiveWrites.map((w) => w.split(":")[0]);
      for (const r of PROTECTED_ROLES) {
        if (!roles.includes(r)) problems.push(`a PUBLIC grant was not resolved as effective for ${r}`);
      }
    }

    const clean = by("_vwaudit_clean");
    if (clean) problems.push(`the correct invoker-rights, read-only view WAS flagged: ${clean.reasons.join("; ")}`);
  } catch (err) {
    problems.push(err.message.includes("injected fault") ? err.message : `self-test could not run: ${err.message}`);
  } finally {
    // Guaranteed: fixtures must not survive a failure anywhere above.
    try {
      psql(SELF_TEST_TEARDOWN);
    } catch (err) {
      problems.push(`could not drop the self-test fixtures: ${err.message}`);
    }
  }

  if (problems.length) fail(problems, "VIEW_SECURITY_SELFTEST_FAILED");
  process.stdout.write(
    "self-test: owner-rights flagged, direct anon write flagged, PUBLIC-only write flagged\n" +
      "           (and invisible to the old direct-grant query), correct view not flagged\n",
  );
  process.stdout.write("VIEW_SECURITY_SELFTEST_OK\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Real audit.
// ---------------------------------------------------------------------------
let views;
try {
  views = readViews();
} catch (err) {
  process.stderr.write(
    `cannot reach ${DB} in ${CONTAINER}. Run: node scripts/db-test.mjs --reset\n` +
      `${err.stderr || ""}`,
  );
  process.stdout.write("VIEW_SECURITY_AUDIT_UNAVAILABLE\n");
  process.exit(1);
}

if (views.length === 0) {
  // Zero views would make an absence check pass while proving nothing. The
  // schema has had views since 0039, so an empty set means the query is wrong
  // or the database was never built.
  process.stderr.write(
    "no views found in schema public -- the audit query or the database is wrong\n",
  );
  process.stdout.write("VIEW_SECURITY_AUDIT_FAILED\n");
  process.exit(1);
}

const found = violations(views);
process.stdout.write(
  `views=${views.length} compliant=${views.length - found.length} violating=${found.length}\n`,
);

if (found.length) {
  process.stdout.write("Views that do not evaluate RLS as the caller, or accept writes:\n");
  for (const v of found) {
    process.stdout.write(`  - public.${v.name}\n`);
    for (const r of v.reasons) process.stdout.write(`      ${r}\n`);
  }
  process.stdout.write(
    "Fix: alter view public.<name> set (security_invoker = true);\n" +
      "     revoke all on public.<name> from public, anon, authenticated;\n" +
      "     grant select on public.<name> to <the roles that need it>;\n",
  );
  process.stdout.write("VIEW_SECURITY_AUDIT_FAILED\n");
  process.exit(1);
}

process.stdout.write("VIEW_SECURITY_AUDIT_OK\n");
