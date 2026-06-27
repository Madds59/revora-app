# UAE/GCC Notification Compliance Checklist

Prepared by: Legal/Privacy Advisory Coordinator role, for qualified counsel review.
**This checklist identifies questions to ask, not answers to legal questions.**
Applies specifically to the email (Resend) / SMS (Twilio) notification feature,
which is implemented in code but **disabled for live sending by default** — see
[NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md).

> Live SMS/email activation must not occur before this checklist is reviewed by
> qualified counsel familiar with UAE/GCC telecom and consumer-protection law.

## Questions for Counsel

1. **TDRA (UAE Telecommunications and Digital Government Regulatory Authority)
   rules on commercial/transactional SMS** — do Revora's planned message types
   (quote sent, job completed, complaint status changed, etc.) count as
   transactional (service) messages or marketing messages under TDRA guidance,
   and does that distinction change the consent/opt-out requirements?
2. **Sender ID registration** — does sending SMS to UAE numbers require a
   registered/approved sender ID, and if so, through which process/provider
   (relevant since Twilio is the planned SMS provider)?
3. **Cross-GCC variation** — if Revora's customers (the businesses) operate in
   or send to recipients in other GCC states, do those states have materially
   different telecom rules that need separate handling?
4. **Email anti-spam equivalent rules** — does the UAE (or relevant GCC state)
   have an email-equivalent of CAN-SPAM/PECR that imposes specific
   header/footer/opt-out requirements?
5. **Consent model** — is opt-in or opt-out sufficient for transactional service
   messages tied to a business relationship the customer already has with the
   tenant business (e.g. "your quote is ready")? Does this differ for anything
   that could be construed as marketing (e.g. a satisfaction survey, a
   re-engagement message)?
6. **Data residency for message content** — does routing customer name/contact/
   message content through Resend (email) or Twilio (SMS), which may process
   data outside the UAE, require a specific safeguard or disclosure?
7. **Retention of delivery records** — `notification_delivery_attempts` records
   delivery metadata; is there a required or recommended retention period for
   proof-of-delivery/consent records under applicable law?
8. **Liability allocation** — since Revora is the platform and the *business* is
   the one actually messaging its own customers, how should liability for
   notification-content compliance be allocated between Revora and the tenant
   business in the Terms of Service?

## Technical Controls Already in Place (for counsel's awareness)

- Live sending requires `NOTIFICATIONS_DISPATCH_ENABLED` AND
  `NOTIFICATIONS_LIVE_SEND_ENABLED` (both environment-level) AND a per-business
  `live_send_enabled` database flag, plus a dispatch-secret-gated trigger route —
  see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) finding APPSEC-12.
- A `notification_preferences` table exists for per-customer, per-channel,
  per-template opt-out.
- Notification text passes through UUID redaction before any customer-facing
  display.

## What's Missing (engineering gaps to flag to counsel, not yet built)

- No visible unsubscribe link/footer text generation reviewed in this pass — if
  required by applicable law, this needs to be added to the email/SMS templates
  (`lib/notifications/templates.js`) before go-live.
- No sender-ID-registration tooling — this is likely a provider/account-level
  setup task with Twilio, not a code change, but should be tracked.
- No jurisdiction-aware routing (e.g. different consent rules per recipient
  country) — flag to counsel whether this is needed given Revora's target market.

## Sign-Off

This checklist is reviewed and either cleared or annotated with required changes
by qualified counsel before [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md)'s
"Pre-Production Go-Live Checklist" can be marked complete.
