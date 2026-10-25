# Revora — AI Automation and Agentic AI Catalog

**Scope:** every AI automation and agentic-AI opportunity across the consumer
journey, from the moment someone submits an inquiry through social media, a
Meta ad or a phone call, through booking, intake, diagnosis, quoting, work,
invoicing, handover, retention, complaints, business intelligence and platform
administration.

Every entry names the real table, route and helper it hooks into. Citations
are machine-verified against `supabase/migrations` and the app tree by
[audit-ai-catalog.mjs](scripts/audit-ai-catalog.mjs); anything marked **(new)**
does not exist yet and was confirmed absent.

---

> **Status, 2026-10-25.** The finding below was measured on 2026-10-24 and was
> accurate then. Since then the Stage 0 schema (migration 0048) and the Meta and
> WhatsApp inbound routes have been built on `feat/stage0-inbound-capture`; see
> [the Stage 0 design](docs/ai-automation/STAGE0_INBOUND_CAPTURE_DESIGN.md).
> Voice and email capture, and the `/leads` (new) work queue, remain unbuilt. Entries
> still marked **(new)** have been re-verified as genuinely absent.

## The finding that reorders everything

**The journey you described has no entry point in Revora today.**

Measured, not assumed:

| Probe | Result |
|---|---|
| Tables matching `leads` / `inquiry` / `enquiry` | **0** |
| Inbound webhook routes (social, ads, voice, email) | **0** |
| Meta / Instagram / WhatsApp integration code | **0** (only privacy-policy prose and a notification-panel label) |
| Voice, telephony or transcription code | **0** |
| Total API routes in the app | **5** — cron scan, notification dispatch, Stripe webhook, launch-ops templates, auth callback |
| Total tables in schema | **66** |

In plain terms: there is no leads or inquiry table, and no inbound route of any
kind — nothing in Revora can receive a message from a stranger.

Twilio appears in the codebase, but only **outbound**: `resolveNotificationProvider()`
maps the `sms` channel to Twilio for sending. Nothing receives.

The app's first-class record is `public.customers`, created by a staff member
in `/customers/new`. Everything downstream — `public.vehicles`, `public.jobs`,
`public.quotations`, `public.invoices` — hangs off a customer who already
exists. **There is no object representing "a stranger who just asked a
question."** Stage 0 below is therefore not an enhancement; it is the missing
first third of the funnel, and nine of the automations in this catalog cannot
be built until it exists.

---

## The foundation that already exists (and is good)

Revora already has a disciplined AI layer. Do not build a second one.

| Piece | Where | What it gives you |
|---|---|---|
| Single model call site | `callOpenAiJson()` in [openai.js](apps/web/src/lib/vehicle-intelligence/openai.js) | JSON-mode, temp 0.2, `gpt-4.1-mini` default, returns `{ok:false}` instead of throwing |
| Audit ledger | `public.ai_tool_calls` via `saveAiToolCall()` | tool name, input, output, model, status (`success`/`error`/`blocked`), `duration_ms`, `safety_flagged`, tenant-scoped by RLS |
| Safety layer | `classifySafetyRisk()`, `enforceSafetyOverrides()`, `sanitizeCustomerSelfCheckSteps()` in [safety.js](apps/web/src/lib/vehicle-intelligence/safety.js) | four risk levels, matched-term capture, stop-driving warnings, written to `public.ai_safety_flags` |
| Deterministic degradation | `buildFallbackDiagnostic()`, `buildCustomerExplanation()` in [fallbacks.js](apps/web/src/lib/vehicle-intelligence/fallbacks.js) | the feature still answers when the model is unreachable |
| Output validation | [schemas.js](apps/web/src/lib/vehicle-intelligence/schemas.js) | model output is parsed and shape-checked before it reaches the database |
| Feature gating | `requireFeature()` in [guard.ts](apps/web/src/lib/features/guard.ts) | six-flag registry; `vehicleIntelligence` defaults **off** |
| Scheduled-agent precedent | `/api/maintenance/reminders/scan` + `isAuthorizedCronRequest()` | constant-time shared-secret auth for unattended runs |
| Outbound delivery | `/api/notifications/dispatch`, `canAttemptLiveSend()` | Resend + Twilio behind a **triple** kill switch (global dispatch, global live-send, per-business), with `public.notification_delivery_attempts` as the receipt ledger |
| Tenant and role boundaries | `requireMembership()`, `requireCustomerPortal()`, `requireSuperAdmin()` in [auth.ts](apps/web/src/lib/auth.ts) | every automation must pass through one of these three |

