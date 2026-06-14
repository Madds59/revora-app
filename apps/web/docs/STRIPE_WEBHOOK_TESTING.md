# Stripe Webhook Testing

Use this checklist to verify Revora billing sync locally or in a staging environment.

## Required env vars

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Local webhook flow

1. Start the app from `apps/web`.
2. Ensure the database and app can reach the same Supabase instance.
3. Start Stripe CLI login:

```bash
stripe login
```

4. Forward webhook events to the Revora endpoint:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

5. Copy the webhook signing secret from the Stripe CLI output into `STRIPE_WEBHOOK_SECRET`.

## Useful trigger commands

```bash
stripe trigger invoice.created
stripe trigger invoice.finalized
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

## What to verify

- `billing_invoices` gets a row for the Stripe invoice.
- `billing_invoice_items` gets line items for that invoice.
- `billing_payment_events` gets a row for payment events.
- `subscriptions` updates its Stripe-linked state.
- `/billing` shows the new invoice history.
- `/analytics` shows revenue once paid invoices exist.

## Plan catalog sync

If you have real Stripe price IDs, verify them first and then sync them into `billing_plans`:

```bash
pnpm diagnose:billing
node scripts/sync-stripe-plan-prices.mjs --dry-run
node scripts/sync-stripe-plan-prices.mjs
```

The script reads these environment variables:

- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_YEARLY`
- `STRIPE_PRICE_PROFESSIONAL_MONTHLY`
- `STRIPE_PRICE_PROFESSIONAL_YEARLY`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_BUSINESS_YEARLY`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_YEARLY`

If `STRIPE_SECRET_KEY` is also set, the script backfills price amounts and currency from Stripe.

The sync script validates that configured price IDs start with `price_` and supports `--dry-run` before applying updates.
