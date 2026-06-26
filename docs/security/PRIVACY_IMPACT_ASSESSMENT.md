# Privacy Impact Assessment (PIA)

Owner: Privacy Owner. This is an internal engineering-led PIA to identify and
mitigate privacy risk in the current architecture. It is **not** a substitute for
a legal Data Protection Impact Assessment under any specific statute — see §8.

## 1. Scope

Revora's web application (`apps/web`) and Supabase backend, as of `origin/main` @
`a3d21f078ff1e253a7050502d2b473a25271d9aa`. Covers business owner/staff,
customer-portal, and platform-admin processing of personal data.

## 2. Processing Purposes

| Purpose | Personal data involved | Necessity |
|---|---|---|
| Account creation & auth | Email, password (hashed by Supabase Auth), name | Necessary to operate the service |
| Business operations (CRM) | Customer name/contact, vehicle VIN/plate, service history | Core product function |
| Quotation/approval workflow | Pricing, customer signature/acknowledgement, device/user-agent metadata | Core product function; signature has legal/evidentiary purpose |
| Job/work order tracking | Vehicle + customer linkage, job notes/updates | Core product function |
| Complaint handling | Complaint text, evidence photos, internal staff responses | Core product function; internal notes must stay internal |
| Document storage | ID/insurance/photos as uploaded by business or customer | Core product function |
| Notifications (currently disabled live) | Customer name, contact channel (email/phone), message content | Product feature, gated off by default |
| Billing | Business payment/subscription data via Stripe | Necessary for Revora's own commercial relationship with the business |
| AI Vehicle Intelligence | VIN (to NHTSA), symptom/diagnostic text (to OpenAI) | Product feature; minimization applies (see §4) |
| Analytics (PostHog) | Usage events, potentially user/business identifiers | Product improvement; should avoid unnecessary personal data in event payloads |
| Error tracking (Sentry) | Exception context, potentially request/user data if not scrubbed | Operational necessity; needs scrubbing review |
| Platform admin oversight | Cross-tenant aggregate counts and per-business owner email (`admin_list_businesses`) | Necessary for platform operation; tightly gated by `is_super_admin()` |

## 3. Data Flow Summary

```
Customer / Staff browser
   -> Vercel (Next.js app, TLS)
   -> Supabase Postgres (RLS-scoped) / Supabase Auth / Supabase Storage (signed URLs)
   -> Stripe (billing, webhook-driven, signature-verified)
   -> OpenAI (vehicle symptom text, advisory explanation only)
   -> NHTSA vPIC (VIN only, public API)
   -> Resend / Twilio (disabled today; would carry customer email/phone + message text if enabled)
   -> PostHog (product analytics)
   -> Sentry (error telemetry)
```

All of the above except NHTSA and (today) Resend/Twilio are live data flows.
Resend/Twilio credentials exist server-side but live sending is gated off — see
[NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md).

## 4. Risk Assessment

| Risk | Likelihood | Impact | Current mitigation | Residual risk |
|---|---|---|---|---|
| Cross-tenant data exposure | Low (RLS verified on all 53 tables) | Severe | RLS + server-derived `business_id`, verified in this pass | Low — contingent on RLS staying intact; gate every future migration (see [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md)) |
| Raw error message leaking internal/personal detail | Was Medium-High | Medium | Fixed in this pass for non-auth server actions (generic message + server log) | Low–Medium remaining in untouched auth SDK messages (P3, documented) |
| Over-sharing with AI provider (OpenAI) | Low–Medium | Medium | Only symptom/diagnostic text sent, not full customer profile | Medium — no contractual/DPA confirmation reviewed for OpenAI usage; flag for legal |
| Notification content sent to wrong recipient if live-send enabled prematurely | Low today (disabled) | High if it occurred | Three-layer gate + dispatch secret | Low while gates remain in place; risk returns to Medium the moment live-send is enabled without a dry-run plan |
| Indefinite data retention (no purge policy) | High (no automation exists) | Medium | None automated; manual deletion possible | Medium — open item, see [DATA_RETENTION_AND_DELETION_PLAN.md](DATA_RETENTION_AND_DELETION_PLAN.md) |
| No self-service export/delete | High (feature doesn't exist) | Medium | Manual fallback only | Medium — open item, product/legal scoping needed |
| Audit log shadow-copy of personal data (`old_data`/`new_data`) complicating erasure | Medium | Medium | RLS restricts read access | Medium — needs legal guidance on reconciling audit retention with erasure requests |
| Analytics/error tools capturing unintended personal data | Unknown (not instrumented-audited line by line in this pass) | Medium | Not yet reviewed in depth | Medium — tracked in [DEVSECOPS_SECURITY_RUNBOOK.md](DEVSECOPS_SECURITY_RUNBOOK.md) as a follow-up |
| Cross-border data transfer (Supabase/Vercel/Stripe/OpenAI region) | Unknown region configuration not verified in this pass | Medium | N/A | Needs legal review of UAE PDPL cross-border transfer rules |

## 5. Data Minimization Observations

- AI Vehicle Intelligence sends symptom/diagnostic *text*, not the full customer or
  vehicle record, to OpenAI — good minimization, confirm this stays true as the
  feature evolves.
- VIN decoding sends only the VIN to NHTSA, a public government API with no
  customer-identifying fields attached — good minimization.
- Notification templates use UUID redaction before customer-facing display — good
  minimization of internal identifiers, though this is about display, not about
  limiting what's collected.

## 6. Recommendations (engineering-actionable, not legal)

1. Decide and document retention windows per
   [DATA_RETENTION_AND_DELETION_PLAN.md](DATA_RETENTION_AND_DELETION_PLAN.md), then
   build a deletion/export flow as a dedicated future project.
2. Confirm Sentry/PostHog scrubbing configuration excludes personal data fields
   (emails, names, free-text complaint/symptom content) from telemetry payloads.
3. Before enabling live notification sending, re-run this PIA's §4 row on
   notification risk and get explicit operator sign-off (see
   [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8).
4. Get written confirmation (DPA or equivalent) of OpenAI's data handling terms for
   the symptom/diagnostic text flow before scaling AI Vehicle Intelligence usage.

## 7. Stakeholders

Privacy Owner (this assessment), AppSec Reviewer (technical controls), DevSecOps
Owner (telemetry/secrets), Legal/Privacy Advisory Coordinator (regulatory framing),
Operator (final risk acceptance).

## 8. Required Legal Review — Disclaimer

This PIA is an engineering-led internal exercise to surface and reduce privacy risk
early. **It does not satisfy any formal legal Data Protection Impact Assessment
requirement, does not constitute legal advice, and does not certify compliance**
with UAE PDPL, GDPR, or any other privacy law. A qualified lawyer must review data
flows, cross-border transfers, and third-party processor terms before public
launch or before scaling data collection. See
[LEGAL_PRIVACY_REVIEW_CHECKLIST.md](LEGAL_PRIVACY_REVIEW_CHECKLIST.md).
