# Vehicle Intelligence

Revora's Vehicle Intelligence module helps workshops and portal customers capture symptoms, decode VINs, interpret DTC codes, and generate safety-aware diagnostic guidance.

## Scope

- Dashboard routes:
  - `/en/ai`
  - `/en/ai/vin-decoder`
  - `/en/ai/dtc-decoder`
  - `/en/ai/vehicle-diagnosis`
- Portal routes:
  - `/en/portal/vehicles`
  - `/en/portal/vehicles/[id]`
  - `/en/portal/ai/health-check`

The Arabic equivalents are available under `/ar/...`.

## Safety rules

- VIN decoding uses the NHTSA VIN decoder.
- AI output is advisory only and must be reviewed by a qualified workshop or service advisor.
- Safety-critical symptoms force a stop-driving warning.
- Dangerous DIY instructions are filtered out.
- Official quote creation still requires advisor/workshop approval and server-side recalculation.

## Data model

The module stores tenant-scoped rows for:

- symptom reports
- diagnostic results
- DTC codes
- maintenance plans
- media uploads
- AI tool calls
- AI safety flags

Every row is scoped by `business_id` and protected by RLS.

## AI output contract

Diagnostic results are stored as structured JSON with:

- severity
- stop-driving warning
- possible causes
- recommended actions
- safe self-check steps
- workshop requirement flag
- suggested service category
- inspection time estimate
- quote draft eligibility
- follow-up questions

If AI fails or returns invalid JSON, the system falls back to a rule-based diagnostic and keeps the workflow safe.

## Environment

Optional AI env vars:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

If they are absent, Revora uses the safe fallback path.

## Validation

Run from `apps/web`:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes
```

## Notes

- The module does not alter auth, onboarding, RLS, or Stripe webhook behavior.
- `account_intent` is not used as authorization.
- Quote totals are still computed server-side by the existing quotation logic.