**Six AI tools ship today**, all vehicle-centric: `vin_decoder`, `dtc_decoder`,
`vehicle_diagnosis`, `vehicle_intelligence_search`, `quote_draft_generator`,
`vehicle_media_upload` — surfaced at `/ai` and `/portal/ai/health-check`.

Every automation below should extend this pattern: one call site, one ledger
row, one safety pass, one deterministic fallback, one feature flag.

---

## Autonomy tiers

Use these words consistently; they decide how much review an automation needs.

- **T1 — Suggest.** AI drafts, a human sends. No side effects. Default for
  anything customer-facing.
- **T2 — Act with reversal.** AI writes a record a human can undo before it
  matters (a draft quote, a proposed slot, a tentative tag).
- **T3 — Act within a bounded policy.** AI acts unattended inside limits the
  owner set (reply to an FAQ, book into a pre-approved slot, send a reminder).
- **T4 — Act on money, safety or the customer relationship.** Price changes,
  approvals, refunds, safety verdicts, complaint resolutions. **Owner-only.**
  AI may prepare but never commit.

Revora's existing safety layer already implements the T4 boundary for
diagnosis: a critical risk forces a stop-driving warning and strips
self-service steps regardless of what the model said.

---

## Stage 0 — Inbound capture (does not exist; build first)

This stage is pure greenfield. It needs one new spine before any automation:
`public.leads`, `public.lead_messages`, `public.channel_identities`,
and inbound routes `/api/inbound/meta`, `/api/inbound/whatsapp`,
`/api/inbound/voice` (new), `/api/inbound/email` (new). Each must be
signature-verified the way `/api/stripe/webhook` already is, and each must
resolve to a `public.businesses` row before a single byte is stored, or Stage 0
becomes a cross-tenant hole.

### A1. Unified inquiry inbox
Normalises every channel into one `public.leads` row with a channel-agnostic
shape, so triage, SLA and reporting have one object to work with. Not AI itself
— it is the substrate the next nine entries need. Surface at `/leads` (new).
**T2.**

### A2. Social DM response agent (Instagram, Facebook, TikTok)
Reads an inbound DM, classifies intent, answers from the business's own service
list (`public.services`, `public.products`) and opening hours
(`public.branch_appointment_settings`), and either answers or escalates. Writes
each turn to `public.lead_messages` and each model call to `public.ai_tool_calls`.
Must never quote a price it invented — prices come from `public.services` or
not at all. **T3 inside an owner-defined FAQ scope; T1 otherwise.**

### A3. Meta Ads lead-form ingestion and enrichment
Receives lead-form submissions, deduplicates against `public.customers` and
`public.channel_identities`, infers vehicle make/model/year from free text,
and attaches campaign attribution so `/analytics` can finally report cost per
booked job rather than cost per click. **T2.**

### A4. AI voice receptionist
Answers the phone out of hours, captures caller, vehicle and symptom, offers a
slot, and writes `public.voice_calls` (new) plus `public.call_transcripts` (new).
A missed 4pm Friday call is currently a permanently lost job with no record
that it happened; this is the single highest-value automation in the catalog
for that reason. Must honour the same stop-driving safety rules as
`/ai/vehicle-diagnosis` — a caller describing brake failure gets a safety
script, not a booking offer. **T3 for booking into pre-approved slots; T4 for
anything priced.**

### A5. Web and WhatsApp chat intake agent
Same brain as A2 on a different transport, embedded on the marketing site and
on WhatsApp Business. Should hand a warm, pre-filled context to
`/portal/appointments/new` rather than trying to complete everything in chat.
**T3.**

### A6. Call and voicemail transcription with summary
Transcribes inbound calls into `public.call_transcripts` (new), extracts
vehicle, symptom, urgency and promised follow-up, and attaches the summary to
the lead. Turns the phone from an unsearchable channel into a queryable one.
**T2.**

