# Notification Safety Test Matrix

Mix of automated (already exists / added in this pass) and manual coverage. The
overriding rule, checked first in every case: **live sending must remain disabled
in this audit's environment and in production until an explicit, separate go-live
decision is made.**

## Automated (`apps/web/tests/notifications.test.mjs`, pre-existing)

| Case | Assertion |
|---|---|
| No-op without env config | `resolveNotificationProvider()` returns `configured: false` for both email and SMS when no provider env vars are set |
| Three-layer live-send gate | `canAttemptLiveSend()` returns `skipped_disabled` when the business-level flag is off even if env flags are on; returns `ok: true` only when both env flags and the business flag are on and a provider key is present; returns `skipped_no_provider` when the provider key is missing |
| Template rendering | Email/SMS templates render with variables substituted, in both `en` and `ar` |
| UUID redaction | `redactNotificationText()` replaces a raw UUID with "record"; rendered templates containing an id do not leak it |
| Migration structure | `0030_notifications_foundation.sql` has the dedupe unique index, the `for update skip locked` queue-claim pattern, and revokes `claim_queued_notification_events()` from `authenticated` while granting it to `service_role` only |

## Manual QA

| # | Scenario | Steps | Expected result |
|---|---|---|---|
| 1 | Dispatch route without secret | `curl -X POST <env>/api/notifications/dispatch` with no header | If `NOTIFICATIONS_DISPATCH_ENABLED` is unset/false: `{ disabled: true }` response. If enabled but no/wrong secret: HTTP 403 |
| 2 | Dispatch route with correct secret in a disabled environment | Same, with the correct `x-notification-dispatch-secret` header, but `NOTIFICATIONS_DISPATCH_ENABLED` false | Still returns the disabled no-op response — the enabled flag is checked first |
| 3 | Queued notification visibility | As business owner, trigger an action that queues a notification (e.g. send a quotation) | A row appears in the business's notification list; status reflects `queued`/`skipped_*`, never silently "sent" while live-send is off |
| 4 | Cross-tenant notification visibility | As Business B owner, attempt to view Business A's notification list/IDs | No data returned |
| 5 | Customer opt-out | As a customer, disable a notification preference, then trigger the corresponding event from the business side | No new queued notification for that channel/template for that customer (or it's recorded as suppressed) |
| 6 | Raw UUID display | Inspect the rendered notification (staff panel and any customer-facing surface) for the affected record | No raw UUID visible; human-readable reference only |
| 7 | Arabic label correctness | View notification action labels in `ar` locale | Labels render in Arabic, not raw keys or English fallback text (regression check for the recent Arabic label fix referenced in commit history) |
| 8 | Live-send kill-switch end-to-end (staging/test project only, never production) | With a disposable test project: set both env flags true, a business's `live_send_enabled` true, and a **fake/sandbox** provider key; trigger dispatch | Provider call attempted only in this fully-enabled test configuration — confirms the gate is real, not just documentation. **Never run this case against real customer contact info or real provider credentials per program rules.** |

## Pre-Production Go-Live Checklist (for whenever live sending is eventually enabled)

This is not a recommendation to enable live sending now — it is what must be true
*before* anyone does:

- [ ] Legal/privacy review complete (see
      [UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md](UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md))
- [ ] Opt-out/unsubscribe path verified reachable from every message type
- [ ] Operator has explicitly approved the go-live per
      [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8
- [ ] A dry-run plan exists (e.g. enabling for one internal test business first,
      not flipping the global flag for every tenant at once)
- [ ] Monitoring/alerting for unexpected "sent" status is wired up (see
      [MONITORING_AND_ALERTING_PLAN.md](MONITORING_AND_ALERTING_PLAN.md))

## Pass/Fail Recording

Record in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md). Any case where a
real send occurs while gates should be off is P0.
