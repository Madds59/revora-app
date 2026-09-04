# Maintenance Reminders — Operations

How the maintenance reminder feature works, what it needs configured, and what
it deliberately does not promise.

Design: `docs/superpowers/specs/2026-09-04-maintenance-reminder-intelligence-v1-design.md`

---

## What it does

Once a day it looks at every vehicle that has a maintenance plan, works out when
that vehicle is next estimated to be due for a service, and queues a customer
reminder at two points before that date. Staff see the same list in the app.

```
odometer readings ─┐
                   ├─> due-date evaluator ─> daily scanner ─> notification queue ─> dispatcher
maintenance plan ──┘                              │
                                                  └─ suppressed if already booked
```

## The odometer

`vehicle_odometer_readings` is **append-only**. Recording a mileage never
overwrites a previous reading; it adds one, with its source and its quality
verdict.

**Sources.** `appointment_check_in`, `vehicle_diagnosis`, `portal_health_check`,
`staff_manual`, `symptom_report_backfill`. Each reading may cite the appointment
or symptom report it came from, and a unique index on those columns means the
same physical observation cannot be recorded twice by a double-submitted form or
a retried action.

**Quality.** Every reading is classified on write:

| Verdict | When | Effect |
|---|---|---|
| `valid` | normal forward reading | used for projection |
| `suspicious` | lower than the last valid reading (`decreasing`) | recorded, excluded from projection |
| `suspicious` | implies over 1,000 km/day (`implausible_rate`) | recorded, excluded |
| `suspicious` | same value within a day (`duplicate_observation`) | recorded, excluded |
| `unusable` | not an integer, negative, or over 3,000,000 km | rejected before write |

Mileage is **not** constrained to increase. An odometer replacement and the
correction of a mistyped reading both legitimately produce a lower number, and
refusing them would erase the vehicle's history at the moment it changed.

## How the due date is worked out

A maintenance plan may carry a service date, a service mileage, both, or
neither. Mileage is projected onto a date so everything downstream runs on one
axis, and the effective due date is the earliest trustworthy signal.

| Readings available | Behaviour | Basis reported |
|---|---|---|
| none | date only | `date_only` |
| one, business has no configured rate | date only | `date_only` |
| one, business has `assumed_annual_km` | projected from that rate | `mileage_assumed` |
| two or more usable | projected from observed driving | `mileage_observed` |
| neither date nor projectable mileage | not reminded at all | — |

Observed driving beats a configured assumption when both are available.

**Bounds.** A rate needs at least 14 days and 100 km between the oldest and
newest reading in a five-reading window. Readings older than 365 days are
ignored. A projection landing more than 730 days out is reported unavailable
rather than guessed.

> **Mileage projection is an estimate.** It depends entirely on which readings
> exist and on the configured driving rate. It is presented as an estimate
> everywhere it appears and must not be described to customers as a
> manufacturer-specified service interval.

## Cadence and suppression

Two stages, configured per business, defaulting to **14 days** and **3 days**
before the effective due date. There is no third or overdue campaign.

A reminder is suppressed when the vehicle already has a `requested` or
`confirmed` appointment between now and 14 days past the due date. Cancelled,
declined, completed and no-show appointments do **not** suppress — a cancelled
visit last month must not silence a future reminder.

Reminder identity is `maintenance_reminder:<plan_id>:<stage>`, deliberately not
the projected date, so a drifting estimate cannot re-notify. The unique index on
`(business_id, dedupe_key)` means a repeated, retried or concurrent scan is a
no-op. A new maintenance plan supersedes the old one and starts its own
reminder lifecycle.

## Configuration

### Per business — `business_maintenance_settings`

| Column | Default | Meaning |
|---|---|---|
| `reminders_enabled` | `false` | **Nothing is sent until this is true.** |
| `first_reminder_days` | 14 | first stage lead time |
| `second_reminder_days` | 3 | second stage lead time |
| `assumed_annual_km` | `NULL` | driving assumption used when a vehicle has only one reading. `NULL` means date-only; there is no global default. |

### Environment variables

| Variable | Purpose |
|---|---|
| `MAINTENANCE_REMINDERS_ENABLED` | must be `"true"` or the scan route is inert |
| `MAINTENANCE_SCAN_SECRET` | shared secret for a manual/external scan trigger |
| `MAINTENANCE_SCAN_MAX_PLANS` | optional, default 500, cap per run |
| `NOTIFICATIONS_DISPATCH_ENABLED` | must be `"true"` or nothing is delivered |
| `NOTIFICATIONS_DISPATCH_SECRET` | shared secret for a manual dispatch trigger |
| `CRON_SECRET` | Vercel Cron's bearer secret, used by both scheduled routes |

Secrets are compared in constant time and are never logged or echoed. None are
committed; only their names appear here.

## Scheduling

`apps/web/vercel.json`:

| Job | Path | Schedule |
|---|---|---|
| reminder scan | `/api/maintenance/reminders/scan` | `0 4 * * *` UTC (08:00 Asia/Dubai) |
| notification dispatch | `/api/notifications/dispatch` | `*/10 * * * *` |

Vercel Cron calls endpoints with **GET** and `Authorization: Bearer $CRON_SECRET`.
Both routes also still accept **POST** with their own header, for manual runs or
an external scheduler.

> **Known deployment constraint.** Vercel's Hobby tier only runs cron jobs once
> per day. On Hobby the ten-minute dispatch schedule will not run at that
> frequency, and either the plan must be upgraded or an external caller (for
> example a scheduled GitHub Action posting to the dispatch route with
> `NOTIFICATIONS_DISPATCH_SECRET`) must drive it. The configuration in the repo
> is correct either way; confirm the plan before assuming reminders are live.

Manual run:

```bash
curl -X POST "$APP_URL/api/maintenance/reminders/scan" -H "x-maintenance-scan-secret: $MAINTENANCE_SCAN_SECRET"
```

## Timezone

Dates are evaluated in **Asia/Dubai**, matching `lib/formatters.ts`, which
renders every date in the app that way. UAE observes no DST. A tenant operating
outside the UAE would need a business-level timezone column; that does not exist
and is a known V1 limitation.

## Staff worklist

`/maintenance` lists vehicles estimated to be due, soonest first, for
owner/manager/employee roles. It uses the same evaluator as the scanner, so it
cannot disagree with what customers were sent. Rows already booked are marked
rather than hidden.

## Observability

The scan returns and logs counts only — businesses scanned, vehicles considered,
plans evaluated, reminders queued, suppressed by appointment, suppressed by
preference, not addressable, errors. No customer names, plates, addresses or ids
are logged.

## Known limitations

1. **Mileage reminders will be a minority for a while.** Capture is at
   appointment check-in, so a vehicle needs two appointments before an observed
   rate exists, and walk-ins are never read.
2. **Projection is an estimate**, dependent on available readings and
   configuration.
3. **Single timezone** (Asia/Dubai).
4. **No historical backfill.** Existing `vehicle_symptom_reports.mileage` values
   are not converted into odometer readings; their provenance is weaker, and
   promoting them silently would give projections a false foundation.
5. **Dispatch cadence depends on the deployment plan** (see above).
6. **Staff receive no email digest** in V1 — the worklist is in-app only.