### A7. After-hours and overflow routing
Decides, per inquiry, whether to auto-answer, hold for morning, or page an
on-call human, using `public.branch_appointment_settings` and
`public.business_notification_settings`. Pure policy with an AI urgency input.
**T3.**

---

## Stage 1 — Triage and qualification

### A8. Lead intent and service classifier
Labels each `public.leads` row: service type, vehicle class, job size,
likely revenue, and confidence. Feeds the work queue order. Extends the
existing `callOpenAiJson()` pattern exactly. **T2.**

### A9. Vehicle identity resolution from free text
"My 2018 Patrol is making a noise" becomes a matched `public.vehicles` row, or
a new one pre-filled via the existing VIN path (`decodeVinForVehicle()`), with
`public.vehicle_odometer_readings` captured if the customer mentions mileage.
**T2.**

### A10. Duplicate and identity matcher
Reconciles a phone number, an Instagram handle and an email as one person
across `public.customers` and `public.channel_identities`. Without this,
every channel builds its own shadow customer list. **T2.**

### A11. Urgency and safety triage
Runs `classifySafetyRisk()` on the inbound text *before* a human reads it, so a
brake or steering complaint jumps the queue and is recorded in
`public.ai_safety_flags`. The classifier already exists and is already
tenant-scoped — this is reuse, not new modelling. **T3.**

### A12. Language and locale router
The app is already locale-routed (every page sits under a `[locale]` segment). Detect the
inquiry's language, set the lead's locale, and keep every later generated
message in it. Arabic/English parity matters for the GCC market the legal docs
target. **T2.**

### A13. Spam, bot and abuse filter
Keeps `public.leads` clean and protects the inbound routes, complementing
the existing `public.auth_rate_limits` work. **T3.**

---

## Stage 2 — Booking and scheduling

### A14. Slot recommender
Proposes appointment times from `public.appointments`,
`public.branch_appointment_settings` and `public.branches`, weighted by bay
capacity, technician skill and job duration. **T2.**

### A15. Autonomous booking agent
Completes a booking end-to-end from chat or voice, writing
`public.appointments` and confirming through `/api/notifications/dispatch`.
Bounded: only slots the owner marked bookable, only service types on an
allow-list. **T3.**

### A16. No-show risk prediction
Scores each upcoming `public.appointments` row on history, channel, lead time
and deposit status, and drives differentiated reminder intensity. **T2.**

### A17. Reschedule and waitlist agent
When a slot frees, picks the best waiting customer and offers it. When a
customer cancels, offers alternatives before the slot is lost. **T3.**

### A18. Capacity and overbooking advisor
Tells the owner, before the week starts, where `/appointments` is over- or
under-committed against realistic job durations from `public.job_tasks`
history. **T1.**

---

## Stage 3 — Intake and inspection

### A19. Arrival intake from photos
Customer or advisor photographs the car; AI reads the VIN plate and number
plate, decodes via the existing `vin_decoder` tool, and pre-fills
`public.vehicles` and `public.vehicle_media_uploads`. **T2.**

### A20. Damage and condition detection
Analyses `public.media_assets` and `public.inspection_item_media` to flag
pre-existing damage at check-in — the dispute-prevention record. Writes
findings as `public.inspection_items` for a human to confirm. **T2.**

### A21. Voice-driven inspection copilot
A technician under a car speaks findings; AI fills
`public.vehicle_inspections` and `public.inspection_items` against the chosen
`public.inspection_templates`. The digital-vehicle-inspection schema
(migration 0037) and `/inspections/new` already exist; this removes the
keyboard. **T2.**

### A22. Measurement reader
Reads tyre tread depth, brake pad thickness and fluid levels from photos into
the numeric fields on `public.inspection_items`, so red/amber/green is
measured rather than eyeballed. **T2.**

### A23. Inspection narrative generator
Turns completed `public.inspection_items` into a plain-language report the
customer actually reads, published to `/portal/inspections` and the existing
share link at `/i/[token]`. Must pass `sanitizeCustomerSelfCheckSteps()` so no
unsafe DIY advice reaches a customer. **T1.**

---

## Stage 4 — Diagnosis and estimation

