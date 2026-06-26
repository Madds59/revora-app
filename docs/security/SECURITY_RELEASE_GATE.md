# Security Release Gate

A checklist to run before any deploy to production (`revora-app.vercel.app` backed by
Supabase project `yqscayjvvnpsvocqrrot`). Lightweight for routine UI changes; full
checklist mandatory when the diff touches auth, RLS, payments, documents, AI,
notifications, or platform admin (see
[REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8).

## Always (every release)

- [ ] `pnpm lint` clean (from `apps/web`)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` green
- [ ] `git diff --check` clean (no whitespace conflict markers) from repo root
- [ ] Secret-pattern grep returns no hits (see command in root `AGENTS.md` / this
      program's validation commands)
- [ ] No `.env*` file is part of the diff
- [ ] Diff reviewed by a human, not merged on green CI alone

## If the diff touches auth / session / middleware

- [ ] `requireUser()` / `requireMembership()` / `requireCustomerPortal()` /
      `requireSuperAdmin()` guards are still present on every route that needs them
- [ ] No new route under `(dashboard)`, `(portal)`, or `(admin)` was added without a
      corresponding layout-level or page-level guard
- [ ] `account_intent` is not used as an authorization check anywhere in the diff —
      routing/UI only

## If the diff touches RLS / migrations

- [ ] Every new table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the same
      migration
- [ ] Every new policy scopes by `is_business_member()`, `has_business_role()`,
      `is_customer_for_business()`, or an equivalent tenant/customer check — no
      `USING (true)` on a tenant-owned table
- [ ] Manually verified (or covered by the script in
      [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md)) that a second
      tenant cannot read/write the new table's rows
- [ ] This is **not** a historical migration edit (0001–0030 are frozen); this is a
      new, additive migration
- [ ] Migration number is not `0028` (reserved/skipped — do not reuse)

## If the diff touches Stripe / billing

- [ ] Webhook signature verification (`verifyStripeWebhookSignature`) is unchanged or,
      if changed, reviewed as a dedicated finding — not modified incidentally
- [ ] Raw request body is still read before any JSON parsing in the webhook route
- [ ] No new path lets a client directly mutate subscription/plan status outside the
      webhook flow

## If the diff touches documents / storage

- [ ] Private bucket (`revora-private`) access still goes through signed URLs or
      RLS-backed queries — no new public URL exposure of tenant documents
- [ ] New storage paths still partition by `business_id`

## If the diff touches AI Vehicle Intelligence

- [ ] `enforceSafetyOverrides()` and the dangerous-keyword/allowlist sanitization in
      `safety.js` still run on every AI-assisted code path added
- [ ] VIN/spec lookups remain grounded in the NHTSA API, not free-form LLM generation
- [ ] New AI output surfaces are tenant-scoped (`business_id` filtered)

## If the diff touches notifications

- [ ] `NOTIFICATIONS_DISPATCH_ENABLED`, `NOTIFICATIONS_LIVE_SEND_ENABLED`, and the
      per-business `live_send_enabled` flag are unchanged in production (still
      disabled) unless this release is an explicit, operator-approved go-live
- [ ] Dispatch route still requires `NOTIFICATIONS_DISPATCH_SECRET` header match
- [ ] New notification templates still pass through UUID redaction
      (`redactNotificationText`)
- [ ] New notification types respect customer opt-out preferences

## If the diff touches platform admin

- [ ] No new code path can set/read `platform_admins` membership without going
      through `is_super_admin()`-gated RPCs
- [ ] Self-elevation and self-demotion-of-others-without-being-admin remain blocked

## Sign-off

Record in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) if any checklist item
above was skipped or risk-accepted, with a reason and who accepted the risk. Silent
skips are not acceptable for P0/P1-relevant items.
