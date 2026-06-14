# Epic: Arabic (RTL) Localization

**Goal:** First-class Arabic support — full RTL layout and Arabic UI copy, switchable EN/AR, with locale persisted per user (staff `profiles.preferred_language`) and per customer (`customers.preferred_language`, already in the schema). Revora is UAE-first; this is the largest unrealized UX requirement.

**Key finding (measured 2026-06-14):** the codebase is already ~94% logical-property based — **110** logical class usages (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rtl:`) vs only **~7 real** physical-direction occurrences (`left-2`/`right-2` in UI primitives, one `text-left`). **Direction (RTL) is cheap; translation is the bulk of the effort.**

---

## Phase 0 — Decisions & foundations *(do first; ~0.5 day)*
**DECISIONS LOCKED (2026-06-14):**
1. **i18n library → Hybrid: next-intl core + discipline.** next-intl handles routing, ICU (Arabic 6-form plurals), RSC, and AED/date formatting. Layered on top: **type-safe message keys** (augment the messages type), **RSC-first / lean-client** (translate in Server Components, pass strings as props), a **thin `lib/i18n` wrapper** (locale config + `dir` resolver + Western-digit formatters), and **namespaced catalogs** (`common/auth/portal/quotes/complaints/...`) for incremental extraction.
2. **Routing → URL-prefixed `/en` `/ar`.** All routes move under `app/[locale]/`. next-intl `createMiddleware` must be **composed with the existing Supabase auth middleware** (`src/middleware.ts`). Per-locale URLs (SEO-ready).
3. **Arabic font → Cairo** (via `next/font/google`), applied for `dir=rtl`; keep Geist for Latin + numerals.
4. **Digit style → Western 0–9 everywhere** (both languages). Extend `lib/money.ts` AED formatting accordingly.
5. **Translation source → deferred to Phase 2** (decide professional vs in-house when copy extraction begins).

Wiring: set `<html lang dir>` from the route locale (`dir="rtl"` when `ar`).

## Phase 1 — RTL direction correctness *(high priority; ~2–4 days)*
Cheap given logical props already pervasive.
- Activate dynamic `dir` switching.
- Fix the ~7 physical occurrences (`left-2`/`right-2` in `select.tsx`/`dropdown-menu.tsx` indicators, stray `text-left`).
- Verify mirrored chrome: sidebar drawer slides from inline-start, dropdown/select alignment, auth split-screen grid order, dialogs.
- Directional icons: ensure arrows/chevrons use `rtl:rotate-180` (several already do, e.g. dashboard/portal `ArrowRight`).
- **Isolate LTR data inside RTL**: VINs, plate numbers, phone numbers, emails, AED amounts → wrap with `dir="ltr"`/`<bdi>` so they don't visually scramble.
- Bidirectional visual QA pass on every screen.

## Phase 2 — Translation infrastructure + extraction *(high priority; infra ~1–2 days, extraction ~1–2 weeks incremental)*
- Install/configure next-intl provider; `messages/en.json` + `messages/ar.json`.
- Extract hardcoded UI strings (≈61 files carry placeholder/title/aria-label attrs, plus all JSX text, nav labels, buttons, toasts, empty/loading/edge-state copy). Replace with `useTranslations()` / `getTranslations()` (RSC-safe).
- Localize **Zod validation messages** and server-action error/success strings (toasts).
- Locale-aware formatting via `Intl`: AED currency (extend `lib/money.ts`), dates/times, relative times.
- **Extraction order = customer-facing first:** auth → customer portal (home, quote approval, complaints) → quotes/complaints staff screens → CRM/settings → internal/admin. This front-loads the surfaces where Arabic matters most.

## Phase 3 — Language selection & persistence *(medium; ~1 day)*
- **Language switcher** UI — pair it with the existing `ThemeToggle` in the account-menu dropdown (EN / العربية).
- Persist locale to a cookie; for authenticated users sync to `profiles.preferred_language`. **Portal auto-selects the customer's `preferred_language`** on entry (data already exists) — a strong trust touch.
- Align UI locale with `quotations.language` / customer preference where relevant.

## Phase 4 — Content & communications *(medium; ongoing)*
- Professional Arabic copy review.
- Localized transactional emails/notifications.
- **Arabic (RTL) PDF** quotes/invoices — its own sub-challenge (RTL shaping in the PDF renderer); scope separately.

## Phase 5 — QA, a11y, performance *(ongoing)*
- Test matrix = 2 themes × 2 directions = 4 combinations per screen.
- Accessibility: correct `lang` on mixed-language content; screen-reader pass in Arabic.
- Arabic font subsetting / performance budget.

---

## Recommended sequencing
**Phase 0 → Phase 1 (ship RTL direction early)** — it's cheap now and gets more expensive as screens accrue physical-property debt; locking direction discipline early protects every future screen. **Then Phase 2 infra immediately** (so new code is authored translation-ready), with **string extraction incremental, customer-facing first**. Phase 3 switcher slots in once AR copy exists for the first surfaces. Phases 4–5 run continuously.

**Rough total:** ~1.5–2 weeks of focused work to "Arabic-complete" the customer-facing surfaces; full coverage + comms is multi-week and partly ongoing translation work.

## Open decisions for the user
i18n library · routing (cookie vs prefix) · Arabic font · digit style · translation source. Phase 0 can't start until these are chosen.