### A24. Symptom-to-diagnosis — **already built**
`analyzeVehicleSymptoms()` writes `public.vehicle_symptom_reports` and
`public.vehicle_diagnostic_results` at `/ai/vehicle-diagnosis`, with a
customer-facing variant at `/portal/ai/health-check`. The remaining work is
breadth, not existence.

### A25. DTC interpretation — **already built**
`dtc_decoder` writes `public.vehicle_dtc_codes` at `/ai/dtc-decoder`.

### A26. Parts and labour estimator
Converts a diagnosis into priced `public.quotation_items` using
`public.products`, `public.services` and the business's own historical
`public.job_performed_items`. This is where the existing
`quote_draft_generator` tool should grow teeth. **T2 as a draft; T4 to commit a
price.**

### A27. Repair-duration predictor
Predicts bay time from the business's own `public.job_tasks` completion
history, feeding A14 and A18 so scheduling stops relying on guesses. **T2.**

### A28. Diagnostic second opinion and consistency checker
Re-runs a diagnosis with a different prompt or model and flags disagreement
into `public.ai_safety_flags`. This is the positive control for the AI itself —
a diagnosis no one ever contradicts is not thereby correct. **T1.**

### A29. Upsell and deferred-work identifier
Spots work found but not quoted — an amber inspection item that never reached
`public.quotations` — and surfaces it as revenue the shop already earned the
right to ask for. **T1.**

---

## Stage 5 — Approval and conversion

### A30. Quote explainer for the customer
Rewrites a `public.quotations` row into why-this-matters language per line
item, shown at `/portal/quotes/[id]`. The single biggest lever on approval
rate. **T1.**

### A31. Approval-chase agent
Watches `public.approvals` and `public.approval_events` for quotes sitting
unviewed or unanswered, and escalates through channels on a schedule, using the
existing dispatch route. **T3.**

### A32. Objection and price-sensitivity responder
When a customer pushes back in `/portal/quotes`, drafts a reply offering
staged work, a `public.membership_bundles` option, or a
`public.retainer_pricing_scenarios` alternative. Drafts only — discounting is
**T4.**

### A33. Bundle and membership recommender
Recommends from `public.membership_bundles` based on the vehicle's projected
`public.vehicle_maintenance_plans`. The bundle generator and retainer
calculator already exist at `/tools/membership-bundles` and
`/tools/retainer-calculator`; this makes them proactive. **T1.**

### A34. Quote revision summariser
Explains what changed between `public.quotation_revisions` so neither side
argues from memory. **T1.**

---

## Stage 6 — Work execution

### A35. Job task generator
Expands an approved quote into ordered `public.job_tasks` on the
`public.jobs` row, with skill tags and dependencies. The canonical approval
path (migration 0040) already connects approval to job creation. **T2.**

### A36. Technician assignment
Matches tasks to people using `public.business_members` and past completion
quality. **T2.**

### A37. Progress update writer
Turns technician shorthand into customer-ready `public.job_updates` visible at
`/portal/jobs/[id]`, so "we'll call you" stops being the only status. **T1.**

### A38. Delay and parts-shortage watcher
Detects a job stalling against its predicted duration and warns both the
advisor and the customer before the customer has to ask. **T3.**

### A39. Warranty-aware work router
Checks `public.warranties` before work is quoted or performed and flags
anything the customer should not be charged for. **T2.**

---

## Stage 7 — Invoicing and payment

### A40. Invoice drafter
Builds `public.invoices` and `public.invoice_items` from
`public.job_performed_items`, reconciling against the approved quote. Migration
0041's financial invariants are the guardrail — AI drafts, the constraints
decide validity. **T2.**

### A41. Invoice anomaly guard
Flags an invoice that departs from its quote, from the service history, or from
the business's own norms, before it is sent. A model that can draft an invoice
can draft a wrong one; this is that risk's control. **T1.**

### A42. Collections and dunning agent
Works unpaid `public.invoices` against `public.invoice_payments`, escalating
politely and on a schedule, and stopping instantly on dispute. **T3 up to an
owner-set ceiling; T4 beyond it.**

