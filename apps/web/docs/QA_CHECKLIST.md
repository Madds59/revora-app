# Revora QA Checklist

## Critical Routes

- `/signup`
- `/login`
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

## Automated Checks

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `APP_URL=http://127.0.0.1:3001 pnpm smoke:routes`
- `APP_URL=https://revora-app.vercel.app pnpm smoke:routes`

## Deployment Checklist

- Supabase Auth Site URL: `https://revora-app.vercel.app`
- Supabase Auth redirect URLs:
  - `https://revora-app.vercel.app/**`
  - `http://localhost:3000/**`
- Public signup must expose business owner, customer, and invited staff account
  types. Do not surface super admin as a public option.
- If pnpm reports ignored native builds on a fresh checkout, run `pnpm approve-builds --all`
- Keep `/api/stripe/webhook` public; do not put it behind login or deployment protection
