#!/usr/bin/env node
// APPSEC-19: there must be exactly ONE approval write path.
//
// Asserts three things that together make the claim checkable:
//   1. No application code inserts into public.approvals directly.
//   2. Every approval-recording server action calls submit_quote_approval().
//   3. A migration revokes INSERT on public.approvals from `authenticated`,
//      so the privilege layer -- not developer discipline -- is what keeps the
//      second door shut.
//
// Static analysis on purpose: the runtime check lives in
// supabase/tests/tenant_parent_integrity_tests.sql, which proves the direct
// insert is actually refused. This one catches a reintroduced code path in
// review, before it reaches a database.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../..");
const problems = [];

// Repo-wide search, excluding generated types and the migrations themselves.
function grepFiles(pattern) {
  try {
    return execFileSync(
      "grep",
      ["-rln", "--include=*.ts", "--include=*.tsx", "-e", pattern,
        `${REPO}/apps/web/src`],
      { encoding: "utf8" },
    ).split("\n").filter(Boolean);
  } catch {
    return []; // grep exits 1 when nothing matches
  }
}

// 1. Direct inserts. Matches `.from("approvals")` followed by `.insert`.
const approvalsFiles = grepFiles('from("approvals")');
for (const file of approvalsFiles) {
  const src = readFileSync(file, "utf8");
  const rel = file.replace(`${REPO}/`, "");
  // Allow reads; flag writes.
  const re = /from\(\s*["']approvals["']\s*\)\s*\.\s*(insert|upsert|update|delete)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(`${rel}:${line} writes approvals directly (.${m[1]})`);
  }
}

// 2. Approval actions must route through the RPC. Any file that handles an
//    approval submission should name the function.
const actionFiles = [
  "apps/web/src/app/[locale]/(portal)/portal/actions.ts",
  "apps/web/src/app/[locale]/(dashboard)/quotations/actions.ts",
];
let rpcCallers = 0;
for (const rel of actionFiles) {
  const src = readFileSync(`${REPO}/${rel}`, "utf8");
  if (!/export async function approveQuote/.test(src)) continue;
  if (src.includes('rpc("submit_quote_approval"')) rpcCallers += 1;
  else problems.push(`${rel} defines approveQuote without calling submit_quote_approval()`);
}
if (rpcCallers === 0) {
  problems.push("no server action calls submit_quote_approval() -- the canonical path is unused");
}

// 3. The privilege revoke must exist in a migration.
let revoked = false;
try {
  const hits = execFileSync(
    "grep", ["-rl", "-e", "revoke insert", `${REPO}/supabase/migrations`],
    { encoding: "utf8" },
  ).split("\n").filter(Boolean);
  revoked = hits.some((f) =>
    /revoke\s+insert[^;]*on\s+public\.approvals/i.test(readFileSync(f, "utf8")),
  );
} catch {
  revoked = false;
}
if (!revoked) {
  problems.push("no migration revokes INSERT on public.approvals from authenticated");
}

process.stdout.write(
  `approval_rpc_callers=${rpcCallers} direct_write_sites=${problems.filter((p) => p.includes("directly")).length} grant_revoked=${revoked}\n`,
);

if (problems.length) {
  process.stdout.write(problems.map((p) => `  - ${p}`).join("\n") + "\n");
  process.stdout.write("APPROVAL_PATH_SPLIT\n");
  process.exit(1);
}
process.stdout.write("APPROVAL_PATH_CANONICAL\n");