### A43. Payment reconciliation assistant
Matches Stripe events arriving at `/api/stripe/webhook` and
`public.billing_payment_events` to open invoices, and explains unmatched ones
instead of leaving them silent. **T2.**

### A44. Credit note and refund preparer
Prepares `public.invoice_credit_notes` with reasoning. Issuing is **T4,
owner-only.**

---

## Stage 8 — Handover and follow-up

### A45. Handover summary pack
Assembles what was found, what was done, what was deferred and what to watch,
from `public.vehicle_inspections`, `public.job_performed_items` and
`public.documents`, delivered to `/portal/documents`. **T1.**

### A46. Post-service check-in
Times a follow-up by job type, asks the right question, and routes a bad answer
straight to `/complaints` rather than to a review site. **T3.**

### A47. Review solicitation timing
Asks for a review only when sentiment and `public.business_ratings` history
suggest it will land well. **T3.**

### A48. Feedback synthesis
Clusters `public.feedback_reports` into themes with representative quotes,
rather than leaving the owner to read every row at `/feedback`. **T1.**

---

## Stage 9 — Retention and reactivation

### A49. Maintenance reminder intelligence — **already built**
`runMaintenanceReminderScan()` at `/api/maintenance/reminders/scan` projects
due work from `public.vehicle_maintenance_plans`,
`public.vehicle_odometer_readings` and `public.business_maintenance_settings`,
surfaced at `/maintenance`. This is Revora's one existing unattended agent and
the template for every other scheduled one.

### A50. Lapse and churn prediction
Scores customers who have gone quiet relative to their own service rhythm, not
a global average. **T2.**

### A51. Reactivation campaign agent
Drafts and sequences win-back outreach for lapsed customers, personalised to
the vehicle's actual deferred work from A29. **T3.**

### A52. Next-best-action per customer
One ranked recommendation per `public.customers` row — book, remind, quote,
upsell, apologise — shown on `/customers/[id]`. **T1.**

### A53. Seasonal and fleet demand forecasting
Predicts demand from `public.jobs` and `public.appointments` history so
staffing and parts ordering stop being reactive. **T1.**

---

## Stage 10 — Complaints and service recovery

### A54. Complaint triage and severity scoring
Classifies a new `public.complaints` row from `/portal/complaints/new` on
severity, theme and regulatory exposure, and routes it. **T2.**

### A55. Customer-safe reply drafter
Drafts replies to `public.complaint_messages` — and this one carries a specific
hard constraint from `AGENTS.md`: internal complaint messages must never reach
the customer. The drafter must read internal context without quoting it, and
that boundary needs its own test, not a prompt instruction. **T1, always.**

### A56. Root-cause clustering
Groups complaints with `public.complaint_evidence` and job data to find the
technician, part, service or branch behind a pattern. **T1.**

### A57. Escalation and SLA watchdog
Watches complaint age and sentiment trajectory and escalates before a customer
goes public. **T3.**

### A58. Goodwill and remedy proposer
Proposes a remedy with precedent from similar resolved complaints. Granting it
is **T4, owner-only.**

---

## Stage 11 — Business intelligence (owner copilot)

### A59. Natural-language analytics
"Why was last month down?" answered against the tenant's real data, extending
`/analytics`. Must run as the asking user so RLS, not prompt text, enforces
what they may see. **T1.**

### A60. Anomaly digest
A short daily or weekly brief of what actually changed — conversion, margin,
cycle time, no-shows — instead of a dashboard nobody opens. Delivered through
the existing notification path. **T3.**

### A61. Pricing and margin advisor
Compares quoted against performed work across `public.quotation_items` and
`public.job_performed_items` to find systematically underpriced services.
**T1.**

### A62. Technician performance and coaching insights
Surfaces rework rates, estimate accuracy and comeback patterns per
`public.business_members`. Sensitive by nature — this one needs an explicit
owner decision about visibility before it is built. **T1.**

### A63. Document and knowledge search
Semantic search across `public.documents`, `public.job_updates` and
`public.complaint_messages`, backed by a new `public.ai_embeddings` (new) table.
Note: **pgvector is not installed** — only `pgcrypto` is. That extension is a
prerequisite, not a detail. **T1.**

---

## Stage 12 — Platform and root admin

