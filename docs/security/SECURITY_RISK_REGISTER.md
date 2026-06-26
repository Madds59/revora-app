# Security Risk Register

Master log of open security/privacy risk. Severity model: see
[REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §4 (P0 Critical / P1 High /
P2 Medium / P3 Low). Detailed evidence for AppSec items lives in
[APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) — this register is the
cross-cutting tracker referenced by finding ID.

Audit baseline: `origin/main` @ `a3d21f078ff1e253a7050502d2b473a25271d9aa`,
assessed during the security/privacy assurance pass on branch
`security/revora-trust-safety-program`.

## Open Risk Items

| ID | Severity | Title | Area | Status | Owner |
|---|---|---|---|---|---|
| APPSEC-07 | P1 | Raw PostgREST/DB error messages returned to end users across the action/mutation layer (server actions and service functions) — grew from an initial 14-file sub-agent finding to 22 files once a full-tree grep was run during the fix | AppSec / Error handling | **Fixed in this pass** (generic message + server-side log) for every action/mutation-layer call site found | AppSec Reviewer |
| APPSEC-07b | P2 | Same raw-error pattern, but in the read-path: ~23 page components render a Supabase query's `error.message` directly in JSX | AppSec / Error handling | Open — discovered while fixing APPSEC-07, intentionally not bundled into this pass (distinct, larger pattern; lower urgency since SELECT failures are rarer than mutation failures); recommend as a dedicated follow-up (see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) APPSEC-07b) | AppSec Reviewer |
| APPSEC-08 | P3 | `signUp` Supabase Auth SDK error can reveal an email is already registered (account enumeration) | AppSec / Auth UX | Open — documented only, no behavior change made (product/UX decision, not a raw-DB-error bug) | AppSec Reviewer |
| APPSEC-09 | P2 | Most dashboard/portal server actions parse `FormData` manually with no schema (zod) validation; RLS is the only backstop | AppSec / Input validation | Open — future hardening | AppSec Reviewer |
| APPSEC-10 | P3 | Team invitations (`business_invitations`) never expire; claimable indefinitely by anyone who later signs up with the invited email | AppSec / Account safety | Open — low exploitability (requires control of the invited mailbox); recommend adding `expires_at` in a future migration | AppSec Reviewer |
| APPSEC-11 | P3 | Customer-portal quote detail page relies solely on RLS for ownership scoping; portal complaint detail page has both RLS *and* an explicit code-level ownership check | AppSec / Defense-in-depth | Open — recommend matching the complaint page's pattern | AppSec Reviewer |
| DEVSECOPS-01 | P2 | No 24/7 on-call or incident rotation; single operator | DevSecOps / Process | Accepted at current stage; revisit before scaling beyond a single operator | DevSecOps Owner |
| DEVSECOPS-02 | P2 | Secret-pattern scanning is a manual grep command, not a CI gate | DevSecOps / CI | Open — recommend wiring the existing grep into CI (see [DEVSECOPS_SECURITY_RUNBOOK.md](DEVSECOPS_SECURITY_RUNBOOK.md)) | DevSecOps Owner |
| DEVSECOPS-03 | P2 | No CI workflow exists (`.github/workflows/` absent) — lint/typecheck/build/test/smoke are run manually, not enforced on every PR | DevSecOps / CI | Open — recommend adding a GitHub Actions workflow running the Phase 10 validation commands on every PR | DevSecOps Owner |
| QA-01 | P2 | No automated test exercises a live cross-tenant RLS denial (Business A attempting to read Business B's row and being rejected) | QA / Test coverage | Open — blocked locally by no Docker/local Supabase stack; manual QA script provided as interim coverage (see [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md)) | QA/Security Tester |
| PENTEST-01 | Informational | No external penetration test has been performed | Pentest | Open — pre-launch requirement; prep package delivered in this pass (see [EXTERNAL_PENTEST_BRIEF.md](EXTERNAL_PENTEST_BRIEF.md)) | External Pentest Prep Lead |
| LEGAL-01 | Informational | No qualified legal review of Privacy Policy / Terms / UAE-GCC notification compliance | Legal/Privacy | Open — **blocks live SMS/email activation and real customer-wide rollout** per program rules; checklist delivered in this pass (see [LEGAL_PRIVACY_REVIEW_CHECKLIST.md](LEGAL_PRIVACY_REVIEW_CHECKLIST.md)) | Legal/Privacy Advisory Coordinator |

No P0 (Critical) findings were identified in this pass.

## Verified Controls (no open risk — recorded for traceability)

These were specifically checked because they map to the program's non-negotiables and
came back clean. Listed here so future audits know they were tested, not assumed.

- `account_intent` is used exclusively for onboarding/routing redirects
  (`apps/web/src/lib/auth.ts`); it is never referenced by any RLS policy or
  authorization check. Confirmed by full-tree search.
- All 46 application tables created across `supabase/migrations/0001`–`0030` have
  `ENABLE ROW LEVEL SECURITY` set.
- `platform_admins` / `is_super_admin()` is table-based, `SECURITY DEFINER`-guarded,
  and self-elevation is explicitly blocked in `admin_set_super_admin()`.
- Stripe webhook (`apps/web/src/app/api/stripe/webhook/route.ts`) validates the
  signature against the raw request body, using constant-time comparison, before any
  parsing.
- Notification live-send requires three independent gates (two env flags + a
  per-business DB flag) plus a dispatch secret header; default state is disabled.
- AI Vehicle Intelligence VIN/spec data is sourced from the NHTSA vPIC API, not
  LLM free-generation; dangerous self-repair instructions are stripped by an
  allowlist/keyword filter and critical-severity cases are forced to a
  "stop driving, contact workshop" response.
- No non-`NEXT_PUBLIC_` secret-shaped environment variable is referenced from
  client-side (`"use client"`) code.

## Closed / Historical

| ID | Title | Resolution |
|---|---|---|
| — | — | None yet — register created in this pass. |

## Review Cadence

This register should be revisited at minimum: (a) every time a release touches one of
the high-risk areas in [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8,
(b) before any external pentest, (c) before any production migration, (d) before
enabling live notification sending.
