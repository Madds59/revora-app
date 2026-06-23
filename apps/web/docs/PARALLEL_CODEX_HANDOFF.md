# Parallel Codex Hand-off — Backlog Execution (alongside Claude on F3)

**From:** CEO + Senior Engineering Manager · **To:** Codex (parallel implementing engineer)
**Context:** Claude is building **F3 (Pricing & Membership Bundles)** on
`feature/pricing-membership-bundles`. You take the **other** backlog features in
parallel. Full per-feature detail and conventions are in
[`BACKLOG_CODEX_PROGRAM_PROMPT.md`](./BACKLOG_CODEX_PROGRAM_PROMPT.md) — read it
first; this file is the **orchestration addendum** (ownership, order, conflict
rules, and corrections). Where they differ, this file wins.

## Your queue (in order)
1. **F1 — Forgot-password** (auth). Smallest, fully independent. Start here.
2. **F4 — Business ratings** (new table + portal/dashboard).
3. **F6 — Vehicle Intelligence AI search bar** (extends the shipped VI module).
4. **F5 — SMS + email notifications** (dispatch layer; provider/env-heavy).

**Do NOT touch F3 or F7.** F3 (pricing/membership bundles) is Claude's. F7
(mobile UX) is deferred until F1–F6 land (it touches everything and would
conflict). One feature = one branch = one PR = green before the next.

## Ownership / no-collision rules (critical for parallel work)
- **Claude owns and you must not edit:** `src/lib/retainer/**`,
  `src/components/retainer-calculator/**`, anything named `membership_bundles` /
  `bundles`, and **migration `0026`** (reserved for F3).
- **Migration numbers (sequential, no reuse):** F3 = `0026` (Claude), **F4 =
  `0027`**. **`0028` is intentionally skipped — a reserved historical slot** (it
  was originally penciled in for F5 but never created). **`0029` =
  `0029_launch_ops_foundation.sql` (Launch Ops Foundation).** **F5 prefs/queue
  must therefore use `0030` or the next free number** if it needs schema.
  **Always `git fetch origin && check the latest migration on `origin/main`
  before creating one**; if Claude or a prior PR already took a number, take the
  next. Never edit an applied/merged migration.
- **Branch per feature off the latest `origin/main`.** Before opening each PR:
  `git fetch origin && git rebase origin/main`, re-run validation, then PR.
  Merge features sequentially; never merge two unrebased features together.
- **Shared files — additive only, resolve by keeping both:**
  - `src/messages/en.json` + `ar.json`: each feature adds its **own top-level
    namespace** — F1 `auth.forgotPassword`/`auth.resetPassword`, F4 `ratings`,
    F6 `viSearch`, F5 `notifications`. On conflict, keep **both** namespaces.
    **Re-run the en/ar key-parity check after every merge** (en key set must
    equal ar key set).
  - `dashboard-nav.tsx` / `portal-nav.tsx` / nav layouts: additive entries;
    resolve by keeping both entries.
  - `src/lib/permissions.ts`: add your own `can*` helper; don't modify others'.
  - `src/lib/database.types.ts` is hand-authored — extend additively for your new
    table; don't overwrite. Regenerate only via the project's codegen, then
    re-layer named exports.

## Repo corrections (found during F2 review — apply these)
- Admin/cross-tenant RLS: use **`public.is_platform_admin()`** (defined in
  `0024`), the current convention — not the older `is_super_admin()`.
- **`billing_plans` does not exist** under that name. For anything plan-related,
  add a purpose-built table; do not assume a billing table.
- Local sandbox DB may be **drifted** (behind `0024`). Verify new migrations the
  safe way: apply inside a `BEGIN; … ROLLBACK;` transaction via
  `docker exec -i supabase_db_<project> psql -U postgres -d postgres
  -v ON_ERROR_STOP=1` (stub any missing prerequisite function), so the SQL is
  proven without mutating the DB.

## Global guardrails (every feature — from the program brief, restated)
Do not modify `middleware.ts`, `supabase/middleware.ts`, `/api/stripe/webhook`,
applied migrations, auth/onboarding core, or `account_intent` semantics. New
sequential migration per feature with **RLS enabled**. **Server recomputes all
authoritative state**; Zod-validate inputs. **i18n parity** (en/ar identical
keys); money/numbers via `src/lib/formatters.ts` (Western digits). **No
undeclared dependency** — external providers (Resend/Twilio/PostHog/Sentry) are a
deliberate `pnpm add` + justification, and must degrade to a **safe no-op** when
their env is absent. **Never run `build` and `typecheck` in parallel.** No
secrets in code/logs/analytics.

## Per-feature specs (condensed; full detail in the program brief §4)
- **F1 Forgot-password:** localized "Forgot password?" link on `(auth)/login` →
  `(auth)/forgot-password` (Supabase `resetPasswordForEmail`, neutral
  "if an account exists…" response, no enumeration) → `(auth)/reset-password`
  (`updateUser({ password })`). Reuse the auth `FormState`/action pattern + brand
  shell. New `auth.forgotPassword`/`auth.resetPassword` namespaces. Operator note:
  add the reset route to Supabase redirect URLs.
- **F4 Business ratings:** migration `0027` → `business_ratings` (`business_id`,
  `customer_id`, `rating int 1..5`, `review text`, timestamps, unique
  `(business_id, customer_id)`, `set_updated_at` trigger). RLS: a customer
  inserts/updates **their own** rating **only** for a business they're a customer
  of (`exists (select 1 from public.customers c where c.business_id =
  business_ratings.business_id and c.app_user_id = auth.uid())`); members read
  their business's ratings; `is_platform_admin()` cross-tenant; **no public
  read**. Portal rate UI; dashboard aggregate (avg + count) for the Review-Scores
  KPI. Server validates the customer↔business link before insert; Zod 1–5.
- **F6 VI AI search bar:** a search/guide input on the VI hub that routes a
  free-text query to the right VI tool and lists required inputs / next steps.
  **Rule-based router first**, structured behind an interface so
  `src/lib/vehicle-intelligence/openai.js` can optionally enrich it. **Reuse the
  VI safety + fallback path** (advisory-only; dangerous queries surface
  stop-driving guidance; degrade to rule-based with no `OPENAI_API_KEY`). No new
  dependency. New `viSearch` namespace.
- **F5 SMS + email notifications:** `notification_events` as the durable queue
  (extend via migration only if needed) + a **dispatcher** (route handler / Edge
  Function) that renders localized templates and sends via a thin adapter
  (email = Resend/SES, SMS = Twilio) — **all behind env, whole dispatcher a safe
  no-op when provider env is absent**. Add a per-user/business **preferences**
  table (migration, RLS). Existing flows **emit by inserting into the queue**;
  don't rewrite their core. Idempotent (no double-send), retry-safe. New deps are
  deliberate; document operator env names (names only) in the report.

## Per-feature Definition of Done & loop (from `apps/web`, sequential)
Works for intended roles; unauthorized/customers blocked by **RLS and** server
guards; authoritative state server-computed; inputs Zod-validated; fully
localized (en/ar parity) with Western-digit money and clean RTL; no undeclared
dependency; tests added (pure logic via `node:test`).
```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes   # exit 2 = sandbox-blocked
```
Then assert en.json key set === ar.json key set. **One PR per feature**, rebased
on `origin/main`, with a short report (files, migration number + operator steps,
deps added + justification, validation + parity results, risks). Do not bundle
features or merge into Claude's F3 branch.
