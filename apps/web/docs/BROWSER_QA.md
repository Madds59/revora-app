# Browser QA

Run the local app and smoke routes before release checks.

## Local setup

1. Start the app from `apps/web`.
2. Set `APP_URL` to the local server URL, for example `http://localhost:3001`.
3. Run:

```bash
pnpm smoke:routes
```

## Preview / production smoke

Use the same command against a reachable preview or production URL:

```bash
APP_URL=https://your-preview-url.vercel.app pnpm smoke:routes
APP_URL=https://revora-app.vercel.app pnpm smoke:routes
```

If pnpm refuses to run scripts because of native build approval on a fresh checkout,
run:

```bash
pnpm approve-builds --all
```

## What the smoke checks

- Public/auth routes exist.
- Business dashboard routes return either a page or an expected redirect.
- Customer portal routes return either a page or an expected redirect.
- Root admin routes return either a page or an expected redirect.
- No route should return a 500.
- `/api/stripe/webhook` should reject unsigned POST requests.

## Manual browser checklist

- Open `/login` and `/signup` and confirm they redirect to `/en/login` and
  `/en/signup`.
- Open `/en/login` and `/ar/login` and confirm the login tabs render without
  overlap or a blank gray panel.
- Open `/en/signup` and `/ar/signup` and confirm the account-type cards require
  an explicit choice before submission.
- Confirm the language switcher preserves the current path when switching
  between English and Arabic. The switcher sits next to the theme toggle.
- On `/en` and `/ar`, spot-check that form labels and actions, complaint/message
  tooling, and customer/vehicle/settings component copy are localized (no raw
  translation keys, no leftover English on `/ar`). Enum option values (severity,
  status, role) intentionally remain in source.
- Confirm shared UI states are localized: error retry/back labels, filter search
  placeholders, pagination "Previous/Next" and counts, and the evidence empty
  state. Pagination counts must stay in Western digits on `/ar`.
- Sign up as a business owner and confirm `/onboarding` leads to business setup.
- Sign up as a customer and confirm `/portal` shows the customer onboarding or
  empty linked-account state instead of a business workspace.
- Sign up as invited staff and confirm the onboarding page explains that an
  invitation is required.
- Sign in as a business user and confirm `/`, `/analytics`, `/notifications`, and `/billing`.
- Open `/vehicles` and confirm list, filters, and vehicle detail navigation work.
- Open `/customers`, `/jobs`, `/quotations`, `/complaints`, and `/documents` on mobile and desktop.
- Sign in as a portal user and verify `/portal`, `/portal/jobs`, `/portal/quotes`, `/portal/complaints`, `/portal/documents`, and `/portal/settings`.
- Sign in as a super admin and verify the root admin list pages and pagination controls.
- If Stripe webhook sync is configured, verify `/billing` and `/analytics` show synced invoices and revenue after a test Stripe event.
- Run `pnpm diagnose:billing` in a live environment and confirm Stripe plan IDs align with the catalog.
- Run `node scripts/sync-stripe-plan-prices.mjs --dry-run` before applying live plan updates.
- Confirm Supabase Auth Site URL is `https://revora-app.vercel.app` and redirect URLs include both production and localhost patterns.
- Confirm AED and date/time values use Western digits on billing-heavy views.
- Confirm `/api/stripe/webhook` is not behind auth middleware by checking an
  unsigned POST returns a non-redirect failure code.

## Expected results

- Protected routes redirect or render safely.
- Mobile list pages stay readable without horizontal scrolling.
- No route throws a runtime 500.
- Locale routes are the canonical app surface.
