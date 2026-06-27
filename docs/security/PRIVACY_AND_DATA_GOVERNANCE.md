# Privacy and Data Governance

Owner: Privacy Owner (see [SECURITY_ROLES_AND_RACI.md](SECURITY_ROLES_AND_RACI.md)).
This document is operational guidance prepared by the Privacy Owner function. It is
**not legal advice** and does not constitute a compliance certification — see the
disclaimer in §7.

## 1. Governance Principles

1. **Tenant data belongs to the tenant business**, not to Revora. Revora is a
   processor/platform; the business is the controller of its own customer data in
   most respects relevant to UAE/GCC practice (subject to qualified legal
   confirmation).
2. **Customers own their own personal data.** A customer can be linked to multiple
   businesses (one `customers` row per business relationship), and each business
   only ever sees the customer data tied to its own relationship — not a
   cross-business profile.
3. **Default-deny, not default-share.** Every new feature that touches personal data
   should start from "nobody can see this" and add the minimum necessary access via
   RLS, not start open and get locked down later.
4. **No surprise processing.** Personal data should not flow to a new third party
   (a new AI provider, a new analytics tool, a new notification channel) without
   updating the data classification/PIA and, where relevant, customer-facing
   disclosures.
5. **Minimize what's customer-facing vs internal-only.** Internal notes, internal
   complaint messages, audit logs, and AI tool-call internals are staff/platform
   data even when they reference a customer — they are not the customer's data to
   view.

## 2. Data Inventory

Full table-by-table breakdown: [DATA_CLASSIFICATION_MATRIX.md](DATA_CLASSIFICATION_MATRIX.md).
Source of truth for what tables exist is always the migrations under
`supabase/migrations/`, not this document — re-derive the inventory if migrations
have changed since 2026-06-26.

## 3. Where Personal Data Flows Today

- **Supabase Postgres** — system of record for all tenant/customer data (see
  classification matrix).
- **Supabase Storage** — uploaded documents/media (private bucket, signed URLs;
  public bucket reserved for non-personal assets like logos).
- **Stripe** — billing/payment data for the *business* (Revora's customer), driven
  by webhook, signature-validated.
- **OpenAI** (`OPENAI_API_KEY`, server-only) — receives vehicle symptom/diagnostic
  text for AI Vehicle Intelligence advisory explanations. This is a third-party
  data flow that should be disclosed in the privacy policy (see
  [TERMS_PRIVACY_REQUIRED_CLAUSES.md](TERMS_PRIVACY_REQUIRED_CLAUSES.md)).
- **NHTSA vPIC API** — receives VIN numbers for decoding (US government public API;
  no customer-identifying data beyond the VIN itself is sent).
- **Resend / Twilio** (server-only credentials present, live send currently
  disabled) — would receive customer email/phone and message content if live
  notification sending is ever enabled. See
  [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md).
- **PostHog** — product analytics; confirm event payloads do not include personal
  data beyond what's necessary (see DevSecOps logging review in
  [DEVSECOPS_SECURITY_RUNBOOK.md](DEVSECOPS_SECURITY_RUNBOOK.md)).
- **Sentry** — error tracking; error payloads can inadvertently capture personal
  data if exceptions include user objects/request bodies — flagged as a review item
  in the DevSecOps runbook.
- **Vercel** — hosting/runtime logs.

## 4. Logs and Leak Surfaces Reviewed

- Notification logs (`notification_events.payload`) can embed customer name/contact
  — access is business-scoped via RLS, and customer-facing displays go through
  UUID redaction, but raw payload should remain staff/platform-only.
- `audit_events.old_data`/`new_data` are unrestricted JSONB snapshots — see the
  classification matrix note on this being a shadow copy of other data classes.
- Raw database error messages were found to leak internal detail (constraint
  names, column names) to end users in multiple server actions — addressed in this
  pass as a security fix, see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)
  finding APPSEC-07. This is also a privacy-relevant finding: a verbose Postgres
  error can sometimes echo back submitted personal data.
- UI areas: dynamic routes use database UUIDs in the URL (e.g.
  `/quotations/[id]`); these are not guessable/enumerable in a way that leaks
  data (RLS still applies), but operators should avoid pasting such URLs into
  shared/public channels since the UUID itself is not a secret boundary.

## 5. Customer-Visible vs Internal-Only Data (by design intent)

| Customer-visible | Internal-only |
|---|---|
| Their own vehicles, quotations (customer-facing fields), job status updates, their own complaints + business-facing replies, their own documents/evidence, their own notification preferences | `quotations.internal_notes`, internal complaint messages/notes, `audit_events`, `ai_tool_calls`/`ai_safety_flags` raw detail, other customers' anything, business-wide settings/analytics, platform admin views |

Enforcement of this boundary is RLS-first (see
[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)); this table documents *intent*
so future features can be checked against it.

## 6. Notification Privacy Posture

- Live sending is disabled by default (env + per-business gates) — see
  [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md).
- A `notification_preferences` table exists for opt-out/channel preference; this
  must be honored before any live send is enabled, and customers should have a
  visible way to manage it in the portal.
- Before enabling live SMS/email at scale, confirm an unsubscribe/opt-out path is
  reachable from every message and complies with UAE/GCC telecom rules (see
  [UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md](UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md)).

## 7. AI Privacy Posture

- VIN decoding is grounded via NHTSA's public API — no customer-identifying data
  beyond the VIN is sent externally.
- Symptom/diagnostic text sent to OpenAI for advisory explanations may include
  customer-described vehicle issues; this should be disclosed in the privacy
  policy as a third-party AI processing flow, and the data sent should stay
  scoped to vehicle/symptom text — not full customer profiles.
- Safety-critical outputs are overridden server-side (`enforceSafetyOverrides`) so
  that liability-sensitive advice ("how to fix a brake failure yourself") is never
  shown — this is as much a privacy/liability control as a safety one.

## 8. Document Privacy Posture

- Private documents are access-controlled via signed URLs (short expiry, observed
  10 minutes) and storage-path partitioning by `business_id`.
- Evidence attached to complaints is readable by the linked customer via a
  dedicated carve-out RPC (`record_complaint_evidence`) that validates ownership —
  this should be re-checked whenever the evidence flow changes.

## 9. Required Legal Review

**This document and its companions
([DATA_CLASSIFICATION_MATRIX.md](DATA_CLASSIFICATION_MATRIX.md),
[DATA_RETENTION_AND_DELETION_PLAN.md](DATA_RETENTION_AND_DELETION_PLAN.md),
[PRIVACY_IMPACT_ASSESSMENT.md](PRIVACY_IMPACT_ASSESSMENT.md)) are operational
groundwork, not a compliance determination.** Before any real customer-wide
rollout, or before enabling live email/SMS sending, a qualified lawyer familiar
with UAE/GCC data protection, telecom, and consumer-protection law must review:
data classification sensitivity tiers, retention periods, cross-border transfer
implications (Supabase/Vercel/Stripe/OpenAI/Resend/Twilio may process data outside
the UAE), consent language, and breach notification obligations. See
[LEGAL_PRIVACY_REVIEW_CHECKLIST.md](LEGAL_PRIVACY_REVIEW_CHECKLIST.md).
