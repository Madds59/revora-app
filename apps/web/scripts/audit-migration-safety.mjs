#!/usr/bin/env node
// Rule 17/18: a Phase 1 remediation migration must not be destructive.
//
// Scans the migrations this branch ADDS (against origin/main) for statements
// that drop schema objects or remove tenant rows. Policies and functions are
// allowed to be dropped-and-recreated -- that is how a policy is edited -- but
// a table, column or constraint drop, or any DELETE/TRUNCATE of tenant data,
// has to be a deliberate, reviewed decision and never arrives quietly.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../..");
const git = (args) =>
  execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" });

let added;
try {
  added = git(["diff", "--name-only", "--diff-filter=A", "origin/main...HEAD", "--", "supabase/migrations/"])
    .split("\n").filter(Boolean);
} catch (err) {
  process.stderr.write(`cannot diff against origin/main: ${err.message}\n`);
  process.stdout.write("MIGRATION_SAFETY_UNAVAILABLE\n");
  process.exit(1);
}

// Uncommitted new migrations count too, so this gate is useful before commit.
const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "supabase/migrations/"])
  .split("\n").filter(Boolean);
const files = [...new Set([...added, ...untracked])];

const FORBIDDEN = [
  [/\bdrop\s+table\b/i, "DROP TABLE"],
  [/\bdrop\s+column\b/i, "DROP COLUMN"],
  [/\bdrop\s+constraint\b/i, "DROP CONSTRAINT"],
  [/\bdrop\s+schema\b/i, "DROP SCHEMA"],
  [/\btruncate\b/i, "TRUNCATE"],
  [/\bdrop\s+database\b/i, "DROP DATABASE"],
  [/\balter\s+column\b[^;]*\bdrop\s+default\b/i, "ALTER COLUMN DROP DEFAULT"],
];

const findings = [];
for (const rel of files) {
  const sql = readFileSync(`${REPO}/${rel}`, "utf8");
  // Strip line comments so prose describing a risk is not mistaken for one.
  const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  for (const [re, label] of FORBIDDEN) {
    if (re.test(code)) findings.push(`${rel}: ${label}`);
  }
  // DELETE against a public table (fixture cleanup belongs in tests, not here).
  const del = /\bdelete\s+from\s+public\./i.exec(code);
  if (del) findings.push(`${rel}: DELETE FROM public.*`);
}

process.stdout.write(
  `migrations_checked=${files.length} findings=${findings.length}\n`,
);
if (files.length === 0) {
  process.stderr.write(
    "no new migrations found -- this gate would pass without checking anything\n",
  );
  process.stdout.write("MIGRATION_SAFETY_NO_SUBJECT\n");
  process.exit(1);
}
if (findings.length) {
  process.stdout.write(findings.map((f) => `  - ${f}`).join("\n") + "\n");
  process.stdout.write("MIGRATION_SAFETY_FAILED\n");
  process.exit(1);
}
process.stdout.write("MIGRATION_SAFETY_OK\n");
