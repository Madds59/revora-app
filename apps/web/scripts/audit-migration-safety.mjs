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

// Patterns that are destructive wherever they appear.
const FORBIDDEN = [
  [/\bdrop\s+table\b/i, "DROP TABLE"],
  [/\bdrop\s+column\b/i, "DROP COLUMN"],
  [/\bdrop\s+schema\b/i, "DROP SCHEMA"],
  [/\bdrop\s+database\b/i, "DROP DATABASE"],
  [/\balter\s+column\b[^;]*\bdrop\s+default\b/i, "ALTER COLUMN DROP DEFAULT"],
];

// A TRUNCATE *statement*. The bare word also appears as a PRIVILEGE NAME in
// GRANT/REVOKE -- `revoke truncate ... from anon` is the opposite of executing
// one, and flagging it would make the gate fire on the very hardening that
// removes the privilege (APPSEC-21).
const TRUNCATE_STATEMENT = /(^|;)\s*truncate\s+(table\s+)?(only\s+)?[a-z_."]/i;

// `drop constraint if exists X` immediately followed by `add constraint X` is
// the idempotent re-create idiom, not destruction. What matters is a
// constraint dropped and NOT restored.
//
// Order matters: an `add` that appears BEFORE the drop does not restore it.
// Comparing name sets alone would call `add X ... drop X` safe, which is the
// one shape that genuinely removes a constraint the migration had.
function unrestoredConstraintDrops(code) {
  const drops = [...code.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_"]+)/gi)]
    .map((m) => ({ name: m[1].replace(/"/g, "").toLowerCase(), at: m.index }));
  const adds = [...code.matchAll(/add\s+constraint\s+([a-z0-9_"]+)/gi)]
    .map((m) => ({ name: m[1].replace(/"/g, "").toLowerCase(), at: m.index }));

  const unrestored = drops.filter(
    (d) => !adds.some((a) => a.name === d.name && a.at > d.at),
  );
  return [...new Set(unrestored.map((d) => d.name))];
}

const findings = [];
for (const rel of files) {
  const sql = readFileSync(`${REPO}/${rel}`, "utf8");
  // Strip line comments so prose describing a risk is not mistaken for one.
  const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

  for (const [re, label] of FORBIDDEN) {
    if (re.test(code)) findings.push(`${rel}: ${label}`);
  }
  if (TRUNCATE_STATEMENT.test(code)) {
    findings.push(`${rel}: TRUNCATE statement`);
  }
  for (const name of unrestoredConstraintDrops(code)) {
    findings.push(`${rel}: DROP CONSTRAINT ${name} without re-adding it`);
  }
  // A DELETE against a tenant table. Fixture cleanup belongs in tests, and a
  // data repair belongs in a reviewed, separately-documented step.
  if (/\bdelete\s+from\s+public\./i.test(code)) {
    findings.push(`${rel}: DELETE FROM public.*`);
  }
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
