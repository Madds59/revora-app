# Browser QA

Run the local app and smoke routes before release checks.

## Local setup

1. Start the app from `apps/web`.
2. Set `APP_URL` to the local server URL, for example `http://localhost:3001`.
3. Run:

```bash
pnpm smoke:routes
```

## What the smoke checks

- Public/auth routes exist.
- Business dashboard routes return either a page or an expected redirect.
- Customer portal routes return either a page or an expected redirect.
- Root admin routes return either a page or an expected redirect.
- No route should return a 500.
- `/api/stripe/webhook` should reject unsigned POST requests.

## Manual browser checklist

- Sign in as a business user and confirm `/`, `/analytics`, `/notifications`, and `/billing`.
- Open `/vehicles` and confirm list, filters, and vehicle detail navigation work.
- Open `/customers`, `/jobs`, `/quotations`, `/complaints`, and `/documents` on mobile and desktop.
- Sign in as a portal user and verify `/portal`, `/portal/jobs`, `/portal/quotes`, `/portal/complaints`, `/portal/documents`, and `/portal/settings`.
- Sign in as a super admin and verify the root admin list pages and pagination controls.
- If Stripe webhook sync is configured, verify `/billing` and `/analytics` show synced invoices and revenue after a test Stripe event.
- Run `pnpm diagnose:billing` in a live environment and confirm Stripe plan IDs align with the catalog.
- Run `node scripts/sync-stripe-plan-prices.mjs --dry-run` before applying live plan updates.

## Expected results

- Protected routes redirect or render safely.
- Mobile list pages stay readable without horizontal scrolling.
- No route throws a runtime 500.
