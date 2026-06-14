# Revora Validation

Run these commands from `apps/web`:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm smoke:routes
```

## Install gate

If pnpm reports ignored native builds on a fresh checkout, approve the required packages once:

```bash
pnpm approve-builds --all
```

## Typecheck ordering

`pnpm typecheck` runs `next typegen` first via the `pretypecheck` script, so the generated route types exist before `tsc --noEmit` runs.

If you hit stale generated output in an old checkout, run:

1. `pnpm build`
2. `pnpm typecheck`

In a normal checkout, `pnpm typecheck` can run directly.

Run `pnpm build` and `pnpm typecheck` serially, not in parallel. Both commands read from `.next/types`, and a concurrent run can race the generated files.

## Route smoke

Set `APP_URL` to a reachable app URL:

```bash
APP_URL=http://localhost:3000 pnpm smoke:routes
APP_URL=https://your-preview-url.vercel.app pnpm smoke:routes
APP_URL=https://revora-app.vercel.app pnpm smoke:routes
```

If you want the smoke runner to hit a specific vehicle detail page, also set:

```bash
SMOKE_VEHICLE_ID=<uuid> APP_URL=http://localhost:3000 pnpm smoke:routes
```

The smoke runner reports:

- `OK`
- `expected redirect`
- `unauthorized as expected`
- `missing route`
- `unexpected 404`
- `unexpected 500`
- `connection unavailable`

## Canonical locale routes

The locale tree is canonical. Treat these redirects as expected:

- `/` -> `/en`
- `/login` -> `/en/login`
- `/signup` -> `/en/signup`

Smoke coverage includes both English and Arabic auth entry points:

- `/en/login`
- `/ar/login`
- `/en/signup`
- `/ar/signup`

Language switching should preserve the current path and query string. The
language switcher sits next to the theme toggle and stays active across the app.

## Localization coverage

`[locale]` is the canonical route model and every UI surface resolves copy from
`src/messages/en.json` and `src/messages/ar.json`. The two files share an
identical key structure (validated key-for-key), so a key present in one locale
exists in the other.

Localized so far:

- Shell, auth, and navigation strings.
- Dashboard home, customer portal home, and platform admin overview.
- Dashboard business, customer portal, and platform admin page wrappers
  (tenants, users, subscriptions, billing, audit logs, notifications,
  analytics).
- Shared UI primitives that own copy: error states, filter/search controls,
  pagination labels, and the evidence empty state (`common.*` namespaces).
- Reusable form and action components: customer and vehicle forms, business
  switcher, file upload, billing portal button, notification read button
  (`forms.*` namespaces).
- Complaint and message tooling: submission, management, threaded messages,
  assignment, and reset controls (`complaints.*` namespaces).
- Customer/vehicle new and edit page wrappers and the business settings and team
  management forms (`settings.*`, `team.*`, and extended
  `dashboardCustomers`/`dashboardVehicles` namespaces).

Intentionally left in source (not translation keys), per policy:

- Enum/storage constants such as complaint severity/status option values,
  member-role labels (`ROLE_LABELS`), and account-type codes.
- Illustrative input placeholders (sample makes, plates, VIN, prices).

Remaining content QA: a professional Arabic translation review of the strings
added in this phase is a later content task, not a code change.

## Auth and onboarding

Revora now asks users to choose an account type during signup. The canonical
flow and role/access matrix live in [AUTH_ONBOARDING.md](./AUTH_ONBOARDING.md).
Use that document when validating:

- business owner signup/onboarding
- customer signup and portal linking
- invited staff onboarding
- super admin bootstrap through `platform_admins`

## Formatting

Revora uses Western-digit formatting for AED and date/time surfaces in the shell
and high-value operational views. This is intentional and should remain stable
unless there is a specific product decision to change it.

## Stripe verification

Use the live-config helpers only with real Stripe IDs:

```bash
pnpm diagnose:billing
node scripts/sync-stripe-plan-prices.mjs --dry-run
node scripts/sync-stripe-plan-prices.mjs
```

## Admin bootstrap

After a user signs up through `/signup` or magic link auth, promote them with:

```bash
node scripts/grant-super-admin.mjs madd59productions@gmail.com
node scripts/grant-super-admin.mjs moda.imf1997@gmail.com
```

Use the password the user created during signup, or a Supabase magic-link/password-reset flow. Do not create or commit a separate plaintext credential.

## Production auth settings

Set Supabase Auth to use:

- Site URL: `https://revora-app.vercel.app`
- Redirect URLs:
  - `https://revora-app.vercel.app/**`
  - `http://localhost:3000/**`