### A64. Tenant health and churn scoring
Scores each `public.businesses` row on activation and usage depth for
`/admin/tenants`, using `public.business_implementation_progress`. **T1.**

### A65. Abuse, fraud and anomaly detection
Watches `public.audit_events` and `public.auth_rate_limits` for cross-tenant
probing and credential abuse, surfaced at `/admin/audit-logs`. Must itself run
under `requireSuperAdmin()`. **T2.**

### A66. Support copilot over audit trails
Lets an admin ask what happened to a specific record and get an answer
assembled from `public.audit_events` and `public.ai_tool_calls`. **T1.**

### A67. Onboarding and implementation agent
Drives a new tenant through `/onboarding` and `/implementation`, generating
starter `public.services`, `public.inspection_templates` and
`public.notification_preferences` from a description of their business. The
import-template machinery at `/implementation/import-templates` already exists.
**T2.**

### A68. Subscription and plan-fit advisor
Recommends plan changes from `public.subscriptions`, `public.billing_plans` and
actual usage, for `/admin/subscriptions`. **T1.**

---

## Cross-cutting infrastructure the agentic entries need

Agentic entries (A2, A4, A5, A15, A17, A31, A38, A42, A46, A51, A57, A60) are
not single model calls — they loop, hold state and act over time. They need
four things the codebase does not have:

1. **A run ledger.** `public.ai_agent_runs` (new) and `public.ai_agent_steps` (new):
   goal, step, tool call, outcome, cost, terminal state. `public.ai_tool_calls`
   records single calls, not multi-step runs; without this, an agent that loops
   wrongly is unauditable.
2. **A tool registry with per-tenant permissions.** Which agent may touch which
   table, under whose identity. Every tool must execute as a real user through
   `requireMembership()` or `requireCustomerPortal()` — never with the service
   role on a customer's behalf.
3. **A scheduler.** `/api/maintenance/reminders/scan` is the pattern; agentic
   work needs a general `/api/agents/run` (new) behind `isAuthorizedCronRequest()`.
4. **Evaluation.** `public.ai_evaluations` (new) plus prompt versioning in
   `public.ai_prompt_versions` (new). Six tools can be judged by eye; sixty-eight
   cannot.

**Three governance rules, drawn from constraints already in this repo:**

- **RLS is the boundary, not the prompt.** Every automation runs as a real
  principal. The views trap in migration 0047 and the composite-FK embed
  breakage in 0039 both show what happens when a data path bypasses the
  intended check — an AI tool that queries with the service role is the same
  class of hole with a friendlier interface.
- **Every outbound AI message inherits the triple kill switch.** Global
  dispatch, global live-send, per-business live-send. An agent that can message
  customers must be stoppable by the owner in one click.
- **T4 stays human.** Price, approval, refund, safety verdict, complaint
  resolution. AI prepares; the owner commits.

---

## Recommended build order

| Order | What | Why this position |
|---|---|---|
| 1 | Stage 0 spine — `public.leads`, `public.lead_messages`, inbound routes | Nine automations are blocked on it, and it is the only item here that is pure missing capability rather than missing intelligence |
| 2 | A4 voice receptionist, A6 transcription | Highest measurable revenue recovery: a missed call today leaves no record at all |
| 3 | A8–A11 triage | Makes Stage 0 volume survivable; A11 is near-free reuse of `classifySafetyRisk()` |
| 4 | A30 quote explainer, A31 approval chase | Direct conversion lift on quotes that already exist |
| 5 | A26 estimator, A40 invoice drafter | Biggest time saving per job, with migration 0041's invariants as the guardrail |
| 6 | Agent infrastructure (run ledger, registry, scheduler, evals) | Required before anything in the agentic list runs unattended |
| 7 | A2/A5 social and chat agents | They are brand voice in public; they should go live after the governance above, not before |
| 8 | Stage 11 owner copilot, A63 search | Needs pgvector and accumulated data to be worth anything |

**One decision is yours before any of this starts:** whether Revora owns the
inbound channels itself (Meta, WhatsApp and voice integrations, Stage 0 built
in-house) or integrates an existing CRM/telephony layer and consumes its
webhooks. That single choice changes roughly the first third of this catalog,
and it is not a call I should make for you.
