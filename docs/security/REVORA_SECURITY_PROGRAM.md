# Revora Security Program

Status: living document. Owner: Security Owner role (see [SECURITY_ROLES_AND_RACI.md](SECURITY_ROLES_AND_RACI.md)).
Last assessed against: `origin/main` @ `a3d21f078ff1e253a7050502d2b473a25271d9aa`.

## 1. Security Mission

Revora handles customer-trust-sensitive data for small businesses (workshops, detailing
centers, tire shops) and their customers: vehicles, quotations, approvals with digital
signatures, complaints, documents, and (later) payments at scale. The mission of this
program is to make sure that:

- one tenant's staff or customers can never see another tenant's data,
- platform operators (Revora staff) have audited, minimal, table-gated access,
- nothing is sent to a real customer (email/SMS) without an explicit, reversible
  decision to do so,
- failures fail closed (deny by default) rather than open,
- every release that touches auth, money, documents, or notifications goes through a
  named human checkpoint, not just CI green checks.

This is a governance and assurance document, not a guarantee of zero defects. It
defines how Revora finds, tracks, and gates security risk — it does not certify the
product as free of vulnerabilities.

## 2. Threat Model Summary

Full detail in [THREAT_MODEL.md](THREAT_MODEL.md). In short, the assets that matter most are:

1. **Cross-tenant isolation** — business A must never read/write business B's customers,
   vehicles, quotations, jobs, complaints, documents, or billing data.
2. **Platform admin power** — the `platform_admins` table and `is_super_admin()` /
   `admin_*` RPCs can read/aggregate data across every tenant; compromise of one
   platform-admin account is a full breach.
3. **Customer-portal boundary** — customers must only ever see their own vehicles,
   quotations, jobs, and complaints, never internal staff notes or other customers'
   records.
4. **Money** — Stripe webhook integrity and billing state must not be forgeable by a
   client.
5. **Notification channel** — Revora must not become a spam vector; live send is
   gated behind environment flags and a dispatch secret today (see
   [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md)).
6. **AI Vehicle Intelligence** — must not invent vehicle specs or hand a customer
   dangerous DIY repair instructions for a safety-critical fault.

Primary attacker classes considered: an authenticated customer of business A probing
for business B's or business A's staff-only data; an authenticated staff member of
business A probing for another business's data; an unauthenticated actor hitting
public routes/APIs; a compromised/malicious npm dependency or CI step; a curious or
malicious platform-admin-adjacent insider.

## 3. Security Ownership Matrix

See [SECURITY_ROLES_AND_RACI.md](SECURITY_ROLES_AND_RACI.md) for the full RACI. Summary:

| Domain | Owner |
|---|---|
| Overall security program, risk register, release gate | Security Owner |
| Privacy, data classification, retention | Privacy Owner |
| Code-level findings (auth, RLS, APIs, AI, Stripe) | AppSec Reviewer |
| Infra, secrets, deploy pipeline, monitoring | DevSecOps Owner |
| Test coverage and manual QA scripts | QA/Security Tester |
| External pentest scheduling and scope | External Pentest Prep Lead |
| Legal/regulatory sign-off | Legal/Privacy Advisory Coordinator (qualified counsel required for final sign-off) |

In the current state of the project, a single operator (the founder) may hold all of
these hats. The matrix exists so that as the team grows, each hat has a documented,
assignable job description rather than "whoever is free."

## 4. Risk Severity Model

| Severity | Definition | Examples | Response SLA (target, once team exists) |
|---|---|---|---|
| **P0 — Critical** | Cross-tenant data exposure, auth bypass, service-role key exposed client-side, live notification sent without approval, payment integrity broken | Customer of Business A can read Business B's quotations; Stripe webhook signature check removed | Stop release; fix before any further deploy; hotfix within hours |
| **P1 — High** | Privilege escalation within a tenant, sensitive data leak short of cross-tenant (e.g. raw DB error revealing schema), missing RLS on a tenant table, dispatch secret bypassable | A non-manager employee can approve their own discount; a table is missing `ENABLE ROW LEVEL SECURITY` | Fix before next release touching that area |
| **P2 — Medium** | Defense-in-depth gaps, missing input validation backed by RLS, indefinite-lived invitations, selective error-message inconsistency | Server action trusts client-formatted input without schema validation, relying solely on RLS as backstop | Fix within the current or next planned iteration |
| **P3 — Low** | Hardening opportunities, verbose-but-not-secret error text, missing security headers, documentation gaps | Auth SDK error message reveals an email is already registered | Track in backlog, fix opportunistically |

## 5. Release Security Gate

No release that touches **auth, RLS, payments, documents, AI, notifications, or
platform admin** ships without:

1. A named human (today: the founder/operator) explicitly reviewing the diff for that
   area — not just CI passing.
2. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` green from `apps/web`.
3. `git diff --check` clean and the secret-pattern grep (see root `AGENTS.md`/this repo's
   validation commands) returning no hits.
4. Confirmation that no migration drops/alters data destructively without an explicit,
   separately-approved migration review.
5. Confirmation that `NOTIFICATIONS_DISPATCH_ENABLED` / `NOTIFICATIONS_LIVE_SEND_ENABLED`
   remain at their intended values (today: live send must stay disabled in
   production until a deliberate go-live decision — see
   [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md)).

Full checklist: [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md).

## 6. Security Review Checklist (quick reference)

- [ ] Does this change touch a tenant-owned table? If so, does RLS still cover every
      new column/path, and is `business_id` (or customer ownership) still derived
      server-side, never trusted from the client?
- [ ] Does this change touch `account_intent`? If so, confirm it is still
      routing/UI-only and never used as an authorization check (see
      [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)).
- [ ] Does this change touch `platform_admins` / `is_super_admin()` / any `admin_*`
      RPC? If so, confirm self-elevation is still impossible and the caller check
      still runs first.
- [ ] Does this change add a new error path? If so, does the user see a safe generic
      message while the real error is only logged server-side?
- [ ] Does this change touch Stripe webhook handling? If so, confirm signature
      verification still runs against the raw body before any parsing.
- [ ] Does this change touch notifications? If so, confirm the dispatch-secret and
      env-flag gates are unchanged and live send is still off by default.
- [ ] Does this change touch AI Vehicle Intelligence? If so, confirm safety
      overrides (`enforceSafetyOverrides`, dangerous-keyword stripping) are still
      invoked for every AI-touched path.
- [ ] Does this change touch storage/documents? If so, confirm uploads/downloads
      still go through signed URLs or RLS-backed paths, never public-by-default.

## 7. Incident Escalation Model

1. **Detect** — via Sentry error spike, PostHog anomaly, Vercel/Supabase dashboard,
   or user report.
2. **Contain** — for a suspected cross-tenant leak or auth bypass: disable the
   affected route/feature flag or revert the deploy immediately; rotate any
   potentially-exposed credential (handled by a human with vault access — this
   program does not automate key rotation).
3. **Assess** — classify severity per §4; identify affected tenants/customers.
4. **Notify** — affected business owners as soon as practical once contained;
   prepare customer-facing language with legal/privacy input for anything involving
   personal data (see [LEGAL_PRIVACY_REVIEW_CHECKLIST.md](LEGAL_PRIVACY_REVIEW_CHECKLIST.md)).
5. **Remediate** — ship the fix through the normal release gate (expedited, not
   bypassed).
6. **Record** — add an entry to [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md)
   and, if data was exposed, follow the breach-notification steps in
   [PRIVACY_IMPACT_ASSESSMENT.md](PRIVACY_IMPACT_ASSESSMENT.md).

There is currently no 24/7 on-call rotation — this is a known gap for a single/small
team and should be revisited before a large-scale public launch.

## 8. Approval Requirements for High-Risk Releases

Changes in the following areas require explicit sign-off (today: the founder/operator
consciously approving, not just merging) before deploy to production:

- **Auth** (login, signup, password reset, session/middleware) — AppSec review required.
- **RLS** (any migration touching `ENABLE ROW LEVEL SECURITY` or a `CREATE POLICY`) —
  AppSec review required, plus a manual cross-tenant smoke test (see
  [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md)).
- **Payments** (Stripe webhook, billing actions, plan/subscription mutation) —
  AppSec + DevSecOps review; webhook signature validation must remain reviewed-only
  per program ground rules (no behavior changes without a documented finding).
- **Documents** (storage buckets/policies, signed URL logic) — AppSec review.
- **AI** (Vehicle Intelligence prompts, safety filters) — AppSec review of
  `safety.js` overrides specifically.
- **Notifications** (dispatcher, templates, opt-out) — DevSecOps + Privacy review;
  live-send flags require explicit operator sign-off, never a default-on change.
- **Platform admin** (`platform_admins`, `admin_*` RPCs, `/admin` routes) — AppSec
  review; no self-elevation path may ever be introduced.

## 9. Definition of "Secure Enough to Release"

A release is secure enough to ship when, at minimum:

- All P0/P1 findings open against the changed area are resolved or explicitly
  risk-accepted by the operator in writing (in the risk register).
- The release gate in §5 passes.
- No new table touching tenant data ships without RLS enabled in the same migration.
- No new code path returns a raw database/ORM error string to an end user.
- No live external send (email/SMS/payment-mutating call) is reachable without its
  documented gate.

This is a floor, not a ceiling — P2/P3 findings are tracked, not blockers.

## 10. Known Non-Negotiables

- No cross-tenant data exposure, ever, including via debug/admin tooling.
- No service-role key (`SUPABASE_SERVICE_ROLE_KEY`) reachable from client-side code.
- No live notification sending without explicit, conscious approval to flip the gates
  described in [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md).
- No unauthenticated access to protected (tenant or customer) data.
- No raw database errors exposed to end users (see
  [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) finding APPSEC-07 for current
  status of this item).
