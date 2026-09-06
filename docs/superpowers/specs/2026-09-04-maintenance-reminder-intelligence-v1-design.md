# Maintenance Reminder Intelligence V1 — Design

**Date:** 2026-09-04
**Status:** Approved (owner mandate), implementation in progress
**Base migration at time of writing:** `0035_tenant_isolation_hardening.sql`
**This feature's migration:** `0036_maintenance_reminder_intelligence.sql`

---

## 1. Goals

Turn maintenance data Revora already stores into a proactive, honest service reminder.

1. Give a vehicle an **odometer history**, not a single mutable number.
2. Derive an **effective maintenance due date** from whichever trustworthy signal
   is available: a calendar date, a mileage threshold projected onto a date, or both.
3. Send customers a **two-stage reminder** through the existing notification queue.
4. Suppress the reminder when the customer has **already booked**.
5. Give staff an **in-app worklist** of vehicles falling due, for proactive calls.
6. Fix the pre-existing gap that **nothing triggers notification dispatch**.

## 2. Non-goals

- No staff email/SMS digest. Staff get an in-app page in V1. `queueCustomerNotification`
  is customer-keyed and `notification_preferences` is customer-scoped; a staff delivery
  pathway is a separate subsystem and is explicitly out of scope.
- No machine learning. Projection is arithmetic, and is presented as an estimate.
- No third "overdue campaign" stage.
- No new delivery engine. The existing queue, dispatcher, templates, dedupe, retry,
  locking and poison-row handling are reused as-is.
- No customer-facing odometer self-service.
- No multi-timezone tenancy (see §17).
- No unit system beyond kilometres (see §4).

## 3. Existing architecture this builds on

Verified by reading the repository, not assumed:

| Component | Location | Relevance |
|---|---|---|
| `vehicle_maintenance_plans` | `0024_vehicle_intelligence.sql` | Append-only AI-generated snapshots holding `next_service_date` and `next_service_mileage`. Written by `saveMaintenancePlan()`. |
| Mileage capture (existing) | `vehicle_symptom_reports.mileage` | Free-text field on the staff `ai/vehicle-diagnosis` and portal `ai/health-check` forms. Never aggregated onto the vehicle. |
| `notification_events` | `0001` + `0030` | Queue with `scheduled_for`, `dedupe_key`, `locked_until`, `attempt_count`, and `unique (business_id, dedupe_key)`. |
| `claim_queued_notification_events` | `0030` | Claim RPC. **Already gates on `scheduled_for is null or scheduled_for <= now()`**, so the queue is itself a scheduler. |
| `queueCustomerNotification` | `lib/notifications/service.ts` | Enqueue path enforcing per-business channel settings, per-customer suppression, locale, payload allowlist and dedupe. |
| `authorizeEventForDispatch` | `lib/validation/notifications.js` | Dispatch-time re-authorization; requires a `TEMPLATE_SOURCES` entry to prove resource ownership. |
| `business_notification_settings` | `0030` | Per-business `email_enabled`, `sms_enabled`, `live_send_enabled`, `allowed_templates`, `quiet_hours`. |
| `appointments` | `0034` | Statuses `requested`, `confirmed`, `declined`, `cancelled`, `completed`, `no_show`. |
| `/api/notifications/dispatch` | route handler | Secret-gated, feature-flagged, constant-time compared. **No automated trigger exists.** |
| Tenant FK scoping helpers | `0035` | `customer_in_business`, `vehicle_in_business`, `vehicle_in_customer`, etc. New tables must follow this pattern. |

**Critical inherited constraint:** there is no `vercel.json` anywhere in the repository, so
no cron exists. Queued transactional notifications (quote sent, job status, invoice issued)
only send if something external POSTs the dispatch route. Reminders are worthless without a
trigger, so fixing this is in scope.

## 4. Data model

### 4.1 `vehicle_odometer_readings` (new, append-only)

