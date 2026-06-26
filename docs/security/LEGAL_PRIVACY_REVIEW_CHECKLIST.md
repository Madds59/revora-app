# Legal/Privacy Review Checklist

Prepared by: Legal/Privacy Advisory Coordinator role, as a structured handoff to
**qualified external counsel**. This document organizes engineering-observed facts
into review points — it does not interpret law, does not certify compliance, and
must not be presented to customers, regulators, or partners as a legal opinion.

> **Final legal/privacy approval must be performed by qualified counsel before
> real customer-wide rollout or live SMS/email activation.** Nothing in this
> document or its companions
> ([UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md](UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md),
> [TERMS_PRIVACY_REQUIRED_CLAUSES.md](TERMS_PRIVACY_REQUIRED_CLAUSES.md)) changes
> that requirement.

## Review Points for Counsel

1. **Privacy policy** — does a customer-facing and business-facing privacy policy
   exist and accurately describe the data flows in
   [PRIVACY_IMPACT_ASSESSMENT.md](PRIVACY_IMPACT_ASSESSMENT.md) §3 (Supabase,
   Vercel, Stripe, OpenAI, NHTSA, PostHog, Sentry, and Resend/Twilio if/when
   enabled)?
2. **Terms of service** — do they correctly describe Revora's role (platform
   processor) vs. the business's role (controller of its own customer data) for
   the UAE/GCC market? See draft clause pointers in
   [TERMS_PRIVACY_REQUIRED_CLAUSES.md](TERMS_PRIVACY_REQUIRED_CLAUSES.md).
3. **Data processing agreement** — is a DPA needed between Revora and each
   business tenant, given Revora processes the tenant's customers' personal data
   on the tenant's behalf?
4. **Customer consent** — what consent is required/sufficient for collecting
   vehicle/contact data, and for AI processing of symptom descriptions sent to
   OpenAI?
5. **Staff access consent** — do staff members need separate notice/consent for
   their own profile data being processed (name, email, role)?
6. **Uploaded document handling** — documents may include ID photos, signatures,
   damage photos (see [DATA_CLASSIFICATION_MATRIX.md](DATA_CLASSIFICATION_MATRIX.md)
   "Uploaded documents" row) — what handling/consent/retention rules apply?
7. **Vehicle/VIN/plate data handling** — is VIN/plate data treated as personal
   data under applicable law when linked to a customer record? (Engineering
   treats it as Restricted out of caution — see classification matrix — pending
   confirmation.)
8. **Complaint data handling** — internal staff notes vs. customer-visible
   messages; is there a regulatory angle (consumer protection) to complaint
   record-keeping in the UAE/GCC?
9. **Data retention** — confirm/adjust the proposed periods in
   [DATA_RETENTION_AND_DELETION_PLAN.md](DATA_RETENTION_AND_DELETION_PLAN.md) §2
   against actual UAE financial/legal minimums (e.g. accounting record retention)
   and any applicable maximums (erasure rights).
10. **Data deletion** — what erasure rights apply, and how do they interact with
    legal retention requirements for contracts/approvals/billing records (see
    classification matrix "Contract data" and "Billing/subscription records"
    rows)?
11. **Data export** — what format/scope is required for a portability request?
12. **Breach notification** — what are the notification timelines/recipients
    (regulator, affected businesses, affected customers) under applicable
    UAE/GCC law if a breach occurs? Feed into
    [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §7 incident process.
13. **Email notification consent** — required opt-in/opt-out model before any
    live email send is enabled.
14. **SMS notification consent** — same, plus telecom-specific rules (see
    [UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md](UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md)).
15. **Opt-out/unsubscribe** — confirm the `notification_preferences` mechanism
    (already implemented in code, gated behind disabled live-send) meets legal
    minimum requirements before go-live.
16. **UAE/GCC telecom and sender ID review** — see dedicated checklist.
17. **Third-party processors** — Supabase, Vercel, Stripe, PostHog, Sentry today;
    Resend/Twilio if/when enabled. Confirm each has adequate contractual terms
    (DPA, SCCs/cross-border transfer mechanism as applicable) for the data they
    process.
18. **AI disclaimer and safety language** — confirm customer-facing language
    makes clear AI Vehicle Intelligence output is advisory, not a substitute for
    professional inspection, especially given the engineering safety-override
    behavior described in [AI_SAFETY_TEST_MATRIX.md](AI_SAFETY_TEST_MATRIX.md).
19. **Limitation of liability for AI diagnostic outputs** — confirm ToS liability
    language adequately covers AI-generated advisory content.
20. **Customer-facing communication records** — confirm how long
    notification/complaint communication records should be retained as evidence
    of what was communicated to a customer, balanced against deletion rights.

## What Engineering Has Already Done (inputs for counsel, not legal conclusions)

- Built RLS-enforced tenant isolation so one business never sees another's
  customer data (see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)).
- Disabled live notification sending by default behind multiple gates.
- Scoped AI provider calls to symptom/diagnostic text rather than full customer
  profiles.
- Used signed, time-limited URLs for private document access.
- Documented (but not yet automated) a proposed retention/deletion approach.

## What Engineering Cannot Determine Alone

Whether any of the above is *sufficient* under UAE PDPL, GCC-member-state law, or
any other applicable framework; what specific clauses are legally required;
whether cross-border data transfer to Supabase/Vercel/OpenAI/Stripe/Resend/
Twilio's hosting regions requires additional safeguards. **All of this requires
qualified counsel.**
