import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Static guards for the two privilege detectors and 0047.
//
// WHY A STATIC TEST FOR SOMETHING THAT HAS A DATABASE SELF-TEST
// Both detectors already prove themselves against real PostgreSQL via
// `pnpm audit:views:self-test` and `pnpm audit:functions:self-test`, and that
// is the decisive evidence. These assertions guard the one thing a database
// self-test cannot: a future edit that quietly reverts the METHOD back to the
// insufficient one. They run in `pnpm test` with no database and no Docker, so
// the regression is caught on every push rather than only where a database is
// available.
//
// The method matters because each detector previously asked the wrong question:
//
//   * The view audit resolved grants from information_schema.role_table_grants
//     filtered to anon/authenticated. Those views report privileges granted TO
//     a named role; a privilege reaching the role through PUBLIC appears under
//     grantee PUBLIC and is invisible to that filter.
//   * The DVI allowlist assertion matched the ACL TEXT for 'anon=X'. The
//     offending grant never names anon -- PostgreSQL grants EXECUTE to PUBLIC
//     by default, so the ACL reads '=X/postgres'.
//
// Both are fixed by asking PostgreSQL to evaluate the privilege instead.

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const read = (p) => readFileSync(path.join(repo, p), "utf8");

const VIEW_AUDIT = "apps/web/scripts/audit-view-security.mjs";
const FN_AUDIT = "apps/web/scripts/audit-function-privileges.mjs";
const MIGRATION = "supabase/migrations/0047_view_privilege_hardening.sql";
const DVI = "supabase/tests/dvi_security_tests.sql";

test("the view audit evaluates effective privilege, not just direct grants", () => {
  const src = read(VIEW_AUDIT);
  assert.match(src, /has_table_privilege\(/,
    "must use has_table_privilege, which resolves direct grants, PUBLIC and inheritance");
  // The role and privilege lists are declared once and interpolated into the
  // query, so assert the declarations rather than the generated SQL text.
  const privs = src.match(/const WRITE_PRIVS = \[([^\]]+)\]/);
  assert.ok(privs, "WRITE_PRIVS must be declared");
  for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
    assert.ok(privs[1].includes(`"${priv}"`), `must test ${priv}`);
  }
  const roles = src.match(/const PROTECTED_ROLES = \[([^\]]+)\]/);
  assert.ok(roles, "PROTECTED_ROLES must be declared");
  for (const role of ["anon", "authenticated"]) {
    assert.ok(roles[1].includes(`"${role}"`), `must test the ${role} role`);
  }
  assert.ok(
    /has_table_privilege\(r\.role, c\.oid, p\.priv\)/.test(src),
    "the declared roles and privileges must feed has_table_privilege",
  );
  // The old query is retained ONLY as the comparison the self-test uses to
  // prove the two disagree on a PUBLIC-only grant. It must not be the sole
  // source of the verdict.
  const verdictUsesEffective = /effectiveWrites\.length/.test(src);
  assert.ok(verdictUsesEffective, "the violation verdict must be driven by effective privileges");
});

test("the view audit still fails closed on an empty view set", () => {
  const src = read(VIEW_AUDIT);
  assert.match(src, /views\.length === 0/, "zero views must be treated as a failure, not a pass");
  assert.match(src, /VIEW_SECURITY_AUDIT_FAILED/);
});

test("the view audit tears its fixtures down on any failure path", () => {
  const src = read(VIEW_AUDIT);
  assert.match(src, /\}\s*finally\s*\{/, "teardown must run from a finally block");
  const finallyIdx = src.search(/\}\s*finally\s*\{/);
  assert.ok(src.slice(finallyIdx).includes("SELF_TEST_TEARDOWN"),
    "the finally block must run the teardown");
});

