# Authenticated Browser QA Checklist

## Purpose

This checklist covers authenticated production and preview QA for Revora. It is intended for operator-led QA where credentials are handled only by the user or authorized tester, never by an agent.

For migration-backed features, this authenticated QA is **required and not optional**: HTTP smoke/curl redirects unauthenticated requests before they reach the migrated tables, so it cannot detect `PGRST205`, RLS failures, or broken reads/writes. Confirm the PostgREST schema cache was reloaded after the migration first — see [DB Migration Release SOP](./DB_MIGRATION_RELEASE_SOP.md) → "PostgREST Schema Cache Reload".

## Required Sessions

- Owner or staff session with access to a test business.
- Linked customer portal session for that same business.
- Optional second linked customer for RLS isolation testing.

Preview domains may require separate login because cookies, callback URLs, and session state can be domain-specific.

Agents must not handle passwords, service-role keys, magic link inboxes, or private customer credentials.

## Status Definitions

| Status | Meaning |
| --- | --- |
| PASS | Expected behavior verified in browser. |
| FAIL | Expected behavior is broken or unsafe. |
| BLOCKED | QA could not proceed because access, environment, data, or tooling is unavailable. |
| PARTIAL | Some expected behavior verified, but coverage is incomplete. |

## Production QA Sections

### Quote Approval And Decline EN/AR

- Open an EN quote approval route as the linked customer.
- Confirm quote details, line items, totals, AED formatting, and customer-safe labels.
- Approve the quote and confirm success state.
- Repeat decline flow if a draft/test quote is available.
- Repeat core display in AR and confirm RTL layout and Arabic strings.
- Confirm no duplicate locale path appears after action redirects.

### Duplicate Locale Path Guard

- Navigate between EN and AR dashboard routes.
- Navigate between EN and AR portal routes.
- Confirm URLs do not stack locale prefixes.
- Confirm `/login`, `/signup`, and `/` redirect to canonical locale-prefixed routes.

### Retainer Calculator EN/AR

- Load the calculator in EN.
- Confirm select trigger labels are visible and not placeholder-only after selection.
- Confirm billing quote units display correctly.
- Repeat in AR and confirm RTL layout.

### Analytics EN/AR

- Open dashboard analytics in EN and AR.
- Confirm table labels, empty states, and metric cards do not show raw keys.
- Confirm charts or summaries render without crashing.

### Billing EN/AR

- Open billing as business owner.
- Confirm plan, invoice, and portal action labels.
- Confirm non-owner access is restricted where applicable.
- Confirm Stripe portal action does not expose secrets.

### Complaints EN/AR

- As customer, submit a complaint through the portal.
- As owner/staff, open complaint queue.
- Confirm status, severity, customer identity, and assignment controls.
- Add a staff reply and confirm customer-visible thread behavior.
- Update status/priority where supported.
- Repeat key list/detail displays in AR.

### Notifications

- Open notifications panel.
- Confirm quote, complaint, job, and billing notifications link to canonical locale routes.
- Confirm no stale unprefixed dashboard links are shown.

### Vehicle Intelligence No UUID Labels

- Open Vehicle Intelligence dashboard and portal surfaces.
- Confirm customer, vehicle, job, quote, and scan labels are human-readable.
- Confirm raw UUIDs are not used as primary labels unless intentionally diagnostic.

### Stripe Webhook Unsigned 400

- Send an unsigned request to `/api/stripe/webhook`.
- Expected result: `400`.
- Confirm the request is not redirected to login, onboarding, dashboard, or locale routes.

## Launch Ops Preview QA Sections

Launch Ops QA is preview-only until the Launch Ops branch is merged.

### Owner Feedback Page

- Owner can open feedback page.
- Feedback list loads for the current tenant only.
- Empty state is clear.

### Customer Portal Feedback

- Linked customer can open feedback route from portal.
- Customer sees only their own linked tenant/customer context.
- No dashboard controls are visible to customer.

### Feedback Validation

- Required fields block submission when missing.
- Invalid status/priority/category values are rejected.
- Validation messages are visible and localized where applicable.

### Feedback Submit

- Customer can submit valid feedback.
- Owner can see the submitted record.
- Submission does not expose another tenant's data.

### Owner Inbox

- Owner inbox shows tenant feedback.
- Filtering/sorting does not leak other tenants.
- Empty and loading states are correct.

### Status/Priority Update

- Owner/staff can update allowed status and priority fields.
- Customer cannot update owner-only fields.
- Updated values persist after refresh.

### Implementation Center

- Owner can open implementation center.
- Tasks/statuses load for the current tenant only.
- Progress indicators match underlying records.

### Notes Save

- Owner/staff can save implementation notes.
- Notes persist after refresh.
- Customer cannot access internal implementation notes.

### Import Templates

- Owner can access import template guidance.
- Template download links or instructions are present.
- No import is committed until preview/validation is confirmed.

### RLS Checks

- Tenant A owner cannot see Tenant B feedback.
- Customer A cannot see Customer B feedback.
- Signed-out user cannot access Launch Ops preview pages.

## Manual Result Table

| Area | Route | Role | Expected | Actual | Status | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quote approval EN | `/en/portal/quotes/[id]` | Customer | Quote can be reviewed and approved/declined. |  |  |  |  |
| Quote approval AR | `/ar/portal/quotes/[id]` | Customer | RTL quote review renders correctly. |  |  |  |  |
| Retainer EN | `/en/tools/retainer-calculator` | Public/Owner | Select labels and billing units display correctly. |  |  |  |  |
| Retainer AR | `/ar/tools/retainer-calculator` | Public/Owner | RTL labels and billing units display correctly. |  |  |  |  |
| Analytics EN | `/en/analytics` | Owner/Staff | Metrics render without raw keys. |  |  |  |  |
| Analytics AR | `/ar/analytics` | Owner/Staff | RTL analytics render without raw keys. |  |  |  |  |
| Billing EN | `/en/billing` | Owner | Billing state and actions are visible. |  |  |  |  |
| Billing AR | `/ar/billing` | Owner | RTL billing state and actions are visible. |  |  |  |  |
| Complaints EN | `/en/complaints` | Owner/Staff | Complaint queue and detail flow work. |  |  |  |  |
| Complaints AR | `/ar/complaints` | Owner/Staff | RTL complaint queue and detail flow work. |  |  |  |  |
| Portal complaints | `/en/portal/complaints` | Customer | Customer can submit and track complaints. |  |  |  |  |
| Notifications | `/en/notifications` | Owner/Staff | Links route to canonical locale paths. |  |  |  |  |
| Vehicle Intelligence | `/en/ai/vehicle-diagnosis` | Owner/Staff | No raw UUID primary labels. |  |  |  |  |
| Stripe webhook | `/api/stripe/webhook` | Signed out | Unsigned request returns 400. |  |  |  |  |
| Launch Ops feedback | Preview route | Owner/Customer | Feedback access is role-appropriate. |  |  |  |  |
| Launch Ops RLS | Preview route | Multi-user | Cross-tenant/customer data is blocked. |  |  |  |  |
