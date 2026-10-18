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
// THE INVARIANT, for every view in schema `public`:
//   1. `security_invoker = true` -- the view evaluates RLS as its caller.
//   2. No INSERT / UPDATE / DELETE / TRUNCATE held by `anon` or
//      `authenticated`. A view is a report, not a write path. SELECT is fine:
//      with (1) in place, RLS decides what the caller actually sees.
//
// --self-test proves the detector can fail AND can pass, by building one
// deliberately bad view and one correct view and requiring the exact verdict
// on each. A detector for an absence that was never shown failing proves
// nothing.
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const DB = process.env.REVORA_TEST_DB || "revora_sec_test";
const SELF_TEST = process.argv.includes("--self-test");

// reloptions is NULL for a view created without options, so coalesce before
// matching. The grant side is read from information_schema rather than
// pg_class.relacl because default privileges, explicit grants and role
// inheritance all land there already resolved.
const AUDIT_SQL = `
select c.relname::text as view_name,
       (coalesce(c.reloptions::text, '') like '%security_invoker=true%') as invoker,
       coalesce((
         select string_agg(distinct g.privilege_type, ',' order by g.privilege_type)
           from information_schema.role_table_grants g
          where g.table_schema = 'public'
            and g.table_name = c.relname
            and g.grantee in ('anon', 'authenticated')
            and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       ), '') as write_privs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
 order by c.relname
`;

const SELF_TEST_SETUP = `
create or replace view public._view_audit_bad as select id, business_id from public.jobs;
grant select, insert, update, delete on public._view_audit_bad to anon, authenticated;
create or replace view public._view_audit_good with (security_invoker = true) as
  select id, business_id from public.jobs;
revoke all on public._view_audit_good from anon, authenticated;
grant select on public._view_audit_good to authenticated;
`;

const SELF_TEST_TEARDOWN = `
drop view if exists public._view_audit_bad;
drop view if exists public._view_audit_good;
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
      const [name, invoker, writePrivs] = line.split("\t");
      return {
        name,
        invoker: invoker === "t" || invoker === "true",
        writePrivs: writePrivs ? writePrivs.split(",") : [],
      };
    });
}

function violations(views) {
  return views.flatMap((v) => {
    const reasons = [];
    if (!v.invoker) reasons.push("security_invoker is not true (runs as owner, RLS bypassed)");
    if (v.writePrivs.length) {
      reasons.push(`write privileges held by anon/authenticated: ${v.writePrivs.join("/")}`);
    }
    return reasons.length ? [{ name: v.name, reasons }] : [];
  });
}

let views;
try {
  if (SELF_TEST) psql(SELF_TEST_SETUP);
  views = readViews();
} catch (err) {
  process.stderr.write(
    `cannot reach ${DB} in ${CONTAINER}. Run: node scripts/db-test.mjs --reset\n` +
      `${err.stderr || ""}`,
  );
  process.stdout.write("VIEW_SECURITY_AUDIT_UNAVAILABLE\n");
  process.exit(1);
}

if (SELF_TEST) {
  const found = violations(views);
  const flaggedBad = found.find((v) => v.name === "_view_audit_bad");
  const flaggedGood = found.find((v) => v.name === "_view_audit_good");
  try {
    psql(SELF_TEST_TEARDOWN);
  } catch {
    process.stderr.write("warning: could not drop the self-test views\n");
  }

  const problems = [];
  if (!flaggedBad) problems.push("the deliberately bad view was NOT flagged");
  else if (flaggedBad.reasons.length !== 2) {
    problems.push(
      `the bad view was flagged for ${flaggedBad.reasons.length} reason(s), expected both ` +
        `(owner-rights AND write grants): ${flaggedBad.reasons.join("; ")}`,
    );
  }
  if (flaggedGood) {
    problems.push(`the correct view WAS flagged: ${flaggedGood.reasons.join("; ")}`);
  }

  if (problems.length) {
    process.stdout.write(problems.map((p) => `  - ${p}`).join("\n") + "\n");
    process.stdout.write("VIEW_SECURITY_SELFTEST_FAILED\n");
    process.exit(1);
  }
  process.stdout.write(
    "self-test: bad view flagged on both counts, correct view not flagged\n",
  );
  process.stdout.write("VIEW_SECURITY_SELFTEST_OK\n");
  process.exit(0);
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
      "     revoke all on public.<name> from anon, authenticated;\n" +
      "     grant select on public.<name> to <the roles that need it>;\n",
  );
  process.stdout.write("VIEW_SECURITY_AUDIT_FAILED\n");
  process.exit(1);
}

process.stdout.write("VIEW_SECURITY_AUDIT_OK\n");
