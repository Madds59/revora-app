# Revora Auth and Onboarding Model

Revora uses contextual access, not one global user role.

## Signup choices

Public signup must ask the user what kind of account they are creating:

- **Business owner**: creates a service-business workspace and becomes its owner.
- **Customer / consumer**: accesses the customer portal and links to customer records.
- **Invited staff / service advisor**: joins a business only through an invitation.

Super admin is never selectable during public signup.

## Access sources

- **Super admin**: `platform_admins`
- **Business access**: `business_members`
- **Customer portal access**: `customers.app_user_id`
- **Invited staff access**: `business_invitations` plus `business_members`

## Routing behavior

- Business owners go to `/onboarding` until they create their business.
- Customers go to `/portal`.
- Invited staff go to `/onboarding` until a pending invitation is accepted.
- Super admins can access `/admin`.
- Users without a valid business context are not treated as business owners by default.

## Locale behavior

- Canonical public auth routes live at `/en/login`, `/ar/login`, `/en/signup`,
  and `/ar/signup`.
- `/login` and `/signup` redirect to the English locale entry points.
- The language switcher should preserve the current path when moving between
  English and Arabic.

## Role matrix

| Context | Signup option | Access |
| --- | --- | --- |
| Super admin | Not selectable | `/admin` |
| Business owner | Public signup | Dashboard + business tools |
| Service advisor / staff | Invitation-only | Dashboard scoped by membership |
| Customer / consumer | Public signup | Customer portal |

## Production auth settings

Supabase Auth should use:

- Site URL: `https://revora-app.vercel.app`
- Redirect URLs:
  - `https://revora-app.vercel.app/**`
  - `http://localhost:3000/**`

## Bootstrap commands

Promote an existing signed-up user to platform admin. Full bootstrap steps and
production safety notes live in [SUPER_ADMIN_BOOTSTRAP.md](./SUPER_ADMIN_BOOTSTRAP.md).

```bash
node scripts/grant-super-admin.mjs madd59productions@gmail.com
node scripts/grant-super-admin.mjs moda.imf1997@gmail.com
```

The user must sign up first; do not generate or commit passwords.
Super admin is never a public signup option and is never derived from
`account_intent`.
