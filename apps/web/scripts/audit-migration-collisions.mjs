#!/usr/bin/env node
// Rule C: a new migration number must be collision-free across every ref that
// could merge -- not just the current branch. 0031-0033 exist only on
// security/appsec-10-auth-hardening, which is exactly the trap: `ls` on main
// shows those numbers free.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../..");
const git = (args) =>
  execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" });

const localFiles = readdirSync(`${REPO}/supabase/migrations`)
  .filter((f) => /^\d{4}.*\.sql$/.test(f));

// Every migration filename visible on any local or remote ref.
const refs = git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"])
  .split("\n").map((r) => r.trim()).filter((r) => r && !r.endsWith("/HEAD"));

const byNumber = new Map(); // "0039" -> Set of basenames
const record = (name, where) => {
  const n = name.slice(0, 4);
  if (!byNumber.has(n)) byNumber.set(n, new Map());
  const m = byNumber.get(n);
  if (!m.has(name)) m.set(name, new Set());
  m.get(name).add(where);
};

for (const f of localFiles) record(f, "worktree");
for (const ref of refs) {
  let listed;
  try {
    listed = git(["ls-tree", "-r", "--name-only", ref, "--", "supabase/migrations/"]);
  } catch {
    continue;
  }
  for (const path of listed.split("\n").filter(Boolean)) {
    const base = path.replace("supabase/migrations/", "");
    if (/^\d{4}.*\.sql$/.test(base)) record(base, ref);
  }
}

const collisions = [];
for (const [num, names] of byNumber) {
  if (names.size > 1) {
    collisions.push(
      `${num}: ${[...names.entries()].map(([n, w]) => `${n} (${[...w].join(", ")})`).join(" vs ")}`,
    );
  }
}

const highest = [...byNumber.keys()].sort().pop();
process.stdout.write(
  `numbers=${byNumber.size} refs_scanned=${refs.length} highest=${highest} collisions=${collisions.length}\n`,
);
if (collisions.length) {
  process.stdout.write(collisions.map((c) => `  - ${c}`).join("\n") + "\n");
  process.stdout.write("MIGRATION_NUMBERING_COLLISION\n");
  process.exit(1);
}
process.stdout.write("MIGRATION_NUMBERING_OK\n");
