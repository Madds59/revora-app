# Revora Validation

Run these commands from `apps/web`:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm smoke:routes
```

## Typecheck ordering

`pnpm typecheck` runs `next typegen` first via the `pretypecheck` script, so the generated route types exist before `tsc --noEmit` runs.

If you hit stale generated output in an old checkout, run:

1. `pnpm build`
2. `pnpm typecheck`

In a normal checkout, `pnpm typecheck` can run directly.

## Route smoke

Set `APP_URL` to a reachable app URL:

```bash
APP_URL=http://localhost:3000 pnpm smoke:routes
APP_URL=https://your-preview-url.vercel.app pnpm smoke:routes
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

## Stripe verification

Use the live-config helpers only with real Stripe IDs:

```bash
pnpm diagnose:billing
node scripts/sync-stripe-plan-prices.mjs --dry-run
node scripts/sync-stripe-plan-prices.mjs
```
