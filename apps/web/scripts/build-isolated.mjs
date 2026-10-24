#!/usr/bin/env node
// `next build` in a checkout of its own, so it cannot collide with `next dev`.
//
// `next dev` and `next build` both own .next. Running a build while a dev
// server is live in the same folder makes the build fail during "Collecting
// page data" with PageNotFoundError for pages that plainly exist -- a failure
// that looks like a code defect and is not one. That is a bad way to learn
// whether a change builds, so this verifies in a disposable git worktree with
// its own .next, with node_modules symlinked back.
//
// It builds the WORKING TREE, not HEAD: uncommitted changes are copied in, so
// what gets verified is what is on disk.
//
//   node scripts/build-isolated.mjs          # isolate only if a dev server is up
//   node scripts/build-isolated.mjs --force  # always isolate
//
// Prints BUILD_OK on success so a gate has a success-only token to match.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(APP, "..", "..");

const git = (...args) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

/** Is a dev server holding this app's .next? */
function devServerRunning() {
  const ps = spawnSync("ps", ["ax", "-o", "command="], { encoding: "utf8" });
  return (ps.stdout ?? "")
    .split("\n")
    .some((line) => line.includes(join(APP, "node_modules")) && line.includes("next") &&
      / dev\b/.test(line));
}

function runBuild(appDir) {
  const next = join(appDir, "node_modules", ".bin", "next");
  const res = spawnSync(next, ["build"], { cwd: appDir, stdio: "inherit" });
  return res.status === 0;
}

const force = process.argv.includes("--force");
const isolate = force || devServerRunning();

if (!isolate) {
  process.stdout.write("no dev server detected -- building in place\n");
  process.exit(runBuild(APP) ? (process.stdout.write("BUILD_OK\n"), 0) : 1);
}

process.stdout.write("dev server owns .next -- building in an isolated worktree\n");

const work = mkdtempSync(join(tmpdir(), "revora-build-"));
let ok = false;
try {
  git("worktree", "add", "--detach", work, "HEAD");
  const workApp = join(work, "apps", "web");

  // Copy the working tree's own changes over the checkout, so the build
  // verifies what is on disk rather than the last commit.
  for (const entry of git("status", "--porcelain").split("\n").filter(Boolean)) {
    // `XY path`, or `R  old -> new` for a rename: only the destination matters.
    const raw = entry.slice(3).trim();
    const path = (raw.includes(" -> ") ? raw.split(" -> ").pop() : raw)
      .replace(/^"|"$/g, "");
    if (path.includes("node_modules") || path.includes(".next/")) continue;
    const from = join(REPO, path);
    if (!existsSync(from)) continue; // deleted in the working tree
    const to = join(work, path);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }

  symlinkSync(join(APP, "node_modules"), join(workApp, "node_modules"));
  if (existsSync(join(APP, ".env.local"))) {
    cpSync(join(APP, ".env.local"), join(workApp, ".env.local"));
  }

  ok = runBuild(workApp);
} finally {
  rmSync(work, { recursive: true, force: true });
  try {
    git("worktree", "prune");
  } catch {
    /* pruning is best-effort cleanup */
  }
}

if (!ok) {
  process.stdout.write("BUILD_FAILED\n");
  process.exit(1);
}
process.stdout.write("BUILD_OK\n");
