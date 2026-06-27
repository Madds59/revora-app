# Monitoring and Alerting Plan

Owner: DevSecOps Owner. Current tooling per project stack: Sentry (errors), PostHog
(product analytics), Vercel (deploy/runtime logs), Supabase dashboard (DB/auth
logs). This document defines what *should* alert; it does not certify that every
alert below is wired up today — wiring them up is listed as follow-up where
applicable.

## 1. Alerts Required (security-relevant)

| Signal | Why it matters | Suggested source | Status |
|---|---|---|---|
| Failed login spike (single account or globally) | Credential stuffing / brute force attempt | Supabase Auth logs | Not confirmed wired — recommend Supabase log drain or periodic check |
| Role/membership changes (`business_members` insert/update, `platform_admins` insert/delete) | Privilege escalation, intentional or via bug | `audit_events` + a query/alert on `admin_set_super_admin` usage | Not wired — `audit_events` exists but no alerting layer was found |
| Platform admin access (any `admin_*` RPC call, any `/admin` route hit) | Cross-tenant visibility is high-impact; should be rare and attributable | Application logging + Sentry breadcrumbs | Not confirmed wired |
| RLS errors / permission-denied spikes | Could indicate a bug stripping tenant scoping, or an active probing attempt | Supabase Postgres logs (`42501` errors) | Not confirmed wired — recommend a Supabase log-based alert |
| API 401/403 spikes | Could indicate credential stuffing, scraping, or a broken auth change | Vercel/Next.js access logs, Sentry | Not confirmed wired |
| Stripe webhook signature failures | Either a misconfigured secret (operational) or a forgery attempt (security) | `lib/stripe-webhook.ts` rejection path → should emit a logged/alertable event | Code logs to console on rejection; not confirmed connected to an alert |
| Notification dispatch attempts | Should be near-zero while disabled; any attempt is worth knowing about | `app/api/notifications/dispatch/route.ts` | Returns a JSON response per call; not confirmed logged to an alertable sink |
| Unexpected "sent" status on a notification row when live-send should be off | Would indicate the kill-switch failed | `notification_events.status` | Not wired — recommend a scheduled query/alert |
| Raw DB error spikes | Could indicate either an attack probing for errors, or a regression reintroducing APPSEC-07-style leakage | Sentry (now that errors are `console.error`-logged server-side per the Phase 9 fix) | Improved by this pass's fix — errors are now consistently logged server-side, making them visible to Sentry/console aggregation where previously some were only visible in the client response |

## 2. Recommended Alert Wiring (future work, not implemented in this pass)

1. **Sentry**: confirm server-side `console.error` calls (including the ones added
   in this pass for APPSEC-07) are captured by Sentry's Next.js integration, not
   just printed to a log that nobody watches. Configure an alert rule for error
   rate spikes scoped to `app/[locale]/(dashboard)`, `(portal)`, and `(admin)`
   route groups.
2. **Supabase log drain**: Supabase supports exporting Postgres/Auth logs; wiring
   a drain to a log aggregator (or even a scheduled function querying
   `pg_stat` / auth logs) would close the "failed login spike" and "RLS error
   spike" gaps. Not implemented — requires Supabase project configuration outside
   this repo.
3. **`audit_events`-based alerting**: a scheduled job (e.g. a Supabase Edge
   Function or external cron) querying `audit_events` for `platform_admins` or
   `business_members` role changes in the last N minutes, alerting if any are
   found outside expected admin workflows.
4. **Stripe Dashboard webhooks monitoring**: Stripe's own dashboard shows webhook
   delivery failures — ensure someone actually checks it periodically, or
   replicate via Stripe's webhook-failure email notifications (Stripe-native
   feature, not custom code).
5. **PostHog**: define a "platform admin page viewed" or "notification dispatch
   attempted" custom event if not already present, to get product-analytics-side
   visibility complementing the above.

## 3. What This Audit Could Not Verify

This pass reviewed code, not live dashboard configuration. Whether Sentry/PostHog
projects are actually receiving events, whether alert rules exist in Sentry, and
whether anyone is subscribed to Stripe's webhook-failure emails are all outside
what a code review can confirm. **DevSecOps Owner should manually confirm each
"Not confirmed wired" row above against the actual Sentry/PostHog/Stripe/Supabase
dashboards.**

## 4. Incident Response Tie-In

Any alert firing above should follow
[REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §7 (Detect → Contain →
Assess → Notify → Remediate → Record).
