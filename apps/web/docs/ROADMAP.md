# Revora Roadmap

Living backlog for Revora (`apps/web`). Status as of 2026-06-15.
Execution brief for an agent: [BACKLOG_CODEX_PROGRAM_PROMPT.md](./BACKLOG_CODEX_PROGRAM_PROMPT.md).

## Delivered
- **VIN decode / auto-fill** — Vehicle Intelligence VIN decoder (public NHTSA, no key, safe fallback).
- **AI vehicle advisor** — AI diagnosis + DTC decoder + portal health-check, advisory-only with server-side safety overrides and rule-based fallback when `OPENAI_API_KEY` is absent.
- **i18n / RTL** — `/en` + `/ar`, shared UI/form copy, quotation builder + quotation detail localized.

## Planned with a ready spec
- **Service Retainer Pricing Calculator** — full build brief: [RETAINER_CALCULATOR_CODEX_PROMPT.md](./RETAINER_CALCULATOR_CODEX_PROMPT.md). Its Essential/Growth/Premium tier generator is the shared model for "pricing & membership bundles".

## Backlog (not built)

| # | Feature | Summary | Depends on / shares |
|---|---|---|---|
| F1 | **Forgot-password button** | Self-service "Forgot password?" link → Supabase `resetPasswordForEmail` → reset page. Locale-aware. | Standalone (auth). |
| F2 | **Service Retainer Pricing Calculator** | See ready spec above. | Produces the tier model used by F3. |
| F3 | **Interactive pricing & membership bundles** | Configurable tier/membership UI (owner sets, customer compares/selects). | Reuses F2 tier model + `billing_plans`/Stripe. |
| F4 | **Business ratings** | Customers rate businesses they've dealt with; feeds "Review Scores" KPI. | New `business_ratings` table + RLS. |
| F5 | **Automated SMS + email notifications** | Event-driven dispatch to staff + customers (jobs, quotes, approvals, complaints), honoring role + language/channel. | `notification_events` queue; Resend/SES + Twilio; per-user prefs. Other features emit into it. |
| F6 | **VI AI search bar** | AI search/guide bar inside Vehicle Intelligence that directs users on what's required / next step. Advisory-only. | Extends the shipped VI module + its safety/fallback path. |
| F7 | **Mobile UX/UI enhancement** | Polish responsive/mobile across dashboard + portal (touch targets, nav, tables→cards, RTL). | Cross-cutting; feeds the planned `apps/mobile` Expo app. |

## Suggested delivery order
F1 (quick win) → F2 (ready spec, yields tier model) → F3 (reuses F2) → F4 → F5 (dispatch layer others emit into) → F6 → F7 (cross-cutting, continuous).

## Non-negotiable guardrails (every feature)
Do not touch auth/RLS/middleware/`/api/stripe/webhook`/applied migrations or `account_intent` semantics. New sequential migration per feature with RLS enabled. Server recomputes all money; never trust client totals. Zod-validate inputs. Every UI string via next-intl with **en.json/ar.json key parity**; numbers/money via `src/lib/formatters.ts` (Western digits). No undeclared dependencies. Run `lint`, `build`, `typecheck`, `test` (never build+typecheck in parallel); keep smoke green.
