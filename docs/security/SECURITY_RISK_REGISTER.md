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
| APPSEC-08 | P3 | `signUp` Supabase Auth SDK error can reveal an email is already registered (account enumeration) | AppSec / Auth UX | Open — documented only, no behavior change made (product/UX decision, not a raw-DB-error bug) | AppSec Reviewer |
| APPSEC-09 | P2 | Most dashboard/portal server actions parse `FormData` manually with no schema (zod) validation; RLS is the only backstop | AppSec / Input validation | **Partially fixed — Phases 1, 2, 3, 4A, 4B and 4C complete.** Phase 1 (merged): quotation/job/complaint dashboard actions validate all external input via the `lib/validation` Zod layer before mutation; `addComplaintMessage` `business_id` is session-derived. Phase 2 (branch `security/appsec-09-phase-2-portal-actions`): portal `createComplaint`/`addComplaintReply`/`approveQuote`/`rejectQuote` validate via `safeParse`, mutate only with session-derived identity, and perform explicit ownership + state checks before quote/complaint mutations with non-enumerating errors. Phase 3 (branch `security/appsec-09-phase-3-customers-vehicles-settings`): customer, vehicle and business-settings/invitation/logo actions validate via `safeParse` and persist session-derived identity; `updateCustomer` and `revokeInvitation` gained explicit `business_id` scoping (previously RLS-only) and `uploadBusinessLogo` now verifies the client-supplied Storage path is inside the authenticated business's branding namespace. Phase 4A (branch `security/appsec-09-phase-4a-evidence-storage`): the evidence/attachment Storage-path finding is **fixed at both boundaries**. Write time: `recordComplaintEvidence` and `uploadDocument` validate all input and pin the object path to the authenticated/ownership-verified business, namespace **and parent resource** (new `<business>/<namespace>/<resource-id>/<object>` grammar — no policy or migration change needed), persisting only verified components; document links are ownership-checked first. Read time: `signOwnedStorageObject()` re-authorizes every **stored** path against the row's server-verified business/namespace/resource before the service role signs it, so pre-existing or corrupted rows cannot yield a cross-tenant signed URL; unbound legacy objects are staff-viewable but **fail closed for portal customers**. Local QA (8/8) confirmed a directly-invoked RPC still stores a cross-tenant path while the read guard refuses to sign it. Residual: standalone `documents` uploads have no single owning resource and stay business-scoped by design. Phase 4B (branch `security/appsec-09-phase-4b-vehicle-media`) fixed `uploadVehicleMediaAction`: server-selected bucket, canonical vehicle-bound path, vehicle resolved under the authenticated business, customer taken from the verified vehicle row; a release rule plus an explicit call-site registry test now require stored values to be revalidated before crossing privileged boundaries. Phase 4C hardened the notification service (queue-time validation; dispatch-time revalidation of claimed rows, with destinations re-derived from the verified customer rather than stored recipient columns; provider failures normalized; live send still disabled). Phase 4D (branch `security/appsec-09-admin-mutations`) covers the platform-administration surface: authorization there was already sound at two independent layers (`requireSuperAdmin()` → `platform_admins`, plus every `admin_*` RPC re-checking `is_super_admin()` as SECURITY DEFINER, with no service-role client anywhere in `/admin`), so the fix is the missing *input* half of the standard — both admin mutations now `safeParse` before their RPC, and the super-admin grant/revoke direction must be stated explicitly instead of defaulting to **grant** when the hidden `make_admin` field was absent. Admin list pages bound their own page size. Phase 4D also surfaced APPSEC-12 (no audit trail on `platform_admins`), documented not fixed. Remaining boundaries (onboarding/billing) are Phase 4E, along with one adjacent finding deliberately left unfixed: no product-wide maximum upload size is defined anywhere. See [INPUT_VALIDATION_STANDARD.md](INPUT_VALIDATION_STANDARD.md). **Not fully closed** — repository-wide coverage not yet proven. | AppSec Reviewer |
| APPSEC-12 | P2 | Granting or revoking platform administration (`platform_admins`) writes **no audit record** — that table has no `audit_row_change()` trigger, unlike the 14 tenant tables that do | AppSec / Audit integrity | **Open — documented, not fixed in APPSEC-09 Phase 4D.** Found while inventorying the admin surface. Every other high-impact table (`businesses`, `business_members`, `subscriptions`, …) carries the `audit_row_change()` trigger, but `platform_admins` does not, so the single highest-privilege mutation in the product leaves no forensic trail of *who* granted or revoked global authority and *when*. Closing it needs either an audit trigger on `platform_admins` or an INSERT policy on `audit_events` (which today has RLS enabled with a SELECT-only policy, so the app cannot write audit rows under the caller's own RLS-scoped client) — **both are migration/RLS changes, explicitly out of scope for the Phase 4D branch.** Mitigating factors: the mutation is restricted to verified platform admins at two independent layers, self-revocation is blocked in the RPC, and the current roster is always inspectable via `/admin/admins` (`admin_list_super_admins`) — it is *history*, not current state, that is missing. Runtime QA case ADM-17 confirms a grant/revoke produces zero `audit_events` rows. Recommend an audit trigger on `platform_admins` in the next migration; not pilot-blocking at single-operator scale, but should close before platform-admin access is delegated more widely. | AppSec Reviewer |
| APPSEC-10 | P3 | Team invitations (`business_invitations`) never expire; claimable indefinitely by anyone who later signs up with the invited email | AppSec / Account safety | **Open** — low exploitability (requires control of the invited mailbox); recommend adding `expires_at` in a future migration. Note: APPSEC-09 Phase 3 validated invitation *payloads* (email shape, strict `manager`/`employee` role allowlist, session-derived business/inviter, business-scoped revocation) but deliberately did **not** implement expiry — no `expires_at`, no enforcement, no migration — so this finding is unchanged and remains Open. | AppSec Reviewer |
| APPSEC-11 | P3 | Customer-portal quote detail page relies solely on RLS for ownership scoping; portal complaint detail page has both RLS *and* an explicit code-level ownership check | AppSec / Defense-in-depth | **Fixed** (APPSEC-09 Phase 2, branch `security/appsec-09-phase-2-portal-actions`): the quote detail page now performs the complaint-page-style explicit ownership check, and `approveQuote`/`rejectQuote`/`addComplaintReply` each query and verify session ownership + allowed state before mutating, with a non-enumerating response; regression tests assert the pattern. RLS remains the enforcement backstop. | AppSec Reviewer |
| DEVSECOPS-01 | P2 | No 24/7 on-call or incident rotation; single operator | DevSecOps / Process | Accepted at current stage; revisit before scaling beyond a single operator | DevSecOps Owner |
| DEVSECOPS-02 | P2 | Secret-pattern scanning is a manual grep command, not a CI gate | DevSecOps / CI | **Fixed on branch `devsecops/ci-validation-workflow`** (folded into the CI workflow's diff-scoped secret-scan step); activates on merge. See [CI_VALIDATION_WORKFLOW.md](CI_VALIDATION_WORKFLOW.md) | DevSecOps Owner |
| DEVSECOPS-03 | P2 | No CI workflow exists (`.github/workflows/` absent) — lint/typecheck/build/test/smoke are run manually, not enforced on every PR | DevSecOps / CI | **Fixed on branch `devsecops/ci-validation-workflow`** — `.github/workflows/ci.yml` runs lint/build/typecheck/test/whitespace/secret-scan on every PR + push to main, plus a read-only prod route smoke on push/dispatch. Commands validated locally under a CI-equivalent (placeholder, no-secrets) env; YAML syntax-checked. Activates on first push/PR. See [CI_VALIDATION_WORKFLOW.md](CI_VALIDATION_WORKFLOW.md) | DevSecOps Owner |
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
| APPSEC-07 | Raw PostgREST/DB error messages returned to end users across the action/mutation layer | Fixed (generic message + server-side `console.error`) across 22 files (grew from an initial 14-file estimate to 22 once a full-tree grep was run during the fix). See [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) APPSEC-07. |
| APPSEC-07b | Same raw-error pattern in the read-path: page components rendering a Supabase query's `error.message` directly in JSX | Fixed in a follow-up pass on the same branch — 20 files / 25 sites (exact count; the original "~23 files" was an estimate). Guarded by a new tree-wide pattern-based regression test (`security-regressions.test.mjs`), not just a closed file list, so future pages are covered too. See [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) APPSEC-07b. |

## Review Cadence

This register should be revisited at minimum: (a) every time a release touches one of
the high-risk areas in [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8,
(b) before any external pentest, (c) before any production migration, (d) before
enabling live notification sending.