History is preserved. A mileage update **never** overwrites a previous reading.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `business_id` | uuid not null → `businesses` cascade | tenancy |
| `vehicle_id` | uuid not null → `vehicles` cascade | |
| `mileage` | integer not null | check `>= 0 and <= 3000000` |
| `unit` | text not null default `'km'` | check `unit = 'km'`. Revora is UAE-only; the column documents the assumption so adding a unit later is a widening change, not a rewrite. |
| `source` | text not null | check in `appointment_check_in`, `vehicle_diagnosis`, `portal_health_check`, `staff_manual`, `symptom_report_backfill` |
| `source_appointment_id` | uuid → `appointments` set null | provenance |
| `source_symptom_report_id` | uuid → `vehicle_symptom_reports` set null | provenance |
| `quality` | text not null default `'valid'` | check in `valid`, `suspicious`, `unusable` (§5) |
| `quality_reason` | text | stable code, not prose |
| `recorded_at` | timestamptz not null default now() | when the odometer was **observed** |
| `recorded_by` | uuid → `profiles` set null | actor |
| `created_at` | timestamptz not null default now() | when the row was written |

**Idempotency.** Partial unique indexes guarantee one reading per source record, so a
double-submitting form or a retried action cannot double-insert the same observation:

- `unique (source_appointment_id) where source_appointment_id is not null`
- `unique (source_symptom_report_id) where source_symptom_report_id is not null`

**Indexes.** `(vehicle_id, recorded_at desc)` is the hot path (latest readings for one
vehicle); `(business_id)` for tenant scans.

**Deliberately not enforced:** monotonically increasing mileage. Odometer replacement and
correction of a mistyped reading are legitimate, and a database-level monotonic constraint
would reject them. Decreasing readings are recorded and *classified* instead (§5).

### 4.2 `business_maintenance_settings` (new)

Mirrors the shape of `business_notification_settings`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `business_id` | uuid not null unique → `businesses` cascade | |
| `reminders_enabled` | boolean not null default **false** | opt-in; no tenant starts sending silently |
| `first_reminder_days` | integer not null default 14 | check `> second_reminder_days` |
| `second_reminder_days` | integer not null default 3 | check `> 0` |
| `assumed_annual_km` | integer **nullable** | check null or between 1000 and 100000. **NULL means no fallback** (§6 Case B). |
| `created_by` / `updated_by` | uuid → `profiles` set null | |
| `created_at` / `updated_at` | timestamptz not null default now() | |

`assumed_annual_km` is nullable *by design*. There is no global invented driving assumption:
a business that has not configured one gets date-only behaviour.

### 4.3 No reminder ledger table

Reminder state lives in `notification_events`. Its `unique (business_id, dedupe_key)` index
is the idempotency guarantee (§10), and the staff worklist reads reminder state by querying
those rows. Adding a parallel ledger would be a second source of truth for the same fact.

## 5. Odometer data quality

A reading is classified on write by a pure function, and the classification is stored so
history keeps its judgement:

| Classification | Condition | Effect on projection |
|---|---|---|
| `unusable` | non-integer, negative, or `> 3,000,000` km | rejected at validation; never written |
| `suspicious` | lower than the newest prior `valid` reading for the vehicle (`decreasing`) | **excluded** from rate derivation and from "latest position" |
| `suspicious` | implies `> 1,000 km/day` since the prior valid reading (`implausible_rate`) | excluded as above |
| `suspicious` | identical value to the prior valid reading taken `< 1` day earlier (`duplicate_observation`) | excluded; not an error, just uninformative |
| `valid` | everything else | usable |

Rationale for `suspicious` rather than rejection: an odometer replacement produces a
legitimately lower reading, and refusing to store it would lose the vehicle's history at
exactly the moment it changed. The projection engine simply refuses to treat a
known-suspicious reading as reliable input.

**Stale readings.** A `valid` reading older than **365 days** still describes a real
observation but no longer describes the vehicle's current position. It is excluded from
projection, which degrades that vehicle to date-only.

## 6. Mileage projection policy

Deterministic, explainable, and never claiming precision the data cannot support.

**Case A — no usable readings.** Date-only. No mileage progress is fabricated.

**Case B — exactly one usable reading.** A single reading gives *position*, not *rate*.
Project **only if** the business has configured `assumed_annual_km`; rate =
`assumed_annual_km / 365`. Where it is NULL: date-only. There is no global default.

**Case C — two or more usable readings.** Derive an observed rate from the most recent
**5** valid, non-stale readings:

- Require span between oldest and newest in the window ≥ **14 days** and ≥ **100 km**.
  Below either threshold the sample is too small to divide safely.
- `rate = (newestMileage − oldestMileage) / elapsedDays` across the window, rather than the
  single last interval, so one unusual trip does not dominate.
