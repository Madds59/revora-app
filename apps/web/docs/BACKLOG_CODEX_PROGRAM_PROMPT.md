# Revora Backlog — Codex Program Execution Brief

**From:** CEO + Senior Engineering Manager, Revora · **To:** Codex (implementing engineer)
**Mandate:** Implement the Revora backlog (F1–F7) in `apps/web`, **one feature per
branch, shipped green**, matching repo conventions exactly. This is a *program*
brief: §1–§2 apply to **every** feature; §3 is the order; §4 is the per-feature
spec. The decisions here are final.

> Companion specs in the same folder: [`RETAINER_CALCULATOR_CODEX_PROMPT.md`](./RETAINER_CALCULATOR_CODEX_PROMPT.md)
> (full F2 build), [`ROADMAP.md`](./ROADMAP.md), [`VEHICLE_INTELLIGENCE.md`](./VEHICLE_INTELLIGENCE.md),
> [`AUTH_ONBOARDING.md`](./AUTH_ONBOARDING.md), [`SUPER_ADMIN_BOOTSTRAP.md`](./SUPER_ADMIN_BOOTSTRAP.md),
> [`VALIDATION.md`](./VALIDATION.md).

---

## 1. Shared ground truth (repo conventions — verify in Phase 0, never assume)

- App: `apps/web` — Next.js 15 App Router, TS, Tailwind, shadcn/ui, Supabase, next-intl, Zod v4. No new app.
- **Tenancy:** `business_id` IS the tenant boundary (**no `tenants` table / no `tenant_id`**). Tables: `public.businesses`, `business_members`, `profiles`, `customers`, `vehicles`, `quotations`(+`quotation_items`), `jobs`, `complaints`, `approvals`, `notification_events`, `billing_plans`/`billing_invoices`, `platform_admins`, vehicle-intelligence tables.
- **Routing:** route groups are not in the URL. `[locale]` canonical (`/` → `/en`). New pages live under `src/app/[locale]/(dashboard|portal|auth|onboarding|admin)/…`.
- **Auth/roles:** `requireMembership()` → `{ member, business }`; `getUser()`. `member_role` = `super_admin, business_owner, manager, employee, customer` (no granular permission system). Role gates in `src/lib/permissions.ts` (`hasRole`, `canManage*`). Super-admin is platform-level via `public.is_platform_admin()` / `platform_admins`.
- **RLS:** business scope via `public.has_business_role(business_id, member_role[])`; cross-tenant admin via `public.is_platform_admin()`. Updated-at trigger `public.set_updated_at()`.
- **Migrations:** sequential, latest applied is `0024`. Claim the next free number at implementation time (F2 = `0025`, then increment per feature); verify the latest before each; never edit applied migrations.
- **Money/i18n:** all currency/number/date via `src/lib/formatters.ts` (`formatCurrency(value,currency)`, `formatNumber`, `formatDate` — forced `latn`/Western digits). Server totals: `src/lib/money.ts`. Every UI string via next-intl; **`src/messages/en.json` and `ar.json` stay key-for-key identical**; RTL must work. Localize labels only — keep stored enum/code constants in source.
- **NOT installed** (treat as absent unless you deliberately add + justify): PostHog, Sentry, Recharts, PDF libs, `stripe` SDK, Resend/SES, Twilio.
- **Patterns to mirror:** server-action forms (`FormState = { error?, message? }` + `useActionState`) — see `quotations/[id]/*-form.tsx` + `actions.ts`; pure-logic-in-`.js` + `types.ts` + Zod + `node:test` — see `src/lib/vehicle-intelligence/*` + `tests/vehicle-intelligence.test.mjs`.

## 2. Global guardrails (every feature; instant reject if violated)

