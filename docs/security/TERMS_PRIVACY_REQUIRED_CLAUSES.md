# Terms / Privacy Required Clauses (Drafting Pointers)

Prepared by: Legal/Privacy Advisory Coordinator role. **These are drafting
pointers and topic flags for qualified counsel to turn into actual legal
language — none of the bullet points below are ready-to-publish legal text.**

## Privacy Policy — Topics to Cover

- Identity of the data controller/processor for each data class (Revora vs. the
  tenant business) — see
  [PRIVACY_AND_DATA_GOVERNANCE.md](PRIVACY_AND_DATA_GOVERNANCE.md) §1.
- What personal data is collected, from whom (customer vs. staff vs. business),
  and why — see [DATA_CLASSIFICATION_MATRIX.md](DATA_CLASSIFICATION_MATRIX.md).
- Third parties data is shared with: Supabase, Vercel, Stripe, OpenAI, NHTSA
  (VIN only), PostHog, Sentry, and Resend/Twilio if/when live notifications are
  enabled.
- Retention periods per data class (pending confirmation — see
  [DATA_RETENTION_AND_DELETION_PLAN.md](DATA_RETENTION_AND_DELETION_PLAN.md)).
- How a user can request export or deletion (currently manual/ad hoc — counsel
  should confirm whether this must be productized before claiming the right in
  the policy).
- AI processing disclosure: symptom/diagnostic text sent to OpenAI for advisory
  explanations; VIN sent to NHTSA for decoding.
- Notification opt-out mechanism (exists in code, gated behind disabled live
  send).
- Breach notification commitment, consistent with whatever timeline counsel
  determines is legally required.
- Cookie/session usage (Supabase Auth session cookies).

## Terms of Service — Topics to Cover

- Revora's role as a platform/processor vs. the business's role as controller
  of its own customer relationships and data.
- Acceptable use (no using the platform to harass customers, no spam via the
  notification feature once enabled, etc.).
- **AI disclaimer**: Vehicle Intelligence outputs (diagnostic guidance, VIN
  decode) are advisory only, not a substitute for in-person professional
  inspection; critical-severity guidance always defers to "stop driving, contact
  the workshop" rather than DIY repair — counsel should confirm the ToS
  liability language matches this actual product behavior (see
  [AI_SAFETY_TEST_MATRIX.md](AI_SAFETY_TEST_MATRIX.md)).
- **Limitation of liability** for AI-generated content specifically, separate
  from general limitation-of-liability language.
- Billing terms tied to Stripe subscription behavior (plan tiers, renewal,
  cancellation via Stripe's customer portal).
- Data retention/deletion commitments, consistent with the privacy policy and
  whatever counsel confirms is legally accurate.
- Account suspension/termination conditions (e.g. for abuse of the platform).
- Dispute resolution / governing law (UAE, presumably — confirm with counsel).

## Data Processing Agreement (Revora ↔ Tenant Business) — Topics to Cover

- Scope of processing Revora performs on the business's behalf (hosting,
  storage, notification dispatch, AI advisory processing of the business's
  customer data).
- Sub-processor list: Supabase, Vercel, Stripe, OpenAI, Resend, Twilio, PostHog,
  Sentry — with a commitment to notify the business of material changes.
- Security commitments referencing this program's controls (RLS-enforced
  isolation, signed-URL document access, webhook signature verification) as
  evidence of "appropriate technical measures," framed by counsel in whatever
  legal language is required.
- Data subject request handling responsibilities split between Revora
  (platform-level technical execution) and the business (initial
  receipt/validation of the request from their own customer).
- Breach notification obligations from Revora to the business.

## Explicit Reminder

None of the above is publishable language. Engineering has provided the
*factual* basis (what data, what flows, what controls exist) — qualified counsel
must produce the actual clauses, and the Operator must not present any draft from
this document as a finished legal artifact to customers, partners, or
regulators.
