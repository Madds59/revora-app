// Release gate: no JWT-shaped literal may be embedded in tracked source.
//
// Why this exists: `.github/workflows/ci.yml` scans ADDED lines for secret-shaped
// strings and its pattern includes the bare JWT prefix `eyJ`. Two verification
// scripts previously inlined the PUBLIC local Supabase demo anon key, which tripped
// that gate and turned CI red. The key was not a real secret, but the scanner cannot
// distinguish a demo JWT from a leaked one and must not try.
//
// The failure mode this guards against is the tempting "fix": weakening the CI
// pattern, or excluding scripts/ from the scan, so that a genuinely leaked key would
// also sail through. This test keeps the source clean so the CI pattern can stay
// strict. It is deliberately independent of the CI workflow -- it scans the working
// tree rather than a diff, so it also catches a literal that predates the merge base.
//
// If this fails: resolve the key at run time (see scripts/lib/local-anon-key.mjs),
// do not add an exclusion here.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

// A JWS compact serialization always begins with a base64url-encoded JSON header,
// which for every practical algorithm starts `eyJ`. Two further dot-separated
// base64url segments distinguish a real token from the bare prefix appearing in
// prose (this file's own comments, for instance, must not match).
const JWT_LITERAL_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/;

const SCAN_DIRS = ["scripts", "src", "tests"];
const SCAN_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".json"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".turbo"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

test("release gate: no JWT literal is embedded in tracked source", () => {
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(APP_ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        if (JWT_LITERAL_RE.test(line)) {
          // Report location only. Never echo the matched token.
          offenders.push(`${relative(APP_ROOT, file)}:${index + 1}`);
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `JWT-shaped literal(s) found in source (locations only, token withheld): ${offenders.join(", ")}. ` +
      "Resolve the key at run time via scripts/lib/local-anon-key.mjs instead of inlining it.",
  );
});

test("positive control: the detector actually matches a JWT-shaped string", () => {
  // Assembled at run time from fragments so this control cannot itself trip the
  // scan above, and so a future refactor that neuters JWT_LITERAL_RE fails here
  // rather than silently passing the gate with an always-false regex.
  const synthetic = ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJzdWIiOiJjb250cm9sIn0", "c2lnbmF0dXJl"].join(".");
  assert.ok(
    JWT_LITERAL_RE.test(synthetic),
    "JWT_LITERAL_RE no longer matches a JWT-shaped string; the gate above cannot fail and is worthless",
  );
});

test("negative control: prose mentioning eyJ does not match", () => {
  assert.ok(
    !JWT_LITERAL_RE.test('the CI pattern includes the bare prefix "eyJ" for JWTs'),
    "JWT_LITERAL_RE matches prose; it would flag documentation and get excluded or weakened",
  );
});