- Reject the result if `rate <= 0` or `rate > 1,000 km/day`; fall back to Case B, then to
  date-only.

**Projecting to a date.**
`remaining = next_service_mileage − latestValidReading.mileage`

- `remaining <= 0` → the threshold is already passed; due date is the latest reading's
  `recorded_at`, flagged overdue.
- Otherwise `projectedDate = latestValidReading.recorded_at + (remaining / rate) days`.
- If the projection lands more than **730 days** out, return *unavailable* rather than a
  number nobody should trust.

**Projection basis** is returned with the result so every consumer can be honest about
provenance: `date_only`, `mileage_observed`, `mileage_assumed`, `unavailable`.

**Language.** Customer- and staff-facing copy says *estimated*, *projected*, *based on
recorded mileage*. Never *guaranteed*, *required*, or *manufacturer-specified*.

## 7. Maintenance plan selection

`vehicle_maintenance_plans` is append-only; the applicable plan is the **newest row for the
vehicle by `created_at`**, matching the `latest_plan_id` semantics already used by the
vehicle-intelligence detail RPC in `0024`.

One helper, `resolveCurrentMaintenancePlan()`, is the single authority. The scanner and the
staff worklist both call it. Because reminder identity is plan-scoped (§10) and only the
current plan is ever evaluated, a superseded plan stops producing reminders the moment a
newer plan exists, and the newer plan begins its own reminder lifecycle.

## 8. Effective due-date evaluation

One domain function, `evaluateMaintenanceDueState()`, is the only place this logic lives.
The scanner, the staff worklist and the tests all call it. No business rules are recomputed
inside React components or route handlers.

Input: the current plan, the vehicle's usable readings, business maintenance settings,
relevant appointments, and `now`.

Output (derived, not persisted — V1 recomputes from authoritative inputs):

```
addressable            boolean
effectiveDueDate       ISO date | null    // min of available signals
calendarDueDate        ISO date | null    // next_service_date
projectedMileageDueDate ISO date | null
dueSource              'date' | 'mileage_observed' | 'mileage_assumed' | null
nextServiceMileage     integer | null
latestReading          { mileage, recordedAt } | null
drivingRatePerDay      number | null
projectionBasis        'date_only' | 'mileage_observed' | 'mileage_assumed' | 'unavailable'
status                 'overdue' | 'due_soon' | 'upcoming' | 'not_addressable'
stage                  'first' | 'second' | null
suppressedBy           'appointment' | null
suppressingAppointmentId uuid | null
```

`effectiveDueDate = min(calendarDueDate, projectedMileageDueDate)` when both exist, else
whichever exists. When neither can be established the plan is **not reminder-addressable**
and is skipped — not guessed at.

Derived values are deliberately not persisted. Plans, readings and appointments all change;
recomputing from authoritative inputs avoids a staleness class of bug, and the query volume
(§28) does not justify a cache in V1.

## 9. Reminder cadence

Two stages, business-configurable, conservative defaults:

- **first** — `first_reminder_days` (default **14**) before the effective due date.
- **second** — `second_reminder_days` (default **3**) before it.

Constants live in `business_maintenance_settings`, not as scattered literals.

The daily scanner evaluates **eligibility today**; it does not pre-populate future queue
rows. Maintenance plans, mileage projections and appointments all change, and a queue
stuffed with months of future reminders would deliver stale ones. A row is queued only when
its stage is due now.

A stage is eligible when `now` is within the stage window and the *later* stage has not
already been passed — so a plan first seen 2 days before its due date correctly gets the
`second` reminder only, not a burst of both.

## 10. Deduplication

Identity is **stable reminder semantics**, never a volatile projected date:

```
dedupe_key = maintenance_reminder:<maintenance_plan_id>:<stage>
```

`queueCustomerNotification` appends `:<channel>`, and `notification_events` carries
`unique (business_id, dedupe_key)` with the enqueue performed as an upsert with
`ignoreDuplicates`. Therefore:

- Running the scan twice, concurrently, or after an infrastructure retry cannot send a
  stage twice.
- A projection that moves by a few days does **not** mint a new identity, so a drifting
  mileage estimate cannot re-notify.
- A new maintenance plan has a new `plan_id` and therefore legitimately gets its own
  reminder lifecycle.

The unique index is the correctness guarantee. It does not depend on the scheduler never
firing twice (§14).

