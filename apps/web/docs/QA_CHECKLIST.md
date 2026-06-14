# Revora QA Checklist

## Critical Routes

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

- Sign in as a business owner and confirm the dashboard shell loads.
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
