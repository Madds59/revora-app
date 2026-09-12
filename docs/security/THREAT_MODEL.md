# Threat Model

Methodology: lightweight STRIDE-by-asset, scoped to what's actually implemented in
`origin/main` @ `a3d21f078ff1e253a7050502d2b473a25271d9aa`. Companion:
[APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) for evidence,
[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) for the role/resource grid.

**Pending-merge delta.** Digital Vehicle Inspection (DVI) V1 — migration `0037` plus
its application layer, branch `feature/dvi-v1`, PR #16 — introduces the product's
**first unauthenticated data surface**. It is not on `main` at the baseline SHA above.
Content describing it is marked *(DVI, pending merge)* so a reader can tell modelled-
but-unmerged from modelled-and-shipped. Design authority:
`docs/superpowers/specs/2026-09-06-digital-vehicle-inspection-v1-design.md` §13.

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
| Share-link holder *(DVI, pending merge)* | None — bearer only; holds a 43-char base64url token, never a session | Read **one** completed inspection report (workshop name, vehicle label, date, summary, per-item results, customer-safe notes, photos) at `/[locale]/i/<token>` | Forward the link onward; attempt to enumerate other reports by guessing tokens; attempt to reach any other route through the exemption |
| Customer | Authenticated, scoped to own `customers` rows across 1+ businesses | View/approve own quotes, file/view own complaints, manage own vehicles' history | Attempt to read/write another customer's or another business's data |
| Staff (employee/manager) | Authenticated, scoped to one business via `business_members` | Operate CRM/jobs/quotations/complaints for their business | Attempt cross-tenant access, attempt to exceed their role (e.g. employee acting as manager) |
| Business owner | Authenticated, elevated within own business | Everything staff can, plus billing/settings/invites | Same as staff, plus billing manipulation attempts |
| Platform admin | Authenticated, cross-tenant read via `admin_*` RPCs | Aggregate metrics, list businesses, manage other admins | Abuse of cross-tenant visibility; self-elevation attempts |
| Compromised dependency / CI step | N/A | N/A | Supply-chain injection into the build |
| External webhook caller (Stripe) | Cryptographically verified per-request | Deliver billing events | Forge events without the signing secret (blocked by signature check) |

## 3. Assets Ranked by Sensitivity

1. Customer personal data + vehicle VIN/plate/service history (Restricted)
2. Signed approvals/contracts and complaint records (Restricted, legal value)
2b. Inspection reports and their photos *(DVI, pending merge)* (Restricted — evidence
   shown to a customer to justify spend; a subset is reachable by bearer token)
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

### Public inspection share link *(DVI, pending merge)*

The only route in the product that serves tenant data with no session. Modelled as a
**capability URL**: the token *is* the authorization, so the threat model is about
what the token can reach, how long it lives, and what happens when it leaks.