## 11. Appointment suppression

Checked at send-eligibility time, not at queue-drain time.

- **Suppressing statuses:** `requested`, `confirmed`. A pending request means the customer
  is already engaging.
- **Non-suppressing:** `declined`, `cancelled`, `completed`, `no_show`. A cancelled visit
  from last month must not silence a future reminder.
- **Horizon:** the appointment's `confirmed_start` (or `requested_start` when unconfirmed)
  must fall between `now` and `effectiveDueDate + 14 days`. A vehicle is not silenced
  forever merely because an appointment record exists somewhere in its history.

Because eligibility is evaluated per run, a customer who books after reminder one correctly
suppresses reminder two.

## 12. Customer notification delivery

Reuses the existing path end to end. Two new templates are registered in
`NOTIFICATION_TEMPLATE_KEYS` with `en` and `ar` copy:

- `maintenance_reminder_upcoming` (first stage)
- `maintenance_reminder_due` (second stage)

Each gets a `TEMPLATE_SOURCES` entry — `{ table: "vehicles", payloadKey: "vehicle_id" }` —
and `vehicle_id` plus `maintenance_plan_id` are added to `persistablePayloadSchema`, so the
templates are covered by the ownership check rather than silently exempt from it. The
`notification-source-coverage` suite enforces this for every template.

**Copy constraints.** The underlying `next_service_date` / `next_service_mileage` are
AI-generated (§21). Copy therefore must not assert a manufacturer requirement, a regulatory
obligation, a guaranteed failure, or a precise mileage prediction. Approved shape:

> Your {{vehicleLabel}} is estimated to be due for a service around {{dueDateLabel}}, based
> on the information {{businessName}} has on record. Book a visit in your Revora portal.

Per-business channel settings, per-customer suppression, locale resolution, dedupe, retry,
locking and poison-row handling are inherited unchanged.

## 13. Daily reminder scanner

`POST|GET /api/maintenance/reminders/scan`.

1. Select businesses with `reminders_enabled = true`.
2. For each, load candidate vehicles and resolve the current plan per vehicle.
3. Evaluate due state via the shared evaluator.
4. Apply appointment suppression.
5. Determine the eligible stage.
6. Enqueue through `queueCustomerNotification` (which applies preferences and dedupe).
7. Record counts.

**Isolation.** One malformed vehicle or plan is caught per row; the scan continues and the
error is counted.

**Bounded work.** Processing is capped per run (`MAINTENANCE_SCAN_MAX_PLANS`, default 500)
with deterministic ordering. No unbounded full-table sweep.

**Privilege.** The scanner runs with no user session, so it uses the service-role client.
That is a deliberate trust boundary: the route is secret-gated (§16), it reads only
maintenance-relevant columns, and it writes only through `queueCustomerNotification`, which
performs its own verification. It does not expose a general privileged query surface.

## 14. Scanner concurrency

Correctness under duplicate execution rests on the dedupe unique index (§10), not on the
scheduler behaving. Two simultaneous scans race to insert the same
`(business_id, dedupe_key)`; one wins, the other is ignored by `ignoreDuplicates`. Neither
sends twice. Duplicate execution is therefore wasteful but never incorrect.

## 15. Dispatch triggering

Two independent schedules, because they need different cadences:

| Job | Path | Schedule | Why |
|---|---|---|---|
| Reminder scan | `/api/maintenance/reminders/scan` | daily, `0 4 * * *` UTC = 08:00 Asia/Dubai | due-ness changes at most once per day; runs as the workshop day starts |
| Notification dispatch | `/api/notifications/dispatch` | `*/10 * * * *` | transactional messages (quote sent, invoice issued) must not wait a day |

**Verified constraint:** Vercel Cron invokes endpoints with **GET**, authenticated by
`Authorization: Bearer $CRON_SECRET`. Both existing routes are POST-only behind a custom
header. Both therefore gain a `GET` handler accepting the Vercel bearer convention, while
retaining the existing POST + custom-header path for manual/an external trigger.

**Plan limitation, reported not assumed:** Vercel's Hobby tier permits only daily cron
invocations. If the project is on Hobby, the `*/10` dispatch schedule will not run at that
frequency and either the plan must be upgraded or an external pinger (e.g. a scheduled
GitHub Action) must call the dispatch route. The configuration is written correctly either
way; activation status is reported honestly rather than assumed.

