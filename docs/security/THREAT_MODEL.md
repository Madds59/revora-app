# Threat Model

Methodology: lightweight STRIDE-by-asset, scoped to what's actually implemented in
`origin/main` @ `a3d21f078ff1e253a7050502d2b473a25271d9aa`. Companion:
[APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) for evidence,
[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) for the role/resource grid.

## 1. System Overview

Revora is a Next.js 15 App Router monolith on Vercel, backed by Supabase
(Postgres + Auth + Storage), Stripe for billing, OpenAI for AI advisory text, and
(currently disabled) Resend/Twilio for notifications. Four trust boundaries:

```
Internet
  |
  v
Vercel edge / Next.js middleware  (session refresh, public-route allowlist)
  |
  v
Next.js server (Server Components, Server Actions, Route Handlers)
  |  - derives identity from Supabase session (auth.uid())
  |  - derives tenant scope from business_members / customers, never from client input
  v
Supabase Postgres  (RLS as the final enforcement layer on every tenant table)
  |
  v
Supabase Storage (signed URLs) / Stripe (webhook, signature-verified) / OpenAI / NHTSA
```

## 2. Actors

| Actor | Trust level | Capability if legitimate | Capability if malicious |
|---|---|---|---|
| Unauthenticated visitor | None | View public marketing/auth pages | Probe public routes/APIs |
| Customer | Authenticated, scoped to own `customers` rows across 1+ businesses | View/approve own quotes, file/view own complaints, manage own vehicles' history | Attempt to read/write another customer's or another business's data |
| Staff (employee/manager) | Authenticated, scoped to one business via `business_members` | Operate CRM/jobs/quotations/complaints for their business | Attempt cross-tenant access, attempt to exceed their role (e.g. employee acting as manager) |
| Business owner | Authenticated, elevated within own business | Everything staff can, plus billing/settings/invites | Same as staff, plus billing manipulation attempts |
| Platform admin | Authenticated, cross-tenant read via `admin_*` RPCs | Aggregate metrics, list businesses, manage other admins | Abuse of cross-tenant visibility; self-elevation attempts |
| Compromised dependency / CI step | N/A | N/A | Supply-chain injection into the build |
| External webhook caller (Stripe) | Cryptographically verified per-request | Deliver billing events | Forge events without the signing secret (blocked by signature check) |

## 3. Assets Ranked by Sensitivity

1. Customer personal data + vehicle VIN/plate/service history (Restricted)
2. Signed approvals/contracts and complaint records (Restricted, legal value)
3. Uploaded documents/evidence (Restricted)
4. Billing/subscription records (Restricted, financial)
5. AI diagnostic inputs/outputs (Restricted)
6. Platform-wide aggregate visibility (`admin_*` RPCs) — not personal data per row,
   but a single compromised admin account sees across every tenant
7. Notification logs/preferences (Confidential)
8. Business/staff operational data (Internal/Confidential)

Full classification: [DATA_CLASSIFICATION_MATRIX.md](DATA_CLASSIFICATION_MATRIX.md).

## 4. STRIDE-by-Asset

### Cross-tenant data (customers, vehicles, quotations, jobs, complaints, documents)

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Attacker reuses another user's session token | Supabase session cookies, `getUser()` revalidation each request | Low |
| Tampering | Staff of Business A submits a crafted `business_id` to write into Business B | Server actions derive `business_id` server-side; RLS (`is_business_member`) rejects mismatched writes regardless | Low |
| Repudiation | A staff member denies having approved/changed a record | `audit_events` captures actor/old/new data; `approvals` captures signature + user-agent | Low (assuming audit log itself isn't tampered with — it's append-style via app code, not strictly immutable) |
| Information disclosure | Business A staff loads `/quotations/<Business B's id>` | RLS denies the row; page-level `.eq("business_id", business.id)` is redundant-but-present on staff pages | Low |
| Denial of service | Bulk scraping of IDs to enumerate records | Out of scope per program rules (no load/DoS testing performed); RLS still limits blast radius to "no data returned," not data exposure | Not assessed |
| Elevation of privilege | Employee role attempts a manager-only action (e.g. approving discounts) | `has_business_role()` RLS + `canManageQuotes(role)`-style app checks | Low |

