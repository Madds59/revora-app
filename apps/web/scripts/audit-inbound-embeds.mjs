#!/usr/bin/env node
/**
 * Asserts that the inbound-capture code issues no PostgREST embed.
 *
 * WHY THIS EXISTS
 * Migration 0039 left 111 relationship pairs ambiguous, and an ambiguous embed
 * fails with PGRST201 — which renders as a false empty state rather than an
 * error. The audit that detects that class (audit-postgrest-embeds.mjs) lives
 * on the unmerged fix/postgrest-ambiguous-embeds work and is absent from main,
 * so it cannot run on this branch.
 *
 * Rather than claim the class does not apply, this proves the stronger and
 * locally checkable property: the inbound code uses only flat selects, so
 * there is no embed to be ambiguous. If someone later adds one, this fails and
 * points them at the real audit.
 *
 *   node scripts/audit-inbound-embeds.mjs
 *   node scripts/audit-inbound-embeds.mjs --self-test
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TARGETS = ["src/lib/inbound", "src/app/api/inbound"];

/**
 * A PostgREST embed is a parenthesised relation inside a select string:
 *   .select("id, customers(full_name)")
 * A flat select never contains "(" inside the quoted argument.
 */
const EMBED = /\.select\(\s*(["'])((?:(?!\1)[^\\]|\\.)*?\([^)]*\)[^"']*)\1/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(full)) out.push(full);
  }
  return out;
}

function selfTest() {
  const mustCatch = [
    '.select("id, customers(full_name)")',
    ".select('id, leads(subject)')",
    '.select(  "business_id, channel_identities(external_id)" )',
  ];
  const mustPass = [
    '.select("id")',
    '.select("id, business_id, branch_id")',
    ".select('id, business_id')",
    // A call with no select at all.
    '.insert({ business_id: x })',
  ];

  let failures = 0;
  for (const sample of mustCatch) {
    if (!EMBED.test(sample)) {
      console.error(`SELF-TEST FAIL: did not detect embed in ${sample}`);
      failures += 1;
    }
  }
  for (const sample of mustPass) {
    if (EMBED.test(sample)) {
      console.error(`SELF-TEST FAIL: false positive on ${sample}`);
      failures += 1;
    }
  }
  console.log(`self-test cases=${mustCatch.length + mustPass.length} failures=${failures}`);
  if (failures) process.exit(1);
  console.log("INBOUND_EMBED_AUDIT_SELF_TEST_OK");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const files = TARGETS.flatMap((dir) => walk(dir));
  const violations = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (EMBED.test(text)) violations.push(file);
  }

  console.log(`files=${files.length} embeds=${violations.length}`);
  if (violations.length) {
    for (const file of violations) {
      console.error(
        `VIOLATION: ${file} issues a PostgREST embed. Name the constraint, and run the embed audit from fix/postgrest-ambiguous-embeds before merging.`,
      );
    }
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("VIOLATION: no inbound source files found; the audit scanned nothing.");
    process.exit(1);
  }
  console.log("INBOUND_EMBED_AUDIT_OK");
}

main();
