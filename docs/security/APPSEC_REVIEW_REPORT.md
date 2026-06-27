# Application Security Review Report

Reviewer role: AppSec Reviewer. Baseline: `origin/main` @
`a3d21f078ff1e253a7050502d2b473a25271d9aa`, reviewed on branch
`security/revora-trust-safety-program`. Companion documents:
[THREAT_MODEL.md](THREAT_MODEL.md), [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md),
[API_SECURITY_CHECKLIST.md](API_SECURITY_CHECKLIST.md).

Classification key: **PASS** (control verified present and effective), **WARNING**
(control present but with a gap or defense-in-depth weakness), **FAIL** (control
missing or ineffective), **NOT REVIEWED** (out of scope for this pass),
**NEEDS TEST** (believed correct but not exercised by an automated/manual test yet).

## Summary

| # | Area | Verdict | Finding ID |
|---|---|---|---|
| 1 | Authentication | PASS | APPSEC-01 |
| 2 | Authorization / `account_intent` misuse check | PASS | APPSEC-02 |
| 3 | Multi-tenant isolation (API routes + server actions) | PASS | APPSEC-03 |
| 4 | Role-based access control | PASS | APPSEC-03 |
| 5 | API routes | PASS | APPSEC-03 |
| 6 | Server actions | PASS | APPSEC-03 |
| 7 | Middleware | PASS | APPSEC-01 |
| 8 | Customer portal boundaries | PASS | APPSEC-05 |
| 9 | Staff/owner boundaries | PASS | APPSEC-05 |
| 10 | Platform admin boundaries | PASS | APPSEC-02 |
| 11 | File/document access | PASS | APPSEC-15 |
| 12 | Notification safety | PASS | APPSEC-12 |
| 13 | AI Vehicle Intelligence safety | PASS | APPSEC-13 |
| 14 | Stripe webhook safety | PASS | APPSEC-14 |
| 15 | Error handling / DB error leakage | **FAIL → fixed**: action/mutation layer fixed in the original pass; read-path page components fixed in a follow-up pass (see APPSEC-07b) | APPSEC-07 / APPSEC-07b |
| 16 | Input validation | WARNING | APPSEC-09 |
| 17 | URL/ID tampering | PASS (one defense-in-depth note) | APPSEC-06 / APPSEC-11 |
| 18 | Business logic abuse | PASS | APPSEC-16 |

Additional findings surfaced during review, not in the original 18: APPSEC-08
(account enumeration, P3), APPSEC-10 (invitation expiry, P3), APPSEC-07b
(read-path query-error rendering, P2 — discovered while fixing APPSEC-07,
**fixed in a follow-up pass on the same branch**).