## 16. Cron authentication

- Shared secrets compared with `crypto.timingSafeEqual` after a length check, matching
  `verifyStripeWebhookSignature` and the dispatch route.
- Missing or wrong secret → `403`, no detail.
- Secrets are never logged, never echoed, never committed. Only variable *names* appear in
  docs.
- Both endpoints remain behind explicit feature flags, so an unconfigured deployment is
  inert rather than half-live.
- Required variables: `CRON_SECRET`, `MAINTENANCE_REMINDERS_ENABLED`,
  `NOTIFICATIONS_DISPATCH_ENABLED`, `NOTIFICATIONS_DISPATCH_SECRET`.

## 17. Timezone

Verified: `timezone` exists on **`profiles`** (default `Asia/Dubai`); `businesses` has no
timezone column; and `lib/formatters.ts` hardcodes `Asia/Dubai` for every rendered date.

The project's established policy is therefore **app-wide `Asia/Dubai`**, and due-date
boundaries use it. A "day" is a Dubai calendar day, so a reminder cannot drift onto the
wrong date because the server happens to run in UTC. UAE observes no DST, so the offset is
a constant `+04:00`.

**Documented limitation:** a tenant operating outside the UAE would need a business-level
timezone column. That is a deliberate V1 non-goal, not an oversight.

## 18. Staff maintenance worklist

`/[locale]/(dashboard)/maintenance` — an authenticated staff page listing vehicles falling
due, ordered by effective due date.

- Uses **the same evaluator** as the scanner. No business logic is reimplemented in the
  component.
- Columns: customer, vehicle, effective due date, due reason (date vs projected), next
  service date, next service mileage, latest recorded mileage, projection basis,
  upcoming/overdue status, related appointment, reminder state.
- Server-side authorization plus RLS; only the caller's own business is visible.
- Loading, empty and error states follow existing page conventions.
- Projection basis is shown as a plain label (*estimated from recorded mileage*), not as
  raw confidence/debug internals.

## 19. Appointment check-in mileage capture

The approved capture point. `appointments` has no dedicated check-in state, so rather than
invent a subsystem, the odometer is captured on the staff appointment detail page as a
recorded reading against the appointment, available while the appointment is `confirmed`.

Writing a reading **creates a row**; it never overwrites history. `source =
'appointment_check_in'` with `source_appointment_id` set, which the partial unique index
uses to make repeated submits idempotent.

## 20. Existing AI mileage inputs

The staff `ai/vehicle-diagnosis` and portal `ai/health-check` forms already collect a
current odometer value that lands on `vehicle_symptom_reports.mileage`. Where that value is
present, the same shared service records a provenance-linked odometer reading
(`source = 'vehicle_diagnosis'` or `'portal_health_check'`, `source_symptom_report_id` set).

Capture goes through **one** service function, and the partial unique index on
`source_symptom_report_id` prevents a double insert when multiple layers handle the same
submission.

**Historical backfill is deliberately excluded from V1.** Existing
`vehicle_symptom_reports.mileage` rows are not converted. Their provenance is weaker (a
free-text field with no classification history), and silently promoting them to
high-confidence odometer readings would give projections a false foundation. If backfilled
later it must be labelled `symptom_report_backfill`, which is why that source value exists
in the check constraint now.

## 21. AI-generated maintenance plan safety

`next_service_date` and `next_service_mileage` originate from an AI-generated plan, not from
a manufacturer schedule or verified service history. Therefore:

- Copy describes a *maintenance estimate* or *suggested service timing*, "based on the
  available vehicle information".
- No claim of manufacturer requirement, regulatory obligation, warranty consequence, or
  guaranteed failure.
- Reminders are advisory. They never assert a safety-critical condition.
- Existing safety-triage behaviour (`vehicle_safety_critical`, stop-driving overrides) is
  untouched and must not be weakened; a maintenance reminder is a different, lower-urgency
  class of message and must not dilute it.

## 22. Tenancy, RLS and authorization

Both new tables get the full treatment, following `0035`:

- `business_id` on every row; FKs scoped with the existing helpers
  (`vehicle_in_business`, `appointment_in_business` equivalent) so a row cannot reference
  another tenant's vehicle or appointment.
