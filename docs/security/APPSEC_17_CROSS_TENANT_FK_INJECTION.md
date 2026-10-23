# APPSEC-17 — Cross-tenant foreign-key injection in the invoicing & appointments schema

**Severity: P0 (Critical) — tenant isolation failure with financial-record impact.**
**Status: Fixed** in `supabase/migrations/0035_tenant_isolation_hardening.sql`
(+ app-layer defense in depth and `apps/web/tests/tenant-isolation.test.mjs`).

Audit target: branch `feature/invoicing-and-appointments`, specifically
`supabase/migrations/0034_invoicing_and_appointments.sql` and the dashboard/portal
server actions added alongside it. Detailed evidence convention follows
[APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md).

---

## 1. Why RLS is the only boundary here

`apps/web/src/lib/supabase/client.ts` ships the Supabase **anon key to the browser**,
and `0034` closes with:

```sql
grant select, insert, update, delete on
  public.invoices, public.invoice_items, public.invoice_payments,
  public.invoice_credit_notes, public.branch_appointment_settings,
  public.appointments
  to authenticated;
```

So every authenticated user can address PostgREST directly with a hand-written body.
**The server actions in `actions.ts` are not a security boundary** — they are one
convenient client among many. Any check that exists only there is decoration.
This is the assumption the rest of this document rests on.

## 2. Root cause

Every policy added in `0034` gates on the row's own `business_id`:

```sql
create policy "invoice_payments_staff_manage" on public.invoice_payments
  for all using (public.has_business_role(business_id, array['business_owner','manager']))
  with check (public.has_business_role(business_id, array['business_owner','manager']));
```

`business_id` is **supplied by the client on INSERT**. The attacker sets it to their
*own* business, so the check passes trivially. Nothing verified that the row's
**foreign keys** (`invoice_id`, `customer_id`, `branch_id`, `vehicle_id`, `job_id`,
`quotation_id`, `product_id`) point *into that same business*.

Two Postgres behaviours turn that omission into a working exploit:

1. **Referential-integrity checks bypass RLS by design.** An FK aimed at another
   tenant's row validates happily — RLS never sees it.
2. **`SECURITY DEFINER` triggers and functions read and write with RLS off.**
   `recompute_invoice_paid_status()` is one, and it writes to `public.invoices`.

The codebase already knew the correct rule. `create_quotation_draft()` in
`0008_secure_quote_creation.sql` enforces it explicitly:

```sql
-- The customer must belong to the same business.
```

`0034` did not carry that discipline forward to any of its six new tables.

## 3. Confirmed attack paths

Precondition for all: attacker is an `business_owner`/`manager` of *any* business
(self-serve signup), and knows a target UUID. UUIDs are not guessable in general —
but a user who is a **portal customer of workshop B** sees B's invoice and
appointment ids in their own portal, and can separately own a business A. That
overlap is the realistic attacker.

### 3.1 Marking another tenant's invoice as paid (highest impact)

```http
POST /rest/v1/invoice_payments
{ "business_id": "<A, attacker's>", "invoice_id": "<invoice owned by B>",
  "method": "cash", "amount": 999999 }
```

`with check` passes (business_id is A). The FK to B's invoice validates. The
`invoice_payments_recompute` trigger — `SECURITY DEFINER` — then recomputes
`amount_paid` from **all** payments on that invoice and updates **business B's**
invoice row with RLS off, flipping `status` to `paid`.

Impact: falsified settlement of another workshop's tax document; the victim also
loses the ability to void it, because `void_invoice()` refuses once
`amount_paid > 0`. Victim staff cannot even see the offending payment row —
`invoice_payments_staff_manage`'s `USING` clause is `business_id`-scoped, so the
injected row is invisible to them while its effect is not.

### 3.2 Injecting line items and credit notes into another tenant's invoice