test("the function audit enforces an exact two-entry anonymous allowlist", () => {
  const src = read(FN_AUDIT);
  assert.match(src, /has_function_privilege\(/,
    "must use has_function_privilege, not an ACL text match");
  assert.match(src, /public\.resolve_inspection_share\(bytea\)/);
  assert.match(src, /public\.resolve_inspection_share_items\(bytea\)/);
  // Both directions: an extra entry is a door, a missing entry is a broken
  // public share link. Either must fail.
  assert.ok(/const extra =/.test(src) && /const missing =/.test(src),
    "must check the allowlist in both directions");
  assert.match(src, /extra\.length \|\| missing\.length/);
  assert.match(src, /prosecdef/, "must scope to SECURITY DEFINER functions");
});

test("the function audit fails closed on an empty function set", () => {
  const src = read(FN_AUDIT);
  assert.match(src, /fns\.length === 0/);
  assert.match(src, /FUNCTION_PRIVILEGE_AUDIT_FAILED/);
});

test("0047 closes the PUBLIC default with the schema-less form", () => {
  const sql = read(MIGRATION);
  // `in schema public` cannot remove PostgreSQL's built-in global
  // EXECUTE-to-PUBLIC grant: it has no PUBLIC entry to remove and is a silent
  // no-op. Only the schema-less form works. Measured, not assumed.
  const code = sql.replace(/--[^\n]*/g, " ");
  assert.match(code, /alter\s+default\s+privileges\s+revoke\s+execute\s+on\s+functions\s+from\s+public/i);
  assert.doesNotMatch(
    code,
    /alter\s+default\s+privileges\s+in\s+schema\s+\w+\s+revoke\s+execute\s+on\s+functions\s+from\s+public/i,
    "the IN SCHEMA form is a silent no-op against the built-in PUBLIC grant",
  );
});

test("0047 is privilege-reducing only", () => {
  const sql = read(MIGRATION);
  // Strip comments AND string literals: privilege NAMES appear as literals in
  // the assertion block, and a destructive statement never hides in a string.
  const code = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
  assert.doesNotMatch(code, /\bdelete\s+from\b/i);
  assert.doesNotMatch(code, /\btruncate\s+(table\b|only\b|public\.)/i);
  assert.doesNotMatch(code, /\bdrop\s+(table|view|function|column|constraint|policy)\b/i);
  assert.doesNotMatch(code, /\binsert\s+into\b/i);
  // And it must actually set security_invoker on both views.
  for (const view of ["jobs_missing_vehicle", "cross_tenant_reference_audit"]) {
    assert.match(
      code,
      new RegExp(`alter\\s+view\\s+public\\.${view}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*true`, "i"),
      `must set security_invoker on ${view}`,
    );
  }
  // Every function revoke must carry a full identity signature so an overload
  // cannot be hit by accident.
  const revokes = [...code.matchAll(/revoke\s+execute\s+on\s+function\s+([^\n;]+?)\s+from\s/gi)].map((m) => m[1].trim());
  assert.ok(revokes.length >= 7, `expected at least 7 function revokes, found ${revokes.length}`);
  for (const sig of revokes) {
    assert.match(sig, /\(.*\)$/, `revoke without an identity signature: ${sig}`);
  }
});

test("0047 asserts its own end state rather than trusting the statements", () => {
  const sql = read(MIGRATION);
  for (const code of ["VIEW-01", "VIEW-02", "FUNC-01", "FUNC-02", "FUNC-06", "FUNC-07"]) {
    assert.ok(sql.includes(code), `missing fail-closed assertion ${code}`);
  }
  assert.match(sql, /raise\s+exception/i);
});

test("the DVI allowlist assertion no longer matches ACL text", () => {
  const sql = read(DVI);
  assert.match(sql, /has_function_privilege\('anon'/,
    "the DVI allowlist check must evaluate privilege, not grep the ACL");
  // The old, broken predicate must be gone from the live assertion. It survives
  // only in the comment that explains why it was wrong.
  const code = sql.replace(/^\s*--[^\n]*$/gm, "");
  assert.doesNotMatch(code, /array_to_string\(proacl[^)]*\)\s*like\s*'%anon=X%'/i,
    "the ACL-text predicate must not drive any live assertion");
  assert.ok(sql.includes("DVI_SECURITY_OK") && sql.includes("DVI_SECURITY_FAILED"),
    "the suite must end in a verdict token so CI can assert it");
});
