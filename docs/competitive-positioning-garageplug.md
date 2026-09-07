# Positioning: Revora vs GaragePlug

**Purpose:** Establish where Revora actually competes with GaragePlug, where it loses on a
feature checklist, and what that implies for roadmap sequencing and sales framing.

**Evidence basis (assessed 2026-09-07):**

- **Revora claims are verified against this repository** — migrations in `supabase/migrations/`,
  routes under `apps/web/src/app/[locale]/`, and modules under `apps/web/src/lib/`. Every
  capability and every gap below is traceable to a file or table named in this document.
- **GaragePlug claims are second-hand.** `garageplug.com`, GetApp and Capterra product pages were
  unreachable from the assessment environment; the GaragePlug side is drawn from search-result
  summaries of those review sites, not primary vendor pages. Treat it as directionally reliable and
  **re-verify before using any specific claim in outbound sales or marketing collateral.**

---

## 1. Thesis

Revora and GaragePlug are not the same category of product.

**GaragePlug is a mature, broad workshop operations system.** Its depth is on the shop floor:
inventory, barcode, inspections, appointments, technician workflow. It reports 200+ brands across
25+ countries.

**Revora is a trust-and-approval platform with a first-class customer portal.** Its depth is in the
commercial and legal layer around the job: versioned quotations, signed approvals with a
defensible evidence trail, a customer-facing complaints workflow, Arabic-first bilingual UX, and
AI vehicle intelligence with a safety envelope.

**Revora loses a feature-count comparison today and wins on architecture, tenancy model,
Arabic-native design, and the approval/dispute chain.** Both halves of that sentence should drive
decisions: the first sets the roadmap, the second sets the pitch.

---

## 2. Where Revora is behind

Each row below is verified absent from the schema and codebase — not merely undocumented.

| Capability | Revora status | Evidence |
|---|---|---|
| Parts/spare inventory, stock levels, goods receipt, consumption-on-job | **Absent.** A `products` catalog exists (part number, brand, supplier, price, warranty terms, expected lifespan) but carries **no stock quantity, movement ledger, or reorder logic** | `0001_core_schema.sql` → `public.products` |
| Barcode scanning | Absent. VIN is decoded via AI, never scanned | no barcode code path in `apps/web/src` |
| Appointment / booking calendar | Absent — no scheduling table or route | table inventory across `supabase/migrations/` |
| Technician time tracking, labor hours, productivity | Absent. `jobs.assigned_to` and `job_tasks.assigned_to` exist; no time capture | `0001_core_schema.sql` → `public.jobs`, `public.job_tasks` |
| Digital vehicle inspection templates (structured checklist + photo per point) | Absent. `media_assets` / `vehicle_media_uploads` are raw attachment storage, not structured inspections | `0016_storage_media.sql`, `0024_vehicle_intelligence.sql` |
| Accounting integration (QuickBooks and similar) | Absent | no integration module |
| Native mobile apps (staff or customer) | Absent — web only. An Expo app is listed as future work in the root `README.md` | `README.md` |
| WhatsApp channel | Absent — email (Resend) and SMS (Twilio) only | `src/lib/notifications/provider.js` |
| Automated service / mileage reminders | Absent. All **9** notification templates are transactional (`quote_sent`, `quote_approved`, `quote_rejected`, `job_status_changed`, `job_completed`, `complaint_submitted`, `complaint_status_changed`, `feedback_submitted`, `vehicle_safety_critical`). Nothing is time- or odometer-triggered | `src/lib/notifications/templates.js` |
| Market proof | Pre-scale | — |

**The inventory gap is the single most commercially significant one.** For a tire shop or a
parts-heavy garage, stock control is frequently the reason software gets bought at all. Expect it
to appear as a hard disqualifier in competitive deals, not as a nice-to-have.

---

## 3. Where Revora is ahead

### 3.1 A genuine three-audience architecture

Separate business dashboard, customer portal, and platform/root admin console
(`/admin/tenants`, `/admin/subscriptions`, `/admin/billing`, `/admin/audit-logs`,
`/admin/users`, `/admin/admins`). Authorization derives from `platform_admins` and
`business_members`; tenant isolation is enforced by Postgres RLS on `business_id` **at the
database layer, not in application code**.

GaragePlug is positioned as multi-location workshop software. Revora is built as a multi-tenant
SaaS platform with its own tenant-operations surface. That is a different structural commitment,
and it is the part that is expensive for a competitor to retrofit.

*Evidence: `0002_rls_policies.sql`, `0009_platform_admins.sql`, `0012_admin_frontend_rpc.sql`,
`0020_admin_filtered_list_rpcs.sql`, `src/lib/permissions.ts`.*

### 3.2 A legally defensible approval chain — the sharpest differentiator

The flow is `quotations` → `quotation_revisions` (versioning) → `approvals` → `jobs`.

The `approvals` record captures: quotation version, terms version (`terms_versions`),
acknowledgement language, acknowledgement text, signature asset, IP address, user agent, and
device data — under a uniqueness constraint per `(quotation_id, quotation_version)`.

GaragePlug offers "job cards with digital signatures." Revora records **which version of which
terms, in which language, was approved from which device, at which time.** In a customer dispute
those are materially different artifacts. This is the capability most worth leading with in a
market where approval disputes are a real operational cost.

*Evidence: `0001_core_schema.sql` → `public.approvals`, `public.terms_versions`;
`0007_atomic_quote_creation.sql`, `0008_secure_quote_creation.sql`, `0015_jobs_from_approval.sql`,
`0018_approval_signature.sql`.*

### 3.3 A customer-facing complaints and dispute module

