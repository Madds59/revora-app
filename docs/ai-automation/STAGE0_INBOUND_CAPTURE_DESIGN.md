# Stage 0 — Inbound Capture: Design

**Status:** schema proven against real PostgreSQL. Meta and WhatsApp routes
built and tested; voice and email still specified only (see
[Scope](#what-this-draft-does-and-does-not-include)).

**Artefacts in this draft**

| File | What it is |
|---|---|
| [0048_inbound_capture.sql](supabase/migrations/0048_inbound_capture.sql) | The schema. Applies cleanly as migration 44 of 44. |
| [inbound_capture_tests.sql](supabase/tests/inbound_capture_tests.sql) | 21 RLS/integrity cases, all passing, with controls and a positive control. |
| [0049_inbound_rate_limit_scope.sql](supabase/migrations/0049_inbound_rate_limit_scope.sql) | Adds the `inbound_ip` limiter scope. |
| [lib/inbound/](apps/web/src/lib/inbound) | Verifier, normalisers, service layer, shared handler. |
| [inbound-capture.test.mjs](apps/web/tests/inbound-capture.test.mjs) | 27 unit tests, with positive controls. |
| This document | Intent, the security argument, and the route contracts. |

---

## Intent

Give Revora an entry point for a stranger. Today the first-class record is
`customers`, created by hand by a staff member; there is no object for someone
who has merely asked a question, and no route that can receive one. A DM, a
Meta lead-form submission and a 4pm Friday phone call are all unrecorded.

Stage 0 adds that object, the identity that owns it, the conversation around
it, and the signed inbound paths that create it.

**Goals**

- One normalised inquiry record regardless of channel.
- Tenant resolution that is structurally impossible to get wrong.
- Every inbound delivery signature-verified, deduplicated and auditable.
- Campaign attribution carried from the ad to the booked job.
- Consent captured at capture time.

**Non-goals**

- No AI in this stage. Classification, reply drafting and the voice agent are
  Stage 1+ and consume these tables. Stage 0 is plumbing on purpose: it has to
  be boring and provable before anything generative touches it.
- No customer portal surface. A lead is business-internal (see below).
- No outbound sending changes. Replies reuse the existing dispatch path and its
  triple kill switch.

**Anti-goals** — what would make this a failure even if it shipped:

- An inbound route that stores a payload before knowing whose it is.
- A tenant able to register a channel account it does not control.
- A lead thread reachable by a customer, repeating the complaint-visibility
  mistake `AGENTS.md` explicitly forbids.
- New PostgREST relationship ambiguity, which renders as a false empty state
  rather than an error.

---

## The security argument

Stage 0 is the app's first unauthenticated write path. Everything else in the
schema hangs off a `business_id` that a session already proves; a webhook
proves nothing. It arrives from Meta or a telephony provider and *claims* to
be about some account. Three properties carry the design.

### 1. Tenant resolution is a uniqueness constraint, not a judgement

`inbound_channel_routes` carries a **global** `unique (channel, external_account_id)`.
One Instagram account, WhatsApp number or DID maps to exactly one tenant, and
the database enforces it. Resolution is a lookup.

**Route creation is platform-admin only.** A business owner may read their own
routes and never create one. This is the non-obvious part, and it is
deliberate: the external account id is unverifiable from inside the tenant, so
self-service registration would let anyone claim a competitor's Instagram page
id and divert their inbound leads. Both halves are proven:

```
CASE route_claim_other_tenants_account=PASS (reject, refused 42501)
CASE route_self_service_creation_blocked=PASS (reject, refused 42501)
CASE route_account_unique_with_rls_bypassed=PASS (reject, refused 23505)
CASE route_owner_can_read_own=PASS (accept, routes visible to B manager=1)
```

The third case runs with RLS bypassed. Without it the policy would mask the
constraint and the uniqueness would never actually be tested.

### 2. The pre-tenant table is unreachable

`inbound_webhook_events` stores the raw signed payload *before* a tenant is
known, so it cannot carry a tenant predicate. It therefore gets the
`auth_rate_limits` treatment from migration 0044: **RLS enabled with zero
policies**, plus an explicit `revoke all ... from anon, authenticated`.

The revoke is not belt-and-braces. Migration 0003 runs
`alter default privileges in schema public grant all on tables to anon, authenticated, service_role`,
so every new table inherits a table-level grant the moment it is created. RLS
with no policies already denies them, but the revoke makes the denial rest on
two independent mechanisms, so adding a policy later cannot alone open the
table up.

```
CASE webhook_events_insert_blocked_for_authenticated=PASS (reject, refused 42501)
CASE webhook_events_select_blocked_for_authenticated=PASS (reject, refused 42501)
CASE webhook_events_insert_blocked_for_anon=PASS (reject, refused 42501)
```

`resolved_business_id` on that table is forensic metadata, written after the
fact. It is never a security predicate.

### 3. Cross-tenant attachment is structurally impossible

Migration 0039 established the rule: a child row carrying its own `business_id`
plus a single-column FK to a parent is a cross-tenant write primitive, because
PostgreSQL validates foreign keys **with RLS bypassed**. Every tenant-owned
reference in Stage 0 is therefore a composite `(parent_id, business_id) ->
parent (id, business_id)`.

**Only the composite form, never both.** Declaring both would leave two
foreign-key paths between the same pair of tables — which is what made 111
PostgREST relationship pairs ambiguous after 0039 and surfaced as PGRST201
rendered as a false empty state. Measured: `ambiguous_pairs` stayed at 111
after this migration, so Stage 0 adds no new ambiguity and every embed from
these tables resolves without a constraint hint.

```
CASE lead_attached_to_other_tenants_customer=PASS (reject, refused 23503)
CASE lead_attached_to_other_tenants_identity=PASS (reject, refused 23503)
CASE identity_claims_other_tenants_customer=PASS (reject, refused 23503)
CASE message_attached_to_other_tenants_lead=PASS (reject, refused 42501)
CASE lead_cross_tenant_refused_with_rls_bypassed=PASS (reject, refused 23503)
CASE message_cross_tenant_refused_with_rls_bypassed=PASS (reject, refused 23503)
```

Note the pairing. `message_attached_to_other_tenants_lead` was refused with
**42501** — the policy — which says nothing about whether the composite FK
exists. The RLS-bypassed twin refusing with **23503** is what proves the
structural layer is really there.

`pnpm audit:tenant-fks` caught one that I had got wrong:
`lead_messages.ai_tool_call_id` was a single-column FK, so a tenant-A message
could have cited tenant B's model call. `ai_tool_calls` predates the 0039
sweep and carried no `(id, business_id)` unique; 0048 adds one and makes the
reference composite. The audit now reports **98 relations, 98 covered, 0
uncovered**.

### 4. A lead is business-internal

No policy in 0048 grants a portal user anything. This is the end state, not an
omission: a lead is a stranger's inquiry, and once it is matched and converted,
the existing customer, vehicle and appointment records carry the relationship
under their own portal policies.

`lead_messages.is_internal` exists from the start anyway, because `AGENTS.md`
forbids internal complaint messages reaching customers and a lead thread is the
next place that class of mistake becomes available.

```
CASE portal_customer_sees_no_leads=PASS (reject, leads visible to portal customer=0)
CASE portal_customer_sees_no_lead_messages=PASS (reject, messages visible to portal customer=0)
CASE manager_a_cannot_see_tenant_b_leads=PASS (reject, B leads visible to A manager=0)
CASE control_manager_a_sees_own_leads=PASS (accept, own leads visible to A manager=2)
```

The last line is the control for the one above it. "A sees none of B's leads"
would also be satisfied by a policy that hides everything from everyone.

### 5. Generated messages stay attributable

A `lead_messages` row with `author_type = 'ai_agent'` and a null
`ai_tool_call_id` is rejected by a check constraint. Every AI-authored turn
cites its row in the existing `ai_tool_calls` ledger, so no generated message
is unattributable after the fact.

```
CASE ai_message_without_tool_call_refused=PASS (reject, refused 23514)
```

---

## Schema

Five tables. Three are the ones you named; two are the infrastructure the
signed routes genuinely require.

### `inbound_channel_routes` — tenant resolution
`business_id`, `branch_id` (composite FK), `channel`, `external_account_id`,
`display_label`, `is_active`, `verify_token_hash` (hashed, never raw — the
table is readable by every member of the business).
**Global unique** `(channel, external_account_id)`. Admin-write, member-read.
Carries the `audit_row_change()` trigger.

### `inbound_webhook_events` — raw, signed, pre-tenant
`channel`, `external_event_id`, `resolved_business_id`, `route_id`,
`signature_verified`, `payload jsonb`, `status`, `error_message`,
`received_at`, `processed_at`.
Partial unique on `(channel, external_event_id)` where not null — webhook
delivery is at-least-once everywhere, and a replay must be a no-op rather than
a duplicate lead. Status domain: `received`, `processed`, `rejected`,
`unresolved_tenant`, `bad_signature`, `duplicate`.

### `channel_identities` — one person on one channel
`business_id`, `channel`, `external_id` (PSID, IG-scoped id, E.164, email),
`external_handle` (display only — the person can change it, so it is never an
identity key), `display_name`, `locale`, `customer_id` (composite FK, nullable),
`first_seen_at`, `last_seen_at`.
Unique `(business_id, channel, external_id)`. This is what stops every channel
building its own shadow customer list.

### `leads` — the inquiry
`business_id`; composite FKs to `branches`, `channel_identities`, `customers`,
`vehicles`, `appointments`, `quotations` — all nullable, because a lead begins
as an unidentified stranger. Plus `channel`, `status` (8-value domain),
`subject` (as received), `summary`/`intent`/`service_type`/`urgency`/
`ai_confidence` (AI-written, reviewable, never authoritative),
`safety_flagged`, `source_campaign_id`/`source_ad_id`/`source_form_id`,
`assigned_to`, `marketing_consent`/`consent_source`, `first_response_at`,
`closed_at`.
`ai_confidence` is range-checked to `[0,1]`. A lead is converted when
`appointment_id` or `quotation_id` is set. Carries `audit_row_change()`,
because who got a lead and when is a record businesses will dispute.

### `lead_messages` — each turn
`business_id`, `lead_id` (composite, cascade), `direction`, `author_type`
(`customer`/`staff`/`ai_agent`/`system`), `author_user_id`, `body`,
`media_asset_id` (composite), `external_message_id`, `ai_tool_call_id`
(composite), `is_internal`.
Partial unique on `(business_id, external_message_id)`, so a replayed webhook
cannot double-post a turn.

A new `inbound_channel` enum carries the channel vocabulary: `instagram`,
`facebook`, `whatsapp`, `tiktok`, `meta_lead_ad`, `voice`, `sms`, `email`,
`web_chat`, `web_form`. A domain rather than free text, because a typo would
silently create a second, unroutable channel.

---

## Inbound route contracts

Four routes, all `POST`, all following the shape of the existing
`/api/stripe/webhook`. New paths: `/api/inbound/meta`, `/api/inbound/whatsapp`,
`/api/inbound/voice`, `/api/inbound/email`.

### The shared handler sequence

Every route performs the same eight steps in the same order. The ordering is
the design — step 4 before step 5 is what keeps an unresolvable payload out of
tenant-scoped storage.

1. **Read the raw body as text.** Not parsed JSON: the signature is computed
   over the exact bytes, and re-serialising changes them. The existing Stripe
   route already does this.
2. **Verify the signature** (per channel, below). Constant-time comparison via
   `crypto.timingSafeEqual`, following `verifyStripeWebhookSignature()` — a
   `!==` on a secret short-circuits at the first differing byte and leaks its
   prefix to anyone who can time the response.
3. **Reject stale timestamps** where the provider supplies one, with the same
   300-second tolerance the Stripe verifier uses, so a captured delivery cannot
   be replayed indefinitely.
4. **Record the delivery** in `inbound_webhook_events` with
   `signature_verified`, before any interpretation. A bad signature is stored
   with `status = 'bad_signature'` and nothing else happens — the failed
   attempt is itself evidence.
5. **Resolve the tenant** by looking the payload's account id up in
   `inbound_channel_routes`. No match → `status = 'unresolved_tenant'`, return
   200, stop. **Nothing tenant-scoped is written.**
6. **Deduplicate** on `(channel, external_event_id)`. Conflict →
   `status = 'duplicate'`, return 200, stop.
7. **Upsert the identity, then the lead, then the message**, all under the
   resolved `business_id`, in one transaction.
8. **Return 200 quickly.** Every provider here retries on non-2xx and several
   disable a flapping endpoint. Classification and reply generation are Stage 1
   work and belong on a queue, not in the request.

Steps 2–6 belong in one shared module (suggested:
`apps/web/src/lib/inbound/verify.ts`) with a per-channel verifier table, so
there is one audited implementation rather than four divergent ones.

### Per-channel verification

| Route | Verification | Notes |
|---|---|---|
| `/api/inbound/meta` | `X-Hub-Signature-256`: HMAC-SHA256 of the raw body with the Meta **app secret**. Also serves `GET` for the one-time `hub.challenge` subscription handshake, comparing `hub.verify_token` against the platform-level `META_VERIFY_TOKEN`. | Covers Instagram DMs, Facebook Messenger and Meta lead-ads; tenant comes from the entry's page/IG account id. |
| `/api/inbound/whatsapp` | Same `X-Hub-Signature-256` scheme (WhatsApp Cloud API is a Meta product). | Tenant from `metadata.phone_number_id`. |
| `/api/inbound/voice` | Provider HMAC over the request URL plus sorted body params. For Twilio this is `X-Twilio-Signature` with the auth token as the key. | Tenant from the called number (`To`) in E.164. |
| `/api/inbound/email` | Provider signature (Resend already supplies the outbound side; its inbound webhooks are signed). | Tenant from the receiving address. |

**Secrets.** The Meta app secret and the telephony auth token are
platform-level, in environment variables — not per tenant, because the app is
one Meta app serving many tenants. **Correction to an earlier draft of this document:** it described
`hub.verify_token` as per-route. That is wrong about Meta. The verify token is
configured once per Meta *app*, not per page or per number, so it is
platform-level too (`META_VERIFY_TOKEN`).
`inbound_channel_routes.verify_token_hash` remains in the schema for providers
that genuinely verify per route, and is deliberately unused by the Meta and
WhatsApp routes. No raw secret is ever logged, echoed, or returned, matching
`cron-auth.ts` and the Stripe route.

**Rate limiting.** The inbound routes are public, so they need a limiter.
`consume_rate_limit()` from 0044 already provides a hashed-bucket, atomic,
fail-closed implementation, so migration 0049 adds one scope (`inbound_ip`,
60 per 15 minutes) to its hard-coded allowlist rather than inventing a second
limiter. The scope list lives *inside* that function by design — "a caller must
not be able to request a more generous limit than this allowlist grants" — so
this is a migration, not a config change, and the whole function body is
restated because Postgres cannot patch one.

The limiter applies **only to the path where signature verification failed**.
A valid HMAC proves the caller holds the Meta app secret, so there is nothing
to throttle on the verified path; limiting it by IP would throttle Meta's own
egress addresses, which carry every tenant's real traffic. The abuse case is
someone hammering a public URL with junk, and that is exactly what lands on the
unverified path.

Worth noting: on `main`, `consume_rate_limit()` had **no caller in application
code** — 0044 built the limiter and nothing used it. These routes are its first
consumer.

**Why 200 on a rejected payload.** A bad signature or an unknown account
returns 200 after recording the attempt. Returning 4xx teaches the provider to
retry and eventually to disable the endpoint, and it tells a prober which
account ids are live. The event row carries the real outcome.

### Surfaces

`/leads` (new) — the work queue: list, filter by status and channel, open a
thread, assign, convert. Reuses the existing page-header/card/table/badge
patterns and `requireMembership()`. Route config at
`/settings/business` under the existing settings group, read-only, with route
creation handled from `/admin/tenants`.

---

## What this draft does and does not include

**Included and proven:** the schema, its RLS, its structural integrity, and
regression evidence against the repo's existing audits.

**Built since this draft** (branch `feat/stage0-inbound-capture`): the shared
verifier (`lib/inbound/verify.js`), the payload normalisers
(`lib/inbound/meta-payload.js`), the service layer and shared handler, the
`/api/inbound/meta` and `/api/inbound/whatsapp` routes, migration 0049's
`inbound_ip` scope, and 27 unit tests. The pure modules are `.js` with JSDoc
types, following the convention in `lib/notifications` and
`lib/vehicle-intelligence`: `tsconfig.json` includes only `.ts`/`.tsx`, so a
`.js` module is importable from `node --test` with no build step.

**Still specified but not implemented:** the `/api/inbound/voice` and
`/api/inbound/email` routes, and the `/leads` UI. These are blocked on
decisions only you can make:

1. **Which Meta app.** One platform app serving all tenants (assumed here, and
   what makes the app secret platform-level) or per-tenant apps.
2. **Which telephony provider.** Twilio is already a dependency for outbound
   SMS, which makes it the cheapest answer for voice, but the signature scheme
   in the table above is provider-specific.
3. **Who registers routes.** The design makes this platform-admin only for the
   reason given above. That is a real operational cost — onboarding a tenant's
   Instagram account becomes a support action — and the alternative (owner
   self-service with a verification challenge) is defensible but needs a
   proof-of-control flow designing.

**Deferred to Stage 0b:** `voice_calls` and `call_transcripts`. The catalog
proposes both, and the voice receptionist (A4) needs them, but their shape
depends on decision 2 above, so drafting them now would be guesswork.

---

## Verification

Run from `apps/web`:

```bash
pnpm test                              # 457 offline tests, 27 of them inbound
pnpm test:db:inbound                   # 25 cases, expect INBOUND_CAPTURE_OK
pnpm test:db:inbound:positive-control  # schema 0047, must refuse
pnpm audit:tenant-fks                  # expect 98/98 covered
pnpm audit:inbound-embeds:self-test    # control: the detector can detect one
pnpm audit:inbound-embeds              # expect embeds=0
```

`test:db:inbound` is wired into `test:db:all`. The positive control builds the
schema at 0047 and runs the same file; its preflight raises because the Stage 0
tables are absent, so a green run of the suite cannot be a vacuous one.

**Branch base.** This work is cut from `main`. PR #27 (the PostgREST embed
fixes) is **not** in `main` — it exists only on the unmerged
`fix/surface-discarded-*` branches — so `audit-embeds` and its script are
absent here. The inbound code issues no PostgREST embed at all, which
`audit:inbound-embeds` proves locally (with its own self-test as the control),
so the PGRST201 class cannot apply to it. The `/leads` UI, when it is built,
will need the real embed audit.

**Measured on 2026-10-25:** migration 0048 applies as 44 of 44 (70 tables, 141
policies) and 0049 as 45 of 45. Stage 0 database suite 25/25. Offline suite
457/457, including 27 inbound tests. Pre-existing tenant-integrity suite 16/16.
`audit:tenant-fks` 98/98 covered. `audit:inbound-embeds` 0 embeds across 7
files, self-test 7/7. `audit:views` 2/2 compliant,
`audit:function-privileges` OK, `audit:migration-safety` 0 findings. Lint and
typecheck clean.