No P0 findings. Two P1/P2 findings fixed across the two passes on this branch
(APPSEC-07, APPSEC-07b). Four P2/P3 findings remain open for future work
(APPSEC-08, APPSEC-09, APPSEC-10, APPSEC-11). Full severity definitions:
[REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §4.

---

## APPSEC-01 — Authentication & Session Management

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `apps/web/src/middleware.ts`, `apps/web/src/lib/supabase/middleware.ts`,
`apps/web/src/lib/supabase/server.ts`, `apps/web/src/lib/auth.ts`.

**What was checked:** Session refresh runs on every request via middleware
(`middleware.ts:22` → `updateSession()`), which revalidates via
`supabase.auth.getUser()` (not the unverified `getSession()`) at
`lib/supabase/middleware.ts:58-61`. Unauthenticated users hitting a non-public path
are redirected to `/login`; authenticated users hitting `/login`/`/signup` are
redirected away (`lib/supabase/middleware.ts:65-74`). Server-side guards
(`requireUser`, `requireMembership`, `requireCustomerPortal`, `requireSuperAdmin` in
`lib/auth.ts`) gate every protected route group at the layout level.

**Risk if absent:** Session fixation / stale-session trust, unauthenticated access
to protected pages.

**Exploit scenario:** N/A — not exploitable as implemented.

**Recommended fix:** None required. Maintain the convention that every new
`(dashboard)`/`(portal)`/`(admin)` route group keeps a layout-level guard rather than
relying on page-level checks alone.

**Validation required:** Covered by manual QA script in
[ACCOUNT_SAFETY_TEST_MATRIX.md](ACCOUNT_SAFETY_TEST_MATRIX.md).

---

## APPSEC-02 — Platform Admin Authorization & `account_intent` Misuse Check

**Severity:** N/A (control verified — this was the single most important check in
the program's non-negotiables) | **Status:** PASS | **Code changed:** No

**Affected files:** `supabase/migrations/0009_platform_admins.sql`,
`apps/web/src/lib/auth.ts:175-200`, every page under `app/[locale]/(admin)/`.

**What was checked:** `platform_admins` is a dedicated table (not a flag on
`profiles`), with exactly one RLS policy — read-your-own-row — and no
insert/update/delete policy, so membership can only change via the
`SECURITY DEFINER` RPC `admin_set_super_admin()` (`0009_platform_admins.sql:147-183`),
which itself requires the caller to already be a super admin
(`is_super_admin()` check at line 160) and blocks self-removal (line 174-177). The
app-level helpers `isSuperAdmin()`/`requireSuperAdmin()`
(`lib/auth.ts:175-200`) query this table directly. A full-tree search for
`account_intent` found every usage confined to onboarding/routing redirects in
`requireMembership()`/`requireCustomerPortal()` (`lib/auth.ts:206-251`) and signup
form handling — **no RLS policy, no `admin_*` RPC, and no route guard anywhere
references `account_intent`.**

**Risk if absent:** `account_intent` is a `profiles` column set at signup from
client-controlled `user_metadata` — if it were ever used for authorization, any
user could self-elevate by signing up with `account_intent: "business_owner"` or
similar.

**Exploit scenario:** N/A — not exploitable as implemented. This is recorded as a
PASS specifically because the project's own non-negotiables single this out by
name; future reviewers should re-run the same full-tree search
(`grep -rn "account_intent" apps/web/src`) after any auth-related change.

**Recommended fix:** None required now. Treat any future PR that adds a new
`account_intent`-gated check as a P0 review trigger.

**Validation required:** Re-run the grep after any change touching `lib/auth.ts`,
`profiles`, or onboarding.

---

## APPSEC-03 — Multi-Tenant Isolation, RBAC, API Routes, Server Actions

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `apps/web/src/app/api/**`, `apps/web/src/app/[locale]/(dashboard)/**/actions.ts`,
`apps/web/src/app/[locale]/(portal)/portal/actions.ts`, `supabase/migrations/0002_rls_policies.sql`.

**What was checked:** There are no direct tenant-CRUD `/api/` routes — tenant
mutations go through server actions. Server actions derive `business_id` from
`requireMembership()`'s returned `business.id` (e.g.
`quotations/actions.ts:57,68`, `jobs/actions.ts`, `customers/actions.ts`) rather than
trusting a client-supplied value; where a record is addressed only by `id` (e.g.
`quotations/actions.ts:171,210` `updateQuoteDetails`/`sendQuote`), the RLS policies
in `0002_rls_policies.sql` (`is_business_member()`, `has_business_role()`) are the
actual enforcement layer and were verified present for `quotations`. Portal actions
(customer-initiated) additionally do an explicit application-level ownership check
before mutation — e.g. `portal/actions.ts:206-209` finds the matching account in the
caller's own `accounts` list before allowing a quote approval, and
`portal/actions.ts:168-169` does the same for complaint replies. The two public
`/api/` routes that exist (`notifications/dispatch`, `stripe/webhook`) use a shared
secret and a cryptographic signature respectively, not session auth — appropriate
for their server-to-server nature.

**Risk if absent:** Cross-tenant read/write, privilege escalation within a tenant.

**Exploit scenario:** N/A as implemented. If a future server action accepted a
client-supplied `business_id` and used it directly in a query without an
`is_business_member()`-backed RLS policy or an explicit ownership check, a malicious
staff user of Business A could write to Business B's records.

**Recommended fix:** None required now. Add the multi-tenant checklist items in
[SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) to every PR touching a new
server action.

**Validation required:** See [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md).

---

## APPSEC-04 — RLS Coverage

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** All of `supabase/migrations/0001`–`0030`.

**What was checked:** Every one of the 53 tables created across the migrations
(verified by direct grep of `create table public.*`) has a corresponding
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement somewhere in the migration
history. Spot-checked policy logic for `customers`, `vehicles`, `quotations`,
`jobs`, `complaints`, `media_assets`/storage, `platform_admins`, and the
notification tables — each scopes by `is_business_member(business_id)`,
`has_business_role(business_id, role[])`, or `is_customer_for_business(business_id,
customer_id)`. No table was found with an overly-permissive `USING (true)` policy
on tenant-owned data.

**Risk if absent:** A table without RLS is readable/writable by any authenticated
(or, depending on grants, anonymous) request once the API layer's own checks are
bypassed or missing — RLS is Revora's last line of defense for tenant isolation.

**Exploit scenario:** N/A as implemented.

**Recommended fix:** None required now. [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md)
requires every new migration to enable RLS in the same migration that creates the
table, not a follow-up one.

**Validation required:** Re-run `grep -c "enable row level security"` vs. table
count after any new migration.

---

## APPSEC-05 — Customer Portal / Staff / Owner Boundary Separation

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `app/[locale]/(dashboard)/layout.tsx`, `app/[locale]/(portal)/layout.tsx`,
`app/[locale]/(admin)/layout.tsx`, `lib/auth.ts:206-252`.

**What was checked:** `requireMembership()` redirects a customer (no business
membership) toward onboarding/portal; `requireCustomerPortal()` redirects a user
*with* a business membership back to `/`. The two guards are mutually exclusive by
construction (one requires a membership, the other requires its absence), enforced
at the layout level for every route under each group. Customer identity binds to
`customers.app_user_id = auth.uid()`, never to a client-supplied customer id.

**Risk if absent:** Customers reaching staff dashboards (or vice versa), exposing
internal tooling or another party's operational data.

**Exploit scenario:** N/A as implemented.

**Recommended fix:** None required.

**Validation required:** Manual QA script in
[ACCOUNT_SAFETY_TEST_MATRIX.md](ACCOUNT_SAFETY_TEST_MATRIX.md).

---

## APPSEC-06 / APPSEC-11 — URL/ID Tampering on Dynamic Routes

**Severity:** P3 (defense-in-depth gap only) | **Status:** PASS with one WARNING |
**Code changed:** No

**Affected files:** `app/[locale]/(dashboard)/quotations/[id]/page.tsx`,
`.../jobs/[id]/page.tsx`, `.../customers/[id]/page.tsx`, `.../complaints/[id]/page.tsx`,
`app/[locale]/(portal)/portal/complaints/[id]/page.tsx`,
`app/[locale]/(portal)/portal/quotes/[id]/page.tsx`.

**What was checked:** Staff-side detail pages explicitly filter by
`.eq("business_id", business.id).eq("id", id)` in addition to RLS — belt and
suspenders. The portal complaint detail page does the same pattern in reverse: it
fetches by `id` alone but then explicitly checks
`accounts.some((a) => a.id === complaint.customer_id)` and calls `notFound()`
otherwise (`portal/complaints/[id]/page.tsx:62`). **The portal quote detail page
does not have this same explicit application-level check** — it fetches by `id`
and relies solely on the RLS policy (`is_customer_for_business`) to prevent a
customer from loading another customer's quote.

**Risk if absent:** None today — RLS is a real enforcement layer, not merely
defense-in-depth theater, since it runs in Postgres regardless of the application
code path. The gap is *inconsistency*: if a future refactor ever queried this page
through a privileged (e.g. service-role) client by mistake, the missing
application-level check would remove the only remaining guard.

**Exploit scenario:** Only realizable if combined with a second, separate bug (use
of a service-role/RLS-bypassing client on this page) — not exploitable today.

**Recommended fix:** Add the same explicit ownership check used on the portal
complaint detail page to the portal quote detail page, for consistency. Not done in
this pass (it touches page logic beyond the "tiny, obvious" bar for Phase 9 —
recommended as a small, well-scoped follow-up).

**Validation required:** Manual QA case in
[MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md): Customer A attempts to
load Customer B's `/portal/quotes/[id]` URL directly and must receive a not-found
or access-denied result.

---

## APPSEC-07 — Raw Database Error Messages Returned to End Users

**Severity:** P1 | **Status:** FAIL → **fixed in this pass for the action/mutation
layer; a related, larger read-path pattern found during the fix is tracked as
APPSEC-07b below, not fixed in this pass** | **Code changed:** Yes

**Affected files (action/mutation layer — server actions and service functions
that perform an `.insert()`/`.update()`/`.delete()`/`.rpc()` and return `{ error }`
to a caller — all fixed in this pass):**
`app/[locale]/(portal)/portal/actions.ts`,
`app/[locale]/(onboarding)/onboarding/actions.ts`,
`app/[locale]/(dashboard)/customers/actions.ts`,
`app/[locale]/(dashboard)/settings/business/logo-actions.ts`,
`app/[locale]/(dashboard)/settings/business/actions.ts`,
`app/[locale]/(dashboard)/settings/business/invite-actions.ts`,
`app/[locale]/(dashboard)/complaints/actions.ts`,
`app/[locale]/(dashboard)/vehicles/actions.ts`,
`app/[locale]/(dashboard)/quotations/actions.ts`,
`app/[locale]/(dashboard)/jobs/actions.ts`,
`app/[locale]/(dashboard)/notifications/actions.ts`,
`app/[locale]/(dashboard)/billing/actions.ts`,
`app/[locale]/(admin)/admin/actions.ts`,
`lib/vehicle-intelligence/service.ts` (8 sites),
`lib/vehicle-intelligence/actions.ts`,
`lib/vehicle-intelligence/search-service.ts`,
`lib/actions/membership-bundles.ts` (11 sites),
`lib/actions/retainer-scenarios.ts` (8 sites),
`lib/evidence-actions.ts`,
`lib/document-actions.ts` (2 sites),
`lib/notifications/service.ts` (`queueCustomerNotification`),
`app/[locale]/(dashboard)/tools/retainer-calculator/page.tsx` (a page component
that directly rendered a query error — found and fixed alongside the rest).

This list grew substantially during implementation: the initial AppSec sweep
(by a sub-agent search scoped to `app/api`, `lib/actions`, and page/error-boundary
components) found 31 instances across 14 files. While applying the fix, a direct
`grep -rn "error: error\.message\|error?\.message ??" src/` across the whole
`apps/web/src` tree turned up the same pattern in `lib/vehicle-intelligence/*`,
`lib/actions/membership-bundles.ts`, `lib/actions/retainer-scenarios.ts`,
`lib/evidence-actions.ts`, and `lib/notifications/service.ts` — files outside the
sub-agent's original search scope — plus several sites using a differently-named
error variable (e.g. `quoteError.message`, `itemError.message`) that a
literal-variable-name grep missed. All of these were fixed for consistency rather
than left as a known, already-discovered gap. **Lesson for future passes: search
the whole tree for the error-leak *pattern*, not just within the directories a
first pass assumed were the only call sites.**

**What was found:** These functions returned `{ error: error.message }` (or
`error?.message ?? "fallback"`, which still leaks when `error` is truthy) directly
from a Supabase **PostgREST/Postgres** call to the caller, which in every traced
case was either rendered directly in the UI or returned as form-action state shown
to the user. Postgres/PostgREST error text can include constraint names, column
names, and other schema detail not intended for end users, which violates the
project's non-negotiable "no raw database errors are exposed to users."

**Risk:** Information disclosure (schema/internals), and a worse user experience
(a confusing Postgres error instead of an actionable message) — not a direct
cross-tenant data leak, but classified P1 because it is an explicit program
non-negotiable.

**Exploit scenario:** A user (customer or staff) triggers a constraint violation or
permission error (e.g. submitting a duplicate, or an RLS-denied write) and sees the
raw Postgres message, which can reveal table/column names useful for further
probing.

**Recommended fix (applied):** Each call site now logs the original error
server-side via `console.error(...)` and returns a short, safe, generic message to
the user, written in the same plain-English style already used elsewhere in that
same file for validation errors (no new i18n keys, no shared abstraction
introduced — consistent with the file's existing per-action message style and the
audit's "no broad refactor" rule).

**Explicitly NOT changed:** `app/[locale]/(auth)/actions.ts` — its `error.message`
values come from the **Supabase Auth SDK** (`signInWithPassword`, `signUp`,
`signInWithOtp`, `resetPasswordForEmail`, `updateUser`), which are designed to be
shown to end users (e.g. "Invalid login credentials"). These are a different
category from raw Postgres errors and changing them is a product/UX decision, not
a security fix — see APPSEC-08 for the one nuance worth tracking separately.
`components/file-upload.tsx`'s client-side `toast.error(error.message)` surfaces a
**Supabase Storage SDK** error (e.g. file-too-large/type-rejected), also
SDK-designed user feedback rather than a raw DB error — left unchanged for the same
reason. `lib/stripe.ts`'s thrown `json.error?.message` surfaces a **Stripe API**
error; its only caller (`billing/actions.ts`'s `openBillingPortal`) was fixed to no
longer read `.message` at all, so this Stripe-specific text no longer reaches any
UI — `lib/stripe.ts` itself was left unchanged since re-throwing is appropriate for
a low-level client wrapper.

**Validation required:** `pnpm typecheck`/`pnpm build`/`pnpm lint` (mechanical
change, no new logic); manual spot-check that each action still returns a sensible
message on the existing failure paths (covered by re-running `pnpm test`, which
exercises some of these modules' adjacent logic, plus the manual QA notes in
[SECURITY_QA_TEST_PLAN.md](SECURITY_QA_TEST_PLAN.md)).

---

## APPSEC-07b — Read-Path Query Errors Rendered Directly in Page Components

**Severity:** P2 (lower urgency than APPSEC-07: these are `SELECT`-query failure
paths, which are rare in normal operation — typically only hit on a transient
DB/network issue or an unexpected RLS denial — versus the mutation-layer paths in
APPSEC-07, which are actively reachable by any user submitting a form) | **Status:**
FAIL → **fixed in a follow-up pass on this branch** | **Code changed:** Yes

**Affected files (exact count, verified by direct grep rather than estimated):
20 page components, 25 call sites** rendering a Supabase query's `error.message`
(or a similarly-named `*Error.message`/`*ErrorState.message`) directly in JSX —
`(portal)/portal/quotes/page.tsx`, `(portal)/portal/documents/page.tsx`,
`(portal)/portal/jobs/page.tsx`, `(dashboard)/customers/page.tsx`,
`(dashboard)/vehicles/new/page.tsx`, `(dashboard)/vehicles/[id]/edit/page.tsx`,
`(dashboard)/vehicles/[id]/page.tsx` (4 sites: `jobError`/`quoteError`/
`complaintError`/`documentError`), `(dashboard)/quotations/page.tsx`,
`(dashboard)/documents/page.tsx`, `(dashboard)/jobs/page.tsx`,
`(dashboard)/notifications/page.tsx` (2 sites: `settingsError`/`error`),
`(dashboard)/billing/page.tsx` (2 sites: `revenueErrorState`/
`paymentEventErrorState`), and `(admin)/admin/{page,admins,tenants,audit-logs,
subscriptions,users,notifications,billing}/page.tsx` (8 files).

**Note on the original estimate:** the original finding said "~23 page
components, ~26 call sites," derived from the same grep that expanded APPSEC-07.
The actual fix pass re-ran the search exhaustively (case-insensitive, covering
`*Error.message` and `*ErrorState.message` variable-naming shapes, confirmed with
a zero-match final sweep) and found the precise count above. The earlier estimate
was directionally correct but not exact — a reminder that "approximately N" from a
first pass should be re-verified before being treated as a closed scope.

**What was found:** Same root cause as APPSEC-07 (a handled `{ data, error }`
result from a Supabase query, with `error.message` rendered straight into JSX)
but in the read path (page-level `SELECT` queries) rather than the mutation path
(server actions). Two sites that looked like candidates were confirmed **not**
leaks on inspection: `vehicles/[id]/edit/page.tsx` and `vehicles/[id]/page.tsx`
both also have a `vehicleError` that is `throw`n rather than rendered, which
routes to that route segment's `error.tsx` boundary — already safe, since those
boundaries render hardcoded generic copy, never `error.message`.

**Risk:** Same as APPSEC-07 — information disclosure (schema/internals) on a
query failure, not a cross-tenant data leak. Slightly lower likelihood than
APPSEC-07 since these are read failures rather than write failures.

**Recommended fix (applied):** For pages that already use the `next-intl`
message catalog (`getTranslations`), reused the existing, already-bilingual
`error` namespace (`title`/`description` keys, the same one `app/[locale]/error.tsx`
uses for thrown-exception boundaries) via a second `getTranslations("error")`
call — zero new translation keys added. For the two pages that don't use the
catalog at all and instead inline bilingual ternaries
(`(dashboard)/notifications/page.tsx`, `(dashboard)/billing/page.tsx`), matched
that file's own existing `locale === "ar" ? "..." : "..."` convention instead of
introducing the catalog pattern where it wasn't already present. For the one
section that has no localization at all today (`(dashboard)/vehicles/[id]/page.tsx`'s
"Service history"/"Related quotes"/"Related complaints"/"Related documents"
cards, which use plain English strings throughout, unlike the rest of the app),
used a plain English safe string matching its immediate sibling `EmptyState`
copy — adding Arabic there would have been scope creep into an unrelated,
pre-existing i18n gap, not part of this fix. Every site also gained a
`console.error("<PageName> failed to load ...", error)` call for server-side
observability, since none of these pages logged the error at all before (it was
only ever shown to the user).

**Validation performed:** `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`
(including the new APPSEC-07b regression test, see
[SECURITY_QA_TEST_PLAN.md](SECURITY_QA_TEST_PLAN.md)), and
`APP_URL=https://revora-app.vercel.app pnpm smoke:routes` all passed. The
regression test was verified to actually catch the bug (a leak was temporarily
reintroduced into one file, confirmed the test failed with a clear message, then
reverted) before being relied upon.

**Residual risk:** None known for the 20 files fixed. The new tree-wide
`APPSEC-07b` regression test (pattern-based, not a closed file list) guards
against the same mistake in any future `page.tsx`, including ones that don't
exist yet — this closes the "directory-scoped first pass misses files" gap that
affected the original APPSEC-07 estimate.

---

## APPSEC-08 — Account Enumeration via Auth SDK Message

**Severity:** P3 | **Status:** WARNING | **Code changed:** No

**Affected files:** `app/[locale]/(auth)/actions.ts` (`signUp`).

**What was found:** Supabase Auth's `signUp()` error for an already-registered
email is surfaced verbatim via `error.message`, which can let an attacker probe
whether a given email has a Revora account.

**Risk:** Minor information disclosure (account existence), commonly accepted risk
for many SaaS products but worth a conscious decision rather than an accident.

**Exploit scenario:** Attacker submits candidate emails to `/signup` and
distinguishes "already registered" responses from "check your email" responses.

**Recommended fix:** Product decision required — either keep current behavior
(common, low severity) or normalize the signup response message regardless of
outcome. Not changed in this pass (a UX/product decision, not a "small obvious
fix").

**Validation required:** N/A until a decision is made; track in
[SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md).

---

## APPSEC-09 — Selective Input Validation

**Severity:** P2 | **Status:** WARNING | **Code changed:** No

**Affected files:** Most files under `app/[locale]/(dashboard)/**/actions.ts` and
`app/[locale]/(portal)/portal/actions.ts`.

**What was found:** Zod schemas exist and are used for the retainer-calculator and
membership-bundles features (`lib/retainer/retainer-schema.ts`,
`lib/bundles/schema.ts`), but most dashboard/portal server actions extract
`FormData` fields manually with ad hoc string/number coercion and no schema
validation, relying on RLS and Postgres column constraints as the only backstop.

**Risk:** Defense-in-depth gap. Not currently known to be exploitable (RLS still
enforces tenant boundaries, and Postgres enforces column types/constraints), but
malformed input could produce confusing failures or, in a future change that
removes a downstream constraint, a real validation gap.

**Exploit scenario:** No concrete exploit identified today; this is a hardening
recommendation, not an active vulnerability.

**Recommended fix:** Incrementally adopt zod schemas for new and high-traffic
server actions (quotations, jobs, complaints first). Out of scope for this pass —
flagged as future work, not a "small safe fix" given the number of files involved.

**Validation required:** N/A until implemented.

---

## APPSEC-10 — Team Invitations Have No Expiry

**Severity:** P3 | **Status:** WARNING | **Code changed:** No

**Affected files:** `supabase/migrations/0010_team_invitations.sql`.

**What was found:** `business_invitations` rows have no `expires_at`/TTL — a
`pending` invitation remains claimable indefinitely by anyone who later signs up
with the invited email address (`claim_business_invitations()`,
`0010_team_invitations.sql:48-89`).

**Risk:** Low — exploiting this requires control of the invited email's inbox/
signup, which is itself a meaningful control (this is not a guessable URL token).
The realistic risk is an invitation issued long ago, to an email address that later
changes ownership (e.g. a company mailbox reassigned after an employee leaves),
being claimed by an unintended party.

**Exploit scenario:** Business owner invites `ops@oldvendor.example`, the vendor
relationship ends and the domain/mailbox is later controlled by someone else, who
signs up and inherits staff access — only if the owner never revoked the pending
invite.

**Recommended fix:** Add an `expires_at` column and check it in
`claim_business_invitations()`, plus a UI affordance for owners to see/revoke stale
pending invites. Requires a new migration — out of scope for this pass per the
"no schema migration" rule for Phase 9 fixes; recommended as a future,
separately-approved change.

**Validation required:** N/A until implemented.

---

## APPSEC-12 — Notification Safety

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `lib/notifications/provider.js`, `lib/notifications/service.ts`,
`lib/notifications/templates.js`, `app/api/notifications/dispatch/route.ts`.

**What was checked:** Live sending requires three independent gates
(`NOTIFICATIONS_DISPATCH_ENABLED`, `NOTIFICATIONS_LIVE_SEND_ENABLED`,
per-business `live_send_enabled`) plus a dispatch-secret header check
(`dispatch/route.ts:6-21`) before `processQueuedNotifications()` runs; provider
calls (`sendEmail`/`sendSms`) are only reached if `canAttemptLiveSend().ok === true`.
Templates pass through `redactNotificationText()` to strip raw UUIDs. Notification
queries are scoped by `business_id`, and RLS on `notification_events`/
`notification_delivery_attempts`/`notification_preferences` requires
`is_business_member()`. Full detail and test matrix:
[NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md).

**Recommended fix:** None required. Re-verify this finding specifically before any
future decision to enable live sending in production.

---

## APPSEC-13 — AI Vehicle Intelligence Safety

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `lib/vehicle-intelligence/vin.js`, `lib/vehicle-intelligence/service.ts`,
`lib/vehicle-intelligence/safety.js`, `lib/vehicle-intelligence/search-service.ts`.

**What was checked:** VIN/spec data is sourced from the NHTSA vPIC API
(`vin.js:61-150`), not free-form LLM generation. Symptom analysis
(`service.ts:725-914`) builds a rule-based fallback diagnosis and only calls OpenAI
for advisory explanation text. `safety.js` defines `CRITICAL_PATTERNS`/
`HIGH_RISK_PATTERNS`, a `SAFE_SELF_CHECK_ALLOWLIST`/`DANGEROUS_KEYWORDS` sanitizer,
and `enforceSafetyOverrides()`, which forces critical-severity cases to an empty
self-check list and a "stop driving, contact workshop" response regardless of what
the model returned. The search endpoint requires `requireMembership()` plus a
`canManageCustomers(role)` check and filters every query by `business_id`. Full
detail and test matrix: [AI_SAFETY_TEST_MATRIX.md](AI_SAFETY_TEST_MATRIX.md).

**Recommended fix:** None required. Any change to `safety.js`'s override logic
should be treated as a high-risk release per
[REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8.

---

## APPSEC-14 — Stripe Webhook Safety

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `app/api/stripe/webhook/route.ts`, `lib/stripe-webhook.ts`,
`supabase/migrations/0021_stripe_webhook_idempotency.sql`.

**What was checked:** The webhook route reads the raw body via `request.text()`
before any parsing and validates the signature
(`verifyStripeWebhookSignature`, `lib/stripe-webhook.ts:650-698`) using
`crypto.timingSafeEqual` and a timestamp tolerance window, rejecting on mismatch
before any business logic runs. Idempotency is enforced via unique indexes added
in migration `0021` combined with `upsert(..., { onConflict })` in the handler. No
route or action allows a client to mutate subscription/plan state directly outside
this webhook flow. Per program ground rules, webhook *behavior* was reviewed only
and not modified.

**Recommended fix:** None required.

---

## APPSEC-15 — File/Document Access

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `supabase/migrations/0016_storage_media.sql`,
`supabase/migrations/0017_media_evidence_read.sql`, `lib/storage.ts`,
`components/file-upload.tsx`, `app/[locale]/(dashboard)/documents/page.tsx`.

**What was checked:** Two buckets exist: `revora-private` (signed URLs, ~10 minute
expiry, path-partitioned by `business_id`) and `revora-public` (world-readable, used
only for non-personal assets like logos). Upload/read policies on the private
bucket require `is_business_member(business_id)` or
`is_customer_for_business(business_id, customer_id)` derived from the storage
object path. The `record_complaint_evidence()` `SECURITY DEFINER` RPC validates
caller ownership before letting a customer attach evidence to their own complaint.

**Recommended fix:** None required.

---

## APPSEC-16 — Business Logic Abuse (Quotation Approval, Complaints)

**Severity:** N/A (control verified) | **Status:** PASS | **Code changed:** No

**Affected files:** `app/[locale]/(dashboard)/quotations/actions.ts`,
`app/[locale]/(portal)/portal/actions.ts`,
`app/[locale]/(dashboard)/complaints/actions.ts`.

**What was checked:** Customer-initiated quotation approval
(`portal/actions.ts:206-209`) and complaint replies (`portal/actions.ts:168-169`)
both explicitly verify the acting customer's own `accounts` list contains a match
for the target `business_id`/`customer_id` before allowing the write, in addition
to the RLS policies (`approvals_customer_insert`, complaint policies) backing the
same operation.

**Recommended fix:** None required.

---

## Out of Scope / Not Reviewed in Depth

- Mobile app (Expo) — not yet built per project status; not reviewed.
- Detailed line-by-line review of every PostHog/Sentry instrumentation call site for
  incidental personal-data capture — flagged in
  [PRIVACY_IMPACT_ASSESSMENT.md](PRIVACY_IMPACT_ASSESSMENT.md) §6 as follow-up, not
  completed here.
- Dependency/supply-chain vulnerability scanning (e.g. `npm audit` / Snyk) — not run
  in this pass; recommended as a DevSecOps follow-up (see
  [DEVSECOPS_SECURITY_RUNBOOK.md](DEVSECOPS_SECURITY_RUNBOOK.md)).
- Load/DoS resilience — explicitly out of scope per this program's rules of
  engagement.
