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

// SUBJECT SELECTION. Three contexts have to work. Two of them used to exit 1
// with nothing actually wrong:
//
//   * a branch or pull request -- audit the migrations it adds against
//     origin/main. This is the case that always worked.
//   * a push to `main` -- HEAD *is* origin/main, so that range is empty by
//     definition and the gate failed on every single merge. Audit what the
//     merge brought in, along the first parent, so there is still a real
//     subject on this side of the merge.
//   * a change that adds no migration at all -- docs, CI, application code.
//     Having nothing to audit is not the same as failing to audit.
//
// The guard that matters is kept: if the base cannot be resolved at all -- a
// shallow clone, a missing origin/main, a root commit with no parent -- that
// is UNAVAILABLE and still fails, because then a migration really could slip
// past unchecked.
const rev = (ref) => git(["rev-parse", ref]).trim();
const addedIn = (range) =>
  git(["diff", "--name-only", "--diff-filter=A", ...range, "--", "supabase/migrations/"])
    .split("\n").filter(Boolean);

let added;
let subject;
try {
  if (rev("HEAD") === rev("origin/main")) {
    added = addedIn(["HEAD^1", "HEAD"]);
    subject = "merge onto main (HEAD^1..HEAD)";
  } else {
    added = addedIn(["origin/main...HEAD"]);
    subject = "branch vs origin/main";
  }
} catch (err) {
  process.stderr.write(`cannot resolve the audit base: ${err.message}\n`);
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
  //
  // The allowlist is narrow and justified per entry, NOT a way to quiet the
  // gate: a table qualifies only if it holds no tenant data (no business_id)
  // and deleting from it is the table's designed behaviour. Everything else is
  // still flagged, including inside a DO block -- so `do $$ begin delete from
  // public.jobs; end $$;` is caught.
  const DELETE_ALLOWED = new Set([
    // Ephemeral rate-limit counters. consume_rate_limit()'s opportunistic
    // reaper deletes buckets whose window closed over a day ago; that is the
    // documented lifecycle for the table, and it carries no tenant rows.
    "auth_rate_limits",
  ]);
  for (const m of code.matchAll(/\bdelete\s+from\s+public\.([a-z0-9_"]+)/gi)) {
    const table = m[1].replace(/"/g, "").toLowerCase();
    if (!DELETE_ALLOWED.has(table)) {
      findings.push(`${rel}: DELETE FROM public.${table}`);
    }
  }
}

process.stdout.write(
  `migrations_checked=${files.length} subject="${subject}" findings=${findings.length}\n`,
);
if (files.length === 0) {
  // The base resolved and this change introduces no migration, so there is
  // nothing for this gate to say. Printing the resolved subject above is what
  // keeps the pass honest: a reader can see what was examined.
  process.stdout.write("MIGRATION_SAFETY_NOT_APPLICABLE\n");
  process.exit(0);
}
if (findings.length) {
  process.stdout.write(findings.map((f) => `  - ${f}`).join("\n") + "\n");
  process.stdout.write("MIGRATION_SAFETY_FAILED\n");
  process.exit(1);
}
process.stdout.write("MIGRATION_SAFETY_OK\n");
