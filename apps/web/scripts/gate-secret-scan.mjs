// Local replication of the CI added-line secret scan (.github/workflows/ci.yml).
//
//   node scripts/gate-secret-scan.mjs
//
// WHY THIS EXISTS AS A SCRIPT rather than a one-liner: the obvious one-liner is
// wrong, and its wrongness is invisible. Running
//
//   git diff "$BASE" -- . | grep '^+' | grep -Ei "$PATTERN"
//
// locally reports ZERO matches for files you have just created, because `git diff`
// does not show UNTRACKED files. CI sees them, because by then they are committed.
// That exact hole produced a confident local "SECRET_SCAN_CLEAN" while CI was
// failing on 7 matches in those very files. A check that cannot fail is worse than
// no check, so this script accounts for untracked content explicitly.
//
// It reads the pattern and the exclusions from the workflow file itself rather than
// restating them, so the local gate cannot drift from the CI gate it approximates.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// This file lives at apps/web/scripts/, so the repo root is three levels up.
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const WORKFLOW = `${REPO_ROOT}/.github/workflows/ci.yml`;
const BASE = process.env.SECRET_SCAN_BASE || "origin/main";

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// Pull the live pattern out of the workflow so the two cannot diverge.
function ciPattern() {
  if (!existsSync(WORKFLOW)) {
    console.error(`Cannot read ${WORKFLOW}; refusing to guess the CI pattern.`);
    process.exit(1);
  }
  const line = readFileSync(WORKFLOW, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("PATTERN="));
  if (!line) {
    console.error("No PATTERN= line found in ci.yml; refusing to guess.");
    process.exit(1);
  }
  const raw = line.slice(line.indexOf("=") + 1).trim().replace(/^'|'$/g, "");
  return new RegExp(raw, "i");
}

const PATTERN = ciPattern();
const EXCLUDED = [/^apps\/web\/pnpm-lock\.yaml$/, /^\.github\//, /^docs\//];
const isExcluded = (file) => EXCLUDED.some((re) => re.test(file));

const hits = new Map();
const note = (file, count) => hits.set(file, (hits.get(file) ?? 0) + count);

// 1. Tracked changes vs the base, as CI sees them.
let currentFile = null;
for (const line of git(["diff", "--no-color", BASE, "--", "."]).split("\n")) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice(6);
    continue;
  }
  if (!currentFile || isExcluded(currentFile)) continue;
  if (line.startsWith("+") && !line.startsWith("+++") && PATTERN.test(line)) note(currentFile, 1);
}

// 2. Untracked files. Every line is an added line once committed -- this is the
//    half `git diff` omits and the reason this script exists.
const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
for (const file of untracked) {
  if (isExcluded(file)) continue;
  let content;
  try {
    content = readFileSync(`${REPO_ROOT}/${file}`, "utf8");
  } catch {
    continue; // binary or unreadable; CI's grep would skip it too
  }
  const count = content.split("\n").filter((l) => PATTERN.test(l)).length;
  if (count) note(file, count);
}

const total = [...hits.values()].reduce((a, b) => a + b, 0);

if (total === 0) {
  console.log(`base: ${BASE}`);
  console.log(`untracked files considered: ${untracked.length}`);
  console.log("SECRET_SCAN_CLEAN");
  process.exit(0);
}

// Locations only. Never print the matched content -- that is the whole point.
console.error(`base: ${BASE}`);
console.error(`Detected ${total} secret-like added line(s). Content is NOT printed.`);
for (const [file, count] of [...hits].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${count}\t${file}`);
}
console.error("\nDo not weaken the CI pattern or exclude these paths. Remove the literal instead.");
process.exit(1);
