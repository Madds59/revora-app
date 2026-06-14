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

Business dashboard:

- /
- /customers
- /vehicles
- /jobs
- /quotes or /quotations
- /complaints
- /documents
- /billing
- /analytics
- /notifications
- /settings

Customer portal:

- /portal
- /portal/jobs
- /portal/quotes
- /portal/quotes/[id]
- /portal/complaints
- /portal/complaints/new
- /portal/complaints/[id]
- /portal/documents
- /portal/settings

Root admin:

- /admin
- /admin/tenants
- /admin/users
- /admin/subscriptions
- /admin/billing
- /admin/analytics
- /admin/notifications
- /admin/audit-logs
- /admin/settings

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

After meaningful changes run:

- `pnpm lint`
- `pnpm typecheck` if script exists
- `pnpm build`

If `typecheck` script does not exist, use the existing TypeScript validation approach from `package.json`.
