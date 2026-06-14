# Revora — App (Foundation Slice)

**Built on Trust. Powered by Operations.**

A fresh Next.js 15 + Supabase implementation generated from the canonical Revora
spec (`~/Documents/Revora`). This is the **foundation vertical slice**: auth,
business onboarding, CRM (customers + vehicles), and business settings (profile,
branches, services), all wired to the real Supabase schema and RLS policies.

Later passes add quotations, digital approvals, complaints, the customer portal,
the Expo mobile app, Stripe billing, notifications, analytics, and AI.

## Stack

- **Web:** Next.js 15 (App Router, RSC, Server Actions), TypeScript, Tailwind v4, shadcn/ui (RTL-ready)
- **Auth/DB/Storage:** Supabase (Postgres + RLS), `@supabase/ssr`
- **Validation:** Zod

## Layout

```
apps/web                 Next.js dashboard
  src/app/(auth)          login / signup + auth/callback
  src/app/(onboarding)    create business + owner membership
  src/app/(dashboard)     home, customers, settings, + stubs for later modules
  src/lib/supabase        server / client / middleware Supabase clients
  src/lib/auth.ts         session + membership guards
  src/lib/permissions.ts  role gates mirroring the RLS helpers
supabase
  migrations/             canonical core schema + RLS (copied from the spec repo)
  config.toml             Supabase CLI config
```

## Prerequisites

This repo was set up with a non-system Node install:

- **Node 24** — installed at `~/.local/node` (add to PATH: `export PATH="$HOME/.local/node/bin:$PATH"`)
- **pnpm** — via `corepack enable pnpm`
- **Supabase CLI** — installed at `~/.local/bin/supabase`
- **Docker** — required for the local Supabase stack (`supabase start`). **Not yet
  installed on this machine.** Install Docker Desktop, _or_ use a hosted Supabase
  project instead (see below).

## Run locally (with Docker)

```bash
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"

# 1. Start Postgres + Auth + Storage and apply migrations
cd ~/Downloads/Revora-app
supabase start                       # first run pulls Docker images

# 2. Confirm env values match what supabase printed
supabase status                      # copy API URL + anon key
#   -> apps/web/.env.local (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)

# 3. (optional) regenerate the full DB types
supabase gen types typescript --local > apps/web/src/lib/database.types.ts

# 4. Run the app
cd apps/web
pnpm install
pnpm dev                             # http://localhost:3000
```

## Run against a hosted Supabase project (no Docker)

1. Create a free project at supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_core_schema.sql` then
   `0002_rls_policies.sql` (and `supabase/policies/storage-policies.sql`).
3. Put the project URL + anon key in `apps/web/.env.local`.
4. `cd apps/web && pnpm install && pnpm dev`.

## Try it

1. Sign up → you'll be sent to **/onboarding** → create a business (you become owner).
2. Land on the dashboard. Add a customer, open it, add a vehicle.
3. Open **Settings → Business** to edit the profile and add branches/services.
4. Sign out / sign up as a second user — confirm you can't see the first tenant's
   data (RLS tenant isolation).

## Checks

```bash
cd apps/web
pnpm typecheck
pnpm build
```
# revora-app