### Customer portal boundary

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Customer claims to be a different customer of the same business | Identity bound to `customers.app_user_id = auth.uid()`, not client input | Low |
| Information disclosure | Customer A loads Customer B's `/portal/quotes/[id]` | RLS (`is_customer_for_business`) blocks the row; **no redundant app-level check on this specific page** (APPSEC-11, P3) | Low–Medium (RLS-only, see APPSEC-11) |
| Information disclosure | Customer sees internal staff notes on their own quotation/complaint | Internal-only fields excluded from customer-facing queries/components by convention | Needs periodic re-verification as new fields are added |

### Platform admin

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Elevation of privilege | A regular user sets their own `account_intent` or a `profiles` flag to gain admin | No such path exists — admin status lives only in `platform_admins`, modifiable only via `SECURITY DEFINER` RPC gated by an existing admin | Low |
| Elevation of privilege | An admin demotes themselves accidentally, or another admin maliciously, locking out access | `admin_set_super_admin()` blocks self-removal; first admin is bootstrapped out-of-band via `scripts/grant-super-admin.mjs` | Low |
| Information disclosure | Compromised admin account | Full cross-tenant aggregate read via `admin_*` RPCs — this is "full breach" by design once an admin account is compromised | **High impact, mitigated only by admin account hygiene (MFA, credential strength) — outside this codebase's control** |

### Stripe / billing

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Forged webhook payload claiming a subscription is paid | Signature verification with `timingSafeEqual` + timestamp tolerance, raw-body read before parsing | Low |
| Tampering | Replayed legitimate webhook event processed twice | Unique-index-backed idempotency (migration 0021) + `upsert(onConflict)` | Low |
| Elevation of privilege | Client directly calls an action to flip its own plan to "paid" | No such action exists; all subscription state changes are webhook-driven | Low |

### Notifications

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Information disclosure | Notification reveals another tenant's data via misrouted send | `business_id`-scoped queries + RLS; live send is currently disabled entirely | Low while disabled |
| Unwanted/abusive sending (spam) | Dispatcher fires without authorization | Two env flags + per-business DB flag + dispatch-secret header, all required | Low while gates remain in place — **re-assess the moment live send is enabled** |
| Tampering | Raw UUIDs/internal identifiers shown to a customer in a message | `redactNotificationText()` strips UUID patterns before render | Low |

### AI Vehicle Intelligence

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Tampering (hallucination) | AI invents a vehicle spec not grounded in reality | VIN/spec decoding sourced from NHTSA vPIC, not LLM generation | Low |
| Safety harm | AI suggests a dangerous DIY fix for a critical fault (e.g. brake failure) | `safety.js` classification + keyword/allowlist sanitization + `enforceSafetyOverrides()` forcing a safe response for critical severity | Low, contingent on overrides always being invoked on every new AI surface |
| Information disclosure | Symptom text sent to OpenAI includes more customer data than necessary | Only symptom/diagnostic text is sent today, not full customer profile | Low–Medium (no DPA/contract terms with OpenAI reviewed in this pass — flagged to legal) |

## 5. Trust Boundaries Diagram (textual)

```
[Browser] --TLS--> [Vercel/Next.js middleware] --session cookie--> [Server Components/Actions]
                                                                        |
                                       derives auth.uid() + business_id/customer_id server-side
                                                                        |
                                                                        v
                                                            [Supabase Postgres + RLS]
                                                                        |
                                  +--------------------+----------------+----------------+
                                  v                    v                                 v
                          [Supabase Storage]      [Stripe webhook]                [OpenAI / NHTSA]
                          signed URLs only        signature-verified              symptom text / VIN only
```

The single most consequential boundary is **Postgres RLS** — nearly every other
control (server-derived business_id, page-level filters) is defense-in-depth on top
of it. This is why [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) treats any
RLS-touching migration as a high-risk release requiring manual cross-tenant
verification, not just code review.

## 6. Out of Scope for This Threat Model

Physical security, social engineering of staff, mobile app (not yet built),
load/DoS, and destructive penetration testing — see
[PENTEST_SCOPE_AND_RULES_OF_ENGAGEMENT.md](PENTEST_SCOPE_AND_RULES_OF_ENGAGEMENT.md).