Same shape against `invoice_items` / `invoice_credit_notes`. The
`*_customer_read` policies resolve **by `invoice_id` alone**, so the injected rows
render on **business B's customer's** copy of the invoice
(`(portal)/portal/invoices/[id]/page.tsx` reads items with
`.eq("invoice_id", id)` and no business filter) — while staying invisible to B's
own staff. Attacker-controlled content on a third party's tax document.

### 3.3 Squatting another tenant's booking capacity

`branch_appointment_settings` is `unique (branch_id)` and its `with check` never
validated `branch_id`. An attacker inserts a row for **B's branch** with
`business_id = A`. B can then never create its own settings row (unique violation)
and cannot see or edit the attacker's (RLS is `business_id`-scoped), while
`confirm_appointment()` reads that row as `SECURITY DEFINER` — so the attacker
dictates B's `max_concurrent`.

### 3.4 Filling another tenant's calendar

`confirm_appointment()` counted overlapping confirmed appointments by `branch_id`
across **all** businesses. Combined with the unvalidated `branch_id` on
`appointments`, business A could book onto B's branch and exhaust its capacity.

### 3.5 Borrowing another customer's vehicle (portal)

`appointments_customer_insert` pinned `customer_id` to the caller but left
`vehicle_id` free, so customer X could attach customer Y's vehicle to a booking.

## 4. Fixes applied

**`0035_tenant_isolation_hardening.sql`**

- Seven `SECURITY DEFINER`, `stable` FK-scoping helpers
  (`customer_in_business`, `branch_in_business`, `vehicle_in_business`,
  `job_in_business`, `quotation_in_business`, `product_in_business`,
  `invoice_in_business`) plus `vehicle_in_customer`. `SECURITY DEFINER` is
  required, not stylistic: these run inside policies evaluated for **portal
  customers**, who cannot `SELECT public.branches`, so a plain `EXISTS` subquery
  would be evaluated under the caller's own RLS and fail closed on legitimate
  traffic. Each returns `TRUE` for a NULL id ("no reference to validate");
  `NOT NULL` on the column is what makes a reference mandatory.
- Every `with check` on the six new tables now validates **all** of its FKs.
- The three `*_customer_read` policies now additionally require
  `i.business_id = <child>.business_id`, so a mismatched row can never render on
  a victim customer's document even if one already exists.
- `recompute_invoice_paid_status()` sums only same-tenant payments.
- `confirm_appointment()` scopes both the settings lookup and the overlap count
  to the appointment's own `business_id`.
- `appointments_customer_insert` additionally requires
  `vehicle_in_customer(vehicle_id, customer_id)`.

**Repair, not deletion.** The migration does **not** delete cross-tenant rows:
they are the forensic record of whether this was exploited, and a migration
should not silently discard that. The policy and trigger changes already make
them unwritable, unreadable and excluded from every total; a one-time recompute
repairs any `amount_paid`/`status` a previously-injected payment corrupted. The
service-role-only view `public.cross_tenant_reference_audit` lists any surviving
mismatches for an operator to triage.

> **Operator action required after deploying `0035`:**
> ```sql
> select * from public.cross_tenant_reference_audit;
> ```
> Rows here cannot be produced legitimately. A non-empty result means this was
> exercised in production and should be handled as an incident, not a cleanup.

**App layer (defense in depth — RLS remains the real gate)**

- `recordInvoicePayment` resolves the invoice inside the session-derived business
  before inserting, and rejects `draft`/`void` invoices, with a non-enumerating
  error per the APPSEC-11 convention.
- `createAppointment` resolves `customer_id`, `branch_id` and `vehicle_id` in-tenant
  first, and requires the vehicle to belong to *that customer*.
- `confirmAppointment` narrows the client-supplied `locale` to the `AppLocale`
  allowlist instead of casting an arbitrary string into `Intl`.

## 5. Adjacent findings

### 5.1 Portal booking page was non-functional (fixed — and the obvious fix was the insecure one)