Do **not** modify `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `/api/stripe/webhook`, applied migrations, auth/onboarding logic, or `account_intent` semantics (routing metadata, never authorization). New sequential migration per feature with **RLS enabled at creation**. **Server recomputes all money/authoritative state**; never trust client values. **Zod-validate every input.** **i18n parity** (en/ar identical keys) after any message change. **No undeclared dependency** — any new package is a deliberate `pnpm add` + lockfile + loud justification in the report, and external-provider features must degrade to a safe no-op when their env is absent. **Never run `build` and `typecheck` in parallel.** No secrets in code/logs/analytics.

**One feature = one branch = one PR.** Each feature must end **green** on the §5 validation loop before you start the next. Do not bundle features.

## 3. Delivery sequence (dependency-ordered)

`F1 → F2 → F3 → F4 → F5 → F6 → F7`

| F | Feature | Why here |
|---|---|---|
| F1 | Forgot-password | Smallest, standalone, high-value auth gap. Warm-up. |
| F2 | Retainer Pricing Calculator | Has a complete ready spec; **produces the tier model F3 reuses**. |
| F3 | Pricing & membership bundles | Reuses F2's tier model + `billing_plans`. |
| F4 | Business ratings | Standalone table + RLS; feeds Review-Scores KPI. |
| F5 | SMS + email notifications | Dispatch layer other features emit into; provider/env heavy. |
| F6 | VI AI search bar | Extends the shipped VI module + its safety/fallback path. |
| F7 | Mobile UX/UI enhancement | Cross-cutting polish; continuous; do last / ongoing. |

## 4. Per-feature briefs

### F1 — "Forgot password" self-service reset
- **Goal:** A user who forgot their password resets it without support.
- **Build:** Add a localized "Forgot password?" link on `(auth)/login`. New `(auth)/forgot-password` page → server action calling Supabase `auth.resetPasswordForEmail(email, { redirectTo: <locale>/reset-password })`. New `(auth)/reset-password` page (consumes the recovery link) → `auth.updateUser({ password })`. Reuse the existing auth action/`FormState` pattern, brand auth shell, and `sonner` toasts. Always show a neutral "if an account exists, a reset link was sent" response (no account enumeration).
- **i18n:** new `auth.forgotPassword` / `auth.resetPassword` namespaces (en + ar).
- **Guardrails:** do not change existing login/magic-link logic; confirm Supabase redirect URLs include the reset route (note as operator step); locale-aware redirect.
- **Acceptance:** request reset → email link → set new password → login. No enumeration. en/ar parity. Lint/build/typecheck/test green.

### F2 — Service Retainer Pricing Calculator
- **Build exactly** to [`RETAINER_CALCULATOR_CODEX_PROMPT.md`](./RETAINER_CALCULATOR_CODEX_PROMPT.md) (route `/<locale>/tools/retainer-calculator`, migration `0025`, pure calc core, server actions, scenarios, Essential/Growth/Premium tiers, print-PDF, no-op analytics). **Export the tier-generation model** from `src/lib/retainer/` as a reusable, documented function so F3 imports it (do not duplicate it later).
- **Acceptance:** as defined in that brief.

### F3 — Interactive pricing & membership bundles
- **Goal:** Owners configure customer-facing membership/pricing tiers; customers compare and select.
- **Build:** Owner config UI under `(dashboard)` to define bundles (reuse F2's tier model + `billing_plans`); a customer/portal comparison + selection view. Selection produces a quotation or initiates the existing billing/checkout flow — **do not** add Stripe price-sync (out of scope). If a table is needed, add `membership_bundles` (business-scoped, RLS) via the next migration; otherwise drive from `billing_plans`.
- **Decisions:** reuse F2 `calculate`/tier functions (no re-implementation); charts dependency-free (inline SVG/CSS); all copy i18n; money via formatters.
- **Guardrails:** server recomputes any price; no Stripe sync; RLS business-scoped; customers see only their business's published bundles.
- **Acceptance:** owner creates/edits/publishes bundles; customer compares + selects → quote/checkout; tenant-isolated; en/ar parity; green.

### F4 — Business ratings
- **Goal:** Customers rate businesses they've transacted with; surface an aggregate to the business.
- **Build:** Migration `business_ratings` (`id, business_id, customer_id, rating int 1..5, review text, created_at, updated_at`, unique `(business_id, customer_id)`, `set_updated_at` trigger). **RLS:** a customer may insert/update **their own** rating **only for a business they are a customer of** (mirror the customer-scoped pattern used for portal/complaint access); business members read ratings for their business; super-admin via `is_platform_admin()`; **no public read for now**. Portal UI for the customer to rate after a job/quote; dashboard shows aggregate (avg + count) — feeds the Review-Scores KPI.
- **Guardrails:** server validates the customer↔business relationship before insert; Zod 1–5; never expose other customers' identities to the business beyond what existing patterns allow; i18n.
- **Acceptance:** eligible customer rates once (updatable); ineligible blocked by RLS; dashboard shows aggregate; tenant-isolated; green.

### F5 — Automated SMS + email notifications
- **Goal:** Dispatch email + SMS on key events (job updates, status changes, quote sent, approval requested/decided, complaint updated/escalated) to staff **and** customers, honoring role + preferred language/channel.
- **Build:** Use `notification_events` as the durable queue (add columns/migration only if needed). A **dispatcher** (route handler or Supabase Edge Function) that reads pending events, renders localized templates, sends via providers, marks sent — **idempotent**. Providers behind a thin adapter: email = Resend or SES, SMS = Twilio; **all behind env**, and the whole dispatcher is a **safe no-op when provider env is absent** (like the analytics wrapper). Add a per-user/per-business **preferences** table (channel + language opt-in/out) via migration with RLS. Emit events from existing flows by **inserting into the queue** (do not rewrite those flows' core logic).
- **Decisions:** new deps (`resend`/`twilio`) are deliberate `pnpm add` + justification; localized templates (en/ar); respect quiet/opt-out; never include secrets/PII beyond what the channel needs.
- **Guardrails:** idempotent (no double-send), retry-safe, signature/secret only server-side, do not touch the Stripe webhook. Operator setup (provider keys, env names only) documented in the report.
- **Acceptance:** a job/approval/complaint event enqueues → dispatcher sends localized email (+ SMS if configured) once → marked sent; no-op cleanly with no provider env; prefs honored; green.

### F6 — Vehicle Intelligence AI search bar
- **Goal:** An AI search/guide bar inside the VI area that directs users on **what is required** / the next step (which VI tool, what inputs, what to do).
- **Build:** A search/assistant input on the VI dashboard hub that, from a free-text query, routes the user to the right VI tool and lists required inputs / next actions. Implement a **rule-based router first** (intent → tool + guidance), structured behind a clean interface so the existing `src/lib/vehicle-intelligence/openai.js` can optionally enrich it. **Reuse the VI safety + fallback path**: advisory-only, dangerous-symptom queries surface the stop-driving guidance, and it degrades to rule-based when `OPENAI_API_KEY` is absent. No new external dependency.
- **Guardrails:** do not weaken VI safety overrides; no AI call without the existing guarded wrapper; tenant-scoped; i18n; never invent vehicle facts.
- **Acceptance:** typical queries route to the correct tool with required-input guidance; dangerous-symptom query triggers safety guidance; works with no `OPENAI_API_KEY`; green.

### F7 — Mobile UX/UI enhancement
- **Goal:** Polished mobile experience across dashboard + portal; foundation for the planned `apps/mobile` Expo app.
- **Build:** Audit responsive behavior; convert dense tables to mobile card lists (reuse `MobileDataList`/`MobileDataCard`), fix touch targets, nav drawer, sticky actions, and RTL on small screens. Ship as small, reviewable per-area passes (one PR per area: customers, vehicles, quotations, jobs, complaints, portal, settings). No new dependency; no logic changes — presentation only.
- **Guardrails:** no behavior/data changes; preserve i18n + Western digits; verify in both `/en` and `/ar` at mobile widths.
- **Acceptance:** each area is usable and clean at ~375px in en + ar with no overflow/overlap; green.

## 5. Per-feature Definition of Done + validation loop

A feature is done when: it works end-to-end for the intended roles; unauthorized roles/customers are blocked by **RLS and** server guards; all money/authoritative state is server-recomputed; inputs are Zod-validated; UI is fully localized (en/ar key-parity) with Western-digit money and clean RTL; no undeclared dependency slipped in; and the loop below is green (from `apps/web`, sequential):
```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes   # exit 2 = sandbox-blocked, not a regression
```
Then assert en.json key set === ar.json key set. Add/extend tests with each feature (pure logic via `node:test`; RLS exercised by the live E2E harness when Supabase is reachable).

## 6. Reporting

After **each** feature: a short report — files created/modified, migration number + manual operator steps (apply migration, regenerate Supabase types, any new env names by **name only**), dependencies added with justification, tests run, validation results + i18n-parity check, and remaining risks. Open one PR per feature. Do not merge multiple features together.

## 7. Scope discipline (CEO mandate)

Build only F1–F7 as specified. Do **not**: add Stripe price-sync, build the Expo app, implement tokenized staff invitations, or call external AI/SMS/email providers without their env + a deliberate dependency + operator setup. Keep cores pure and provider-agnostic; structure for the future, build only what's in scope. Ship small, ship safe, ship green — one feature at a time.
