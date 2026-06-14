# Revora QA Checklist

## Critical Routes

- `/en/signup`
- `/ar/signup`
- `/en/login`
- `/ar/login`
- `/onboarding`
- `/analytics`
- `/notifications`
- `/vehicles`
- `/portal/jobs`
- `/portal/documents`
- `/portal/settings`
- `/admin/tenants`
- `/admin/users`
- `/admin/subscriptions`
- `/admin/audit-logs`
- `/admin/notifications`

## Manual Checks

- Open `/login` and `/signup` and confirm they redirect to the canonical locale
  routes.
- Open `/en/login` and `/ar/login` and confirm the tabs render cleanly without
  overlap or empty gray panels.
- Open `/en/signup` and `/ar/signup` and confirm account-type selection is
  explicit and readable in both directions.
- Confirm the language switcher preserves the current path when moving between
  English and Arabic.
- On `/ar`, confirm shared UI, form labels/actions, complaint/message tooling,
  and customer/vehicle/settings component copy are localized with no raw keys and
  no leftover English. AED and pagination counts stay in Western digits.
- Sign up as a business owner, customer, and invited staff user, and confirm
  each path lands on the correct onboarding or portal surface.
- Sign in as a business owner and confirm the dashboard shell loads.
- Confirm business-owner signup leads to workspace creation, not the customer portal.
- Confirm customer signup does not create a business and lands on the portal.
- Confirm invited staff cannot create a business from signup and need a valid invitation.
- Open `/analytics` and confirm the period buttons change the visible data.
- Open `/notifications` and confirm read/unread state renders correctly.
- Open `/vehicles` and confirm search/filtering works, then open a vehicle detail page.
- Open `/portal/jobs` as a customer and confirm only linked jobs are shown.
- Open `/portal/documents` and confirm download links are only present when a signed URL exists.
- Open `/portal/settings` and confirm only customer-owned data is shown.
- Open each `/admin/*` table page and confirm filters narrow the visible results.
- Resize to mobile width and confirm table-heavy pages render card fallbacks.
- Confirm billing remains owner-only.
- Confirm billing invoices and payment events only appear after Stripe webhook sync.
- Confirm AED and date/time values use Western digits in the shell and billing
  surfaces.
- Confirm `/en/admin` is available only after a platform-admin row exists.
- Confirm super admin is not selectable during signup and is bootstrapped only
  through `platform_admins`.
- Confirm `owner@vrf.test` / `password1234` remain smoke-test-only credentials
  and are never used as production admin access.

## Automated Checks

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `APP_URL=http://127.0.0.1:3001 pnpm smoke:routes`
- `APP_URL=https://revora-app.vercel.app pnpm smoke:routes`

## Locale Notes

- Revora's canonical app routes live under `/en` and `/ar`.
- `/api` remains excluded from middleware.
- `/api/stripe/webhook` must stay public at the routing layer and protected only
  by Stripe signature verification.

## Deployment Checklist

- Supabase Auth Site URL: `https://revora-app.vercel.app`
- Supabase Auth redirect URLs:
  - `https://revora-app.vercel.app/**`
  - `http://localhost:3000/**`
- Public signup must expose business owner, customer, and invited staff account
  types. Do not surface super admin as a public option.
- Super admin bootstrap instructions live in
  [SUPER_ADMIN_BOOTSTRAP.md](./SUPER_ADMIN_BOOTSTRAP.md).
- If pnpm reports ignored native builds on a fresh checkout, run `pnpm approve-builds --all`
- Keep `/api/stripe/webhook` public; do not put it behind login or deployment protection
