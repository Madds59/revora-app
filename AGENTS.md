# Revora AI Development Constitution

## Project Identity

Revora is a multi-tenant SaaS platform for automotive service businesses, workshops, garages, service centers, detailing centers, and automotive SMEs.

## Architecture

- Multi-tenant SaaS
- Root admin platform
- Business dashboard
- Customer portal
- Supabase PostgreSQL backend
- Row Level Security
- Supabase Auth
- Stripe billing

## User Types

- Root Admin
- Business Owner
- Manager
- Employee
- Customer Portal User

## Route Groups

Every page lives under `apps/web/src/app/[locale]/`, and all but one sit inside a route group: `(dashboard)`, `(portal)`, `(admin)`, `(auth)`, `(onboarding)`, `(legal)`.

The sole exception is `[locale]/i/[token]` — the public inspection share link. Unauthenticated access is granted by `isPublicPath()` in `apps/web/src/lib/supabase/middleware.ts`, alongside `/login`, `/signup`, `/forgot-password`, `/auth*` and `/legal*`. Of those, the share link is the only one that serves tenant data without a session, so treat any change to it, or to that predicate, as a security change.

Never add a page outside `[locale]`.

The authoritative route inventory is code, not this file — do not duplicate it here:

- `apps/web/src/lib/nav/model.js` — dashboard and portal routes, including the `feature` keys that gate phase 1 modules.
- `apps/web/src/components/admin-nav.tsx` — root admin routes.

Feature-gated routes call `requireFeature()` (`apps/web/src/lib/features/guard.ts`) and redirect when their flag is off, so a route existing in the inventory does not mean it is reachable in a given environment.

## Development Rules

Always:

- Reuse existing components.
- Reuse existing Supabase helpers.
- Reuse existing auth helpers.
- Follow existing route group patterns.
- Follow existing ShadCN/Tailwind design language.
- Use real Supabase data.
- Add explicit empty states when data is missing.
- Add loading states.
- Add error states.
- Maintain mobile-first responsiveness.
- Maintain tenant isolation.
- Keep customer portal data customer-safe.
- Keep root admin separate from tenant business data.

Never:

- Regenerate the project.
- Replace the architecture.
- Create duplicate design systems.
- Use mock data as if real.
- Query tenant data without business/customer/admin validation.
- Expose internal complaint messages to customers.
- Expose admin routes to non-admins.
- Expose business dashboard routes to customer-only users.

## Auth Rules

Business dashboard routes must use existing membership validation, usually `requireMembership()`.

Customer portal routes must use existing portal validation, usually `requireCustomerPortal()`.

Root admin routes must use existing super-admin validation, usually `requireSuperAdmin()`.

## Tenant Rules

Every tenant-scoped query must be scoped using the active business from membership context.

Customer portal queries must be scoped using linked customer records where `customers.app_user_id` equals `auth.uid()` or the existing project helper.

## UI Rules

Use:

- TailwindCSS
- ShadCN UI primitives
- existing shell components
- existing nav components
- existing page header/card/table/badge/button patterns

Do not introduce a new styling system.

## Validation Rules

There is no root `package.json` — all scripts live in `apps/web`, which is its own pnpm workspace root (`apps/web/pnpm-workspace.yaml`). Run every check from there.

After meaningful changes:

```bash
cd apps/web
pnpm lint
pnpm typecheck   # `pretypecheck` runs `next typegen` first
pnpm build
pnpm test
```

These are the same four checks `.github/workflows/ci.yml` runs on every PR.