- RLS enabled. Staff manage within their business (`business_owner`, `manager`, `employee`
  for readings; `business_owner`, `manager` for settings). Customers may read odometer
  readings for their own vehicles only.
- Service-role access used solely by the scanner, documented in §13.
- Cross-tenant reads and writes asserted in tests (§26): a user of Business A must not read
  or write Business B odometer or reminder data.

## 23. Migration

`0036_maintenance_reminder_intelligence.sql`. The number is chosen from verified evidence:
`origin/main` tops out at `0030`; `0031`–`0033` are claimed by the unmerged
`security/appsec-10-auth-hardening` branch; `0034` and `0035` are this line of work. `0036`
is the first free number.

Properties: forward-safe, deterministic, additive only (no destructive DDL on existing
tables), `if not exists` guards per repository convention, indexes created with the tables,
and no long-running lock on a large existing table (both tables are new).

## 24. Observability

The scan returns and logs a structured summary answering: did it run, businesses scanned,
plans evaluated, reminders queued, suppressed by appointment, suppressed by customer
preference, skipped as not addressable, and errors encountered.

No PII in logs — counts and stable codes only, matching the existing convention of logging
`console.error("...failed", code)` rather than payloads. Customer names, emails, phone
numbers, plate numbers and VINs never appear.

## 25. Security and privacy summary

- No new delivery engine, so no second path around the reviewed authorization surface.
- New templates are covered by `TEMPLATE_SOURCES`, closing the exemption class fixed in the
  preceding commit.
- Odometer readings are vehicle telemetry: tenant-scoped, RLS-enforced, never logged.
- Cron endpoints are secret-gated, flag-gated, constant-time compared.
- Reminder content carries no financial or diagnostic detail — a vehicle label and an
  estimated date only — so a misdirected message leaks the minimum possible.

## 26. Rollout and backward compatibility

- Purely additive schema. No existing table is altered destructively; no existing behaviour
  changes.
- `reminders_enabled` defaults to **false**: no tenant sends anything until deliberately
  enabled.
- `MAINTENANCE_REMINDERS_ENABLED` gates the scanner globally.
- With the feature off, the system behaves exactly as before this change.
- Reverting means disabling the flag; the tables are inert without the scanner.

## 27. Testing

Pure domain logic (classification, rate derivation, projection, due-state, stage selection,
suppression, dedupe key construction) is implemented as **pure functions in `.js`** so it is
directly unit-testable under `node --test`, matching the repository's existing convention
(`lib/ratings.js`, `lib/validation/*.js`). Full matrix in the implementation plan; it covers
odometer validity and provenance, all four projection cases, date-vs-mileage precedence,
stage eligibility, dedupe under repeat/concurrent/retry, appointment suppression including
the cancelled-appointment case, plan supersession, template payload/locale/dedupe,
cron auth, and staff-page authorization including cross-tenant refusal.

Existing notification, appointment, invoice and portal suites must continue to pass
unchanged — the feature adds paths, it does not modify existing ones.

## 28. Performance

- Readings are fetched **bounded**: the most recent 5 valid rows per vehicle via the
  `(vehicle_id, recorded_at desc)` index, never the vehicle's whole history.
- Plans, readings and appointments are loaded in **batched queries keyed by vehicle id**,
  not one query per vehicle — no N+1.
- The scan is capped per run with deterministic ordering.
- No materialized analytics layer in V1; there is no evidence yet of a volume that needs one.

## 29. Recovery

- The migration is additive and reversible by dropping the two new tables.
- A bad projection cannot corrupt data: projections are computed, never persisted.
- A wrongly-queued reminder can be stopped by disabling `reminders_enabled` for the business
  or the global flag; unsent rows remain `queued` and are never sent once the dispatcher is
  off.
- Because reminder identity is plan-scoped, deleting a queued row lets the next scan requeue
  it; deliberate permanent suppression is done by disabling reminders, not by row surgery.

## 30. Known limitations (stated, not hidden)

1. **Mileage reminders will be a minority for some time.** Capture is at appointment
   check-in only, so a vehicle needs two appointments before an observed rate exists, and
   walk-ins are never read.
2. **Projection is an estimate.** It depends on available readings and configuration, and is
   presented as such everywhere.
3. **Single timezone.** Asia/Dubai app-wide.
4. **No historical backfill**, by choice (§20).
5. **Dispatch cadence depends on the deployment plan** (§15).