Threaded `complaint_messages`, `complaint_evidence` attachments, staff assignment, and customer
submission from the portal (`/portal/complaints/new`). Separately, `feedback_reports` and
`business_ratings` capture satisfaction and reputation signal.

GaragePlug's nearest equivalent is service feedback collection. Revora treats a dispute as a
first-class, auditable workflow rather than a survey response.

*Evidence: `0006_customer_complaints_hardening.sql`, `0017_media_evidence_read.sql`,
`0027_business_ratings.sql`, `0029_launch_ops_foundation.sql`.*

### 3.4 Arabic-first bilingual design, not a translation layer

`/en` and `/ar` are canonical routes with RTL throughout; message catalogs are at exact parity
(1,593 lines each in `src/messages/en.json` and `ar.json`); notification templates are bilingual
per channel; AED and date formatting use Western-digit helpers.

GaragePlug lists Arabic among its supported languages, but Arabic quality is called out as an
improvement area in its own public reviews — consistent with retrofitted i18n rather than
RTL-native UI. For a UAE-first go-to-market this is a durable advantage, and it is one a
prospect can verify in sixty seconds during a demo.

*Evidence: `docs/rtl-arabic-epic.md`, `src/messages/`, `src/lib/formatters.ts`, `src/lib/money.ts`.*

### 3.5 AI Vehicle Intelligence with a safety and audit envelope

VIN decoder, DTC decoder, symptom-based diagnosis and AI search in the dashboard
(`/ai/vin-decoder`, `/ai/dtc-decoder`, `/ai/vehicle-diagnosis`, `/ai/search`), plus a
customer-facing health check (`/portal/ai/health-check`).

The differentiator is not the AI — it is the envelope around it: JSON schema validation of every
model response, safety-risk classification, enforced safety overrides, sanitized customer
self-check steps, and full audit via `ai_tool_calls` and `ai_safety_flags`. Customer-facing
automotive AI without that machinery is a liability rather than a feature; this is what makes it
defensible.

*Evidence: `0024_vehicle_intelligence.sql`, `src/lib/vehicle-intelligence/` (`safety.js`,
`schemas.js`, `service.ts`), `docs/security/AI_SAFETY_TEST_MATRIX.md`.*

### 3.6 Commercial tooling for recurring revenue

A retainer calculator with margin/discount math and Essential/Growth/Premium scenario tiers, a
membership-bundle generator, and a customer-facing `/portal/memberships` view.

This is business-model tooling — it helps a workshop **sell service contracts**, which is a
category above job-card software. GaragePlug has no visible analogue.

*Evidence: `0025_retainer_pricing_scenarios.sql`, `0026_membership_bundles.sql`,
`src/lib/retainer/`, `src/lib/bundles/`.*

### 3.7 Native SaaS billing

Stripe subscriptions, plan catalog with per-plan features, invoices, invoice items, payment
events, webhook signature verification and replay idempotency.

Note the distinction: **Revora bills its own tenants.** GaragePlug's billing features are about
the workshop billing its customers. These solve different problems and are not comparable line
items.

*Evidence: `0019_billing_invoices_payments_and_plan_catalog.sql`,
`0021_stripe_webhook_idempotency.sql`, `src/lib/stripe-webhook.ts`.*

### 3.8 Structured onboarding and implementation operations

`business_implementation_progress` with staged onboarding, import templates, and a launch-ops API
— infrastructure for scaling tenant activation rather than hand-holding each account.

*Evidence: `0029_launch_ops_foundation.sql`, `src/lib/launch-ops.js`,
`src/lib/implementation-readiness.js`, `src/app/api/launch-ops/`.*

---

## 4. Where they overlap

Neither side wins the deal here; these are table stakes:

customer and vehicle records with history · job / work-order management · quotes and invoicing ·
document storage · multi-branch support · email and SMS notifications · role-based access ·
reporting and analytics dashboards

---

## 5. Strategic implications

### 5.1 The framing risk

Revora is not an inferior GaragePlug — it is a different wedge: **trust, approvals, disputes,
Arabic-first customer experience, and recurring-revenue tooling** for the Gulf market.

The concrete risk is that a buyer evaluating on a feature checklist scores Revora against a
general-purpose workshop suite and marks it down on inventory and scheduling before ever reaching
the approval chain. Sales framing should move the evaluation onto approval defensibility, dispute
handling and Arabic UX **early in the conversation**, not as a rebuttal after a checklist has
already been scored.

### 5.2 Roadmap sequencing implied by the gaps

This section states priorities implied by the analysis. It is **not** authorization to begin any
of this work — each item needs to be assigned explicitly.

1. **Inventory / parts consumption — highest priority.** The most common hard blocker in a
   competitive deal. `public.products` is a usable foundation: it already carries part number,
   supplier, price and warranty terms. The missing pieces are stock levels, a movement ledger, and
   consumption against a job.
2. **Appointments / booking — second.** Materially cheaper than inventory and closes the second
   most visible checklist gap.
3. **Digital inspections — third.** Deliberately third because it *compounds* with infrastructure
   that already exists (media/evidence storage, the approval chain, safety-classified AI output)
   rather than duplicating it. Built after the approval chain, an inspection becomes signed,
   versioned evidence — which is a stronger product than GaragePlug's equivalent, not merely
   parity with it.

Items 1 and 2 are catch-up. Item 3 is where catch-up converts back into differentiation.

---

## 6. Maintenance

Re-verify before external use. The Revora column decays as the product ships; the GaragePlug
column is second-hand from the outset and should be refreshed against primary vendor sources
before any claim here is repeated in customer-facing material.