`(portal)/portal/appointments/new/page.tsx` reads `branches` with the *customer's*
client, but `0002` grants `branches` SELECT only to `is_business_member`. RLS
filters silently, so `branchRows` is always empty, `hasBranch` is false, and the
booking form **never renders for any customer**.

Recorded here because the tempting repair — `createAdminClient()` — would hand an
RLS-free service-role read to a page serving untrusted users. `0035` instead adds
`branches_customer_read`, scoped by a new `is_customer_of_business()` helper and
limited to `is_active` branches. A test asserts the page never imports
`createAdminClient`.

### 5.2 Missing baseline response headers (fixed)

`next.config.ts` set no security headers. Added `frame-ancestors 'none'` +
`X-Frame-Options: DENY` (the dashboard and portal are full of one-click
state-changing forms — approve quote, void invoice, confirm appointment — so
framing must be denied), `form-action 'self'`, `base-uri 'self'`,
`object-src 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS,
and `poweredByHeader: false`.

**Deliberately not shipped: a `script-src` directive.** Next.js injects inline
bootstrap scripts, so a meaningful `script-src` needs per-request nonces threaded
through middleware into the document — a change that must be verified against a
running app, not shipped blind. Adding `'unsafe-inline'` to claim CSP coverage
would be worse than omitting the directive. **This remains open work.**

### 5.3 Non-constant-time secret comparison (fixed)

`/api/notifications/dispatch` compared its shared secret with `!==`. `/api` is
excluded from middleware, so that header is the only gate on a privileged,
service-role notification drain. Now uses `crypto.timingSafeEqual`, matching
`verifyStripeWebhookSignature` in the same codebase.

## 6. Verified as sound (no change needed)

- **Stripe webhook** — timestamp tolerance (replay protection), HMAC-SHA256 over
  `t.payload`, length check, `crypto.timingSafeEqual`. Textbook.
- **Notification identity binding** — `queueCustomerNotification` loads the
  customer *under* the business via `loadCustomerContext`, so a mismatched
  `(business, customer)` pair queues nothing. This is what stopped APPSEC-17 from
  also becoming a cross-tenant notification/PII delivery bug. Payloads are
  allowlisted; recipients are re-derived from the verified row.
- **The `0034` RPCs themselves** — `issue_invoice`, `void_invoice`,
  `create_invoice_credit_note`, `confirm_appointment`, `decline_appointment`,
  `cancel_appointment`, `convert_appointment_to_quotation` each re-check
  `has_business_role()` / `is_business_member()` against the row's *own*
  `business_id` before mutating. Correct. Gapless numbering is serialized with
  per-business advisory locks.
- **Auth helpers** — `getUser()` uses `supabase.auth.getUser()` (revalidates the
  token) rather than `getSession()`, in middleware and server code alike. The
  `revora_active_business_id` cookie is client-controlled but only *selects among*
  the caller's own memberships, falling back to the first.
- **Portal read paths** — the new portal pages scope by session-derived
  `customerIds` and return `notFound()`, so they are non-enumerating.
- **Input validation** — the new Zod schemas follow the APPSEC-09 convention;
  enum allowlists mirror the Postgres enums.
- **Secrets hygiene** — no `.env` or key material tracked; `.gitignore` covers it.
- **Injection sinks** — no `dangerouslySetInnerHTML`, `eval`, or `new Function`
  anywhere in `apps/web/src`. The import-template route resolves via a `Map`
  allowlist and returns 404 otherwise.

## 7. Regression coverage

`apps/web/tests/tenant-isolation.test.mjs` — 13 static assertions pinning the
*shape* of every fix above. These are text assertions, not integration tests:
only a live two-tenant Postgres can truly prove an RLS policy, so these instead
guarantee a future migration cannot quietly drop the rule — which is exactly how
`0034` regressed the rule `0008` had already established.

Full suite: **315/315 pass**; `pnpm lint` clean; `pnpm typecheck` clean;
`pnpm build` succeeds.