| Threat | Scenario | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Attacker guesses or brute-forces a token | 32 cryptographically random bytes (256 bits), base64url, never a UUID; lookup is exact-hash equality with no prefix/partial matching | Low — guessing is not a practical attack |
| Information disclosure | Database or backup leak yields working links | Only the **SHA-256 digest** is stored (`vehicle_inspections.share_token_hash bytea`); the plaintext is shown once at generation and never persisted or logged. A dump yields no usable link | Low |
| Information disclosure | The public payload carries customer identity, other vehicles, or pricing | The two `anon`-granted resolvers return a fixed column set (`inspection_id`, `business_name`, `vehicle_label`, `completed_at`, `summary`, and per-item `section`/`label`/`result`/`note`). No customer name, contact, address, customer id, other vehicle, other inspection, price, quotation, invoice, staff identity, storage path, or tenant identifier is selectable | Low — asserted by `PUBLIC_PAYLOAD_LEAKS=0` in `supabase/tests/dvi_security_tests.sql` |
| Information disclosure | A draft, or an inspection still being worked, is exposed | Both resolvers require `status = 'completed'`; `set_inspection_share` refuses a draft outright | Low |
| Information disclosure | The route becomes an existence oracle — "does inspection X exist?" | Unknown, expired and revoked tokens produce a byte-identical response (verified: 78,829 B each; the only differing bytes are the token the caller itself supplied, echoed in the RSC route params) | Low |
| Information disclosure | Token leaks via `Referer` when the recipient clicks a photo, via a shared cache, or via a search index | `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, plus `<meta name="robots">`. The route disables analytics/telemetry and the token is never logged | Low–Medium — the token still sits in the URL, so it survives in the recipient's browser history and in anything they paste it into. Inherent to a capability URL |
| Information disclosure | The exemption is used to reach some other route unauthenticated | `isPublicPath()` matches the **exact** shape `^/i/[A-Za-z0-9_-]{43}$` — never a `startsWith("/i")` directory exemption. Anything else under `/i` falls through to the normal auth gate | Low |
| Tampering | Holder edits the report they were shown | Resolvers are `stable` and read-only; completed inspections are immutable by trigger regardless of caller | Low |
| Elevation of privilege | Holder pivots from the link to any other tenant data | The resolvers are the only functions granted to `anon`; direct `SELECT` on every DVI table returns 0 rows for `anon`, and no other DVI function is `anon`-executable (asserted exactly, see below) | Low |
| Elevation of privilege | A future `public` function is silently `anon`-executable via Supabase `DEFAULT PRIVILEGES` | Every privileged DVI function revokes from `public, anon` explicitly; the test suite asserts the **exact** anon allowlist (`ANON_FUNCTION_ALLOWLIST_EXACT`), so adding a function without a revoke fails CI. See APPSEC-19 for the same gap in `0034`–`0036` | Low for DVI; **open elsewhere** |
| Repudiation | Workshop cannot show when a link was issued or withdrawn | `share_created_at`, `share_expires_at`, `share_revoked_at` are recorded; rotation overwrites the hash, invalidating the prior link | Low |
| Denial of service | Token space is brute-forced at volume | **No bespoke rate limiter ships in V1** — a deliberate, recorded decision (APPSEC-18): `auth_rate_limits` exists only on the unmerged APPSEC-10 branch, and DVI must not depend on it. Against 256 bits, brute force is not a practical threat | Accepted; follow-up is to route this endpoint through the APPSEC-10 limiter once merged |
| Information disclosure | Photos are signed before the caller is proven entitled to them | The token is validated **first**; signed URLs are minted only afterwards, only for that inspection's assets, and each path is re-authorized against the owning business, the `inspection-item` namespace and the exact item id before the service role signs it | Low |

**Known asymmetry, accepted.** A *malformed* token (not 43 base64url characters) is
redirected to `/login` by the auth gate, whereas a well-formed token that does not
resolve renders the generic "not available" page — so those two are distinguishable.
This is the cost of an exact-shape exemption rather than a directory exemption, and
the exact shape is the stronger control: nothing but a correctly-formed token reaches
an unauthenticated render at all. It reveals only the token *format*, which any link
holder already knows. The property that matters — every **well-formed** token
producing an identical response whether unknown, expired or revoked — holds and is
tested. Documented in `apps/web/src/lib/supabase/middleware.ts`.

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
of it. The one deliberate exception is the DVI share route *(pending merge)*, which
carries no session and therefore cannot rely on RLS at all: there, the boundary is
the pair of `SECURITY DEFINER` resolver functions, which are the only functions
granted to `anon` and which encapsulate the completed / not-revoked / not-expired
predicate so the route cannot forget it. This is why [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) treats any
RLS-touching migration as a high-risk release requiring manual cross-tenant
verification, not just code review.

## 6. Out of Scope for This Threat Model

Physical security, social engineering of staff, mobile app (not yet built),
load/DoS, and destructive penetration testing — see
[PENTEST_SCOPE_AND_RULES_OF_ENGAGEMENT.md](PENTEST_SCOPE_AND_RULES_OF_ENGAGEMENT.md).
