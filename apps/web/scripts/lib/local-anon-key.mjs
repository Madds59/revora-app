import { execFileSync } from "node:child_process";

/**
 * Resolve the LOCAL Supabase anon key without embedding a JWT literal in source.
 *
 * Why this exists rather than a hardcoded fallback:
 * `.github/workflows/ci.yml` scans ADDED lines for secret-shaped strings, and its
 * pattern includes the three-character JWT header prefix. The local demo key is
 * public and not a real secret, but the scanner cannot tell a demo token from a
 * leaked one -- and it should not try. Inlining one makes every new script trip the
 * gate, so the gate gets weakened or the script gets excluded. Both are worse than
 * resolving the key at run time. Do NOT reintroduce a literal here, and do NOT relax
 * the CI pattern. (This comment deliberately does not spell the prefix out: doing so
 * would make this very file trip the scanner, which is how the first attempt failed.)
 *
 * Resolution order, most explicit first:
 *   1. SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY from the environment.
 *   2. `supabase status -o env`, the authoritative source for the running stack.
 *      This also makes the scripts work against a non-default local stack, which
 *      the hardcoded key never did.
 * Fails loudly with an actionable message rather than falling back to a guess: a
 * verification script that runs with the wrong key would report a false denial.
 */
export function resolveLocalAnonKey() {
  const fromEnv =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (fromEnv) return fromEnv;

  try {
    const out = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = out.match(/^ANON_KEY="?([^"\n]+)"?$/m);
    if (match?.[1]) return match[1];
  } catch {
    // Fall through to the actionable error below.
  }

  console.error(
    [
      "Could not resolve the local Supabase anon key.",
      "",
      "Fix one of these, then re-run:",
      "  - start the local stack:  supabase start",
      "  - or export it directly:  export SUPABASE_ANON_KEY=<local anon key>",
      "",
      "This script deliberately has no hardcoded key fallback (see the comment in",
      "scripts/lib/local-anon-key.mjs).",
    ].join("\n"),
  );
  process.exit(1);
}
