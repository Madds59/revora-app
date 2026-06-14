# Stripe Webhook Readiness

Revora now has backend tables for:

- `billing_invoices`
- `billing_invoice_items`
- `billing_payment_events`
- `billing_plans`
- `billing_plan_features`

## Required env vars

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Webhook events to support

- `invoice.created`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Sync rules

- Verify webhook signatures before processing.
- Upsert by Stripe IDs.
- Treat webhook writes as idempotent.
- Never mark invoices paid without a trusted Stripe event.
- Keep all Stripe secrets server-side.

## Implementation notes

- Map Stripe invoice rows to `billing_invoices`.
- Map invoice line items to `billing_invoice_items`.
- Map payment lifecycle events to `billing_payment_events`.
- Keep subscription sync aligned with `subscriptions.stripe_subscription_id`.
- The webhook endpoint lives at `/api/stripe/webhook`.
- Local testing steps are documented in [`STRIPE_WEBHOOK_TESTING.md`](./STRIPE_WEBHOOK_TESTING.md).
- Real Stripe price IDs can be synced into `billing_plans` with `scripts/sync-stripe-plan-prices.mjs`.
- The billing environment can be checked with `pnpm diagnose:billing`.
- The price sync helper accepts `--dry-run` before applying catalog updates.

## Next step

Implement the webhook route only after the environment variables are available in the deployment target.
