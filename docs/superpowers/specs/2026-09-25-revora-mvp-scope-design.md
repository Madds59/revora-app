# Revora MVP Scope V1 — Phase 1 Feature Gating, Navigation Hierarchy, Purpose-Led Dashboard

**Date:** 2026-09-25
**Status:** Approved design, awaiting implementation plan
**App root:** `apps/web` (Next.js 15.5 App Router, React 19, Supabase, next-intl en/ar)

## 1. Problem

Revora is feature-complete across a very wide surface. An audit of
`apps/web/src/app/[locale]` on 2026-09-25 found **80 page routes, zero
`ComingSoon` stubs, zero `TODO`/`FIXME` markers and zero mock data**. Nothing is
half-built.

The problem is not completeness. It is that the product never decided what it is
*about*, and the UI reflects that:

| Concern | Today |
|---|---|
| Business sidebar | `dashboard-nav.tsx` renders a **flat, ungrouped list of 20 links**. Vehicle Intelligence, Notifications and Settings carry identical visual weight. |
| Customer portal sidebar | `portal-nav.tsx` renders a **flat list of 12 links**. |
| Dashboard home | Five undifferentiated count cards (customers, vehicles, pending quotes, open complaints, active jobs) plus a Get Started card pointing at *Add customer / Manage vehicles / Business settings*. |
| Stated differentiator | Digital Vehicle Inspection — **absent from the first screen a garage owner sees.** |
| Feature gating | One ad-hoc boolean prop, `showRetainerCalculator`, threaded into `DashboardNav` from the dashboard layout. No general mechanism. |

The workflow that makes Revora distinct is already written down — as a code
comment in `dashboard-nav.tsx:60`:

> `// inspect -> quote the findings -> approve -> job.`

That loop is documented in a navigation file and surfaced nowhere a user can
see it.

**Phase 1 target:** a pilot of up to **10 real garages running real jobs**. Not a
demo, not open signups. Every visible feature must hold up on a Tuesday morning
with a customer waiting at the counter, and every feature that is visible is one
more thing to support across ten live sites.

## 2. Goals

1. Reduce the phase 1 surface to the operational spine plus two chosen
   differentiators, **without deleting any code, route, component or migration**.
2. Give both sidebars a hierarchy, so 14 and 10 surviving links read as four
   scannable sections rather than a wall.
3. Make the dashboard home state the product thesis: the
   inspect → quote → approve → job pipeline, with live, actionable counts.
4. Make every hidden module re-enableable by flipping one flag — no code
   archaeology in phase 2.
5. Keep feature gating and role permission as **two independent axes**.

## 3. Non-goals

- Deleting or archiving any code. Nothing is removed; modules are hidden.
- Per-tenant feature flags. A DB column and migration are not justified for ten
  garages on a single build. Revisit if phase 2 needs per-garage packaging.
- Changing the root-admin shell (`admin-nav.tsx`). Admin is out of scope entirely.
- Touching auth, RLS, middleware, `/api/stripe/webhook`, or any applied migration.
- Any redesign of the modules that survive the cut. Their internals are unchanged.
- Fixing `lib/auth.ts`'s use of the non-locale-aware `redirect` (see §8).

## 4. Design

### 4.1 Feature flags — `src/lib/features/` (pure logic in `.js`, types in `.ts`)

A registry of **optional modules only**, not of every nav item. Anything absent
from the map is always enabled, which keeps the map small and the diff honest.

The project's convention for unit-testable logic is plain JavaScript with JSDoc
types, with the types in a sibling `.ts` file — see `src/lib/retainer/*.js`
against `src/lib/retainer/types.ts`, and `src/lib/form-draft.js`, whose header
comment states the reason outright: the impure parts live elsewhere "so this
file stays unit-testable with `node --test`". This feature follows that shape:

```
src/lib/features/
  types.ts   FeatureKey, FeatureFlags            (types only)
  flags.js   defaults + pure resolution helpers  (imported directly by tests)
  guard.ts   requireFeature                      (server-only, §4.2)
```

`types.ts`:

```ts
export type FeatureKey =
  | "vehicleIntelligence"
  | "retainerCalculator"
  | "membershipBundles"
  | "analytics"
  | "maintenance"
  | "feedback";

export type FeatureFlags = Record<FeatureKey, boolean>;
```

`flags.js` — pure, no `process.env` read of its own:

```js
/** @typedef {import("./types").FeatureKey} FeatureKey */
/** @typedef {import("./types").FeatureFlags} FeatureFlags */

/** @type {FeatureFlags} */
export const PHASE_1_DEFAULTS = {
  vehicleIntelligence: false,
  retainerCalculator: false,
  membershipBundles: false,
  analytics: false,
  maintenance: false,
  feedback: false,
};

/** @param {string | undefined} raw @returns {FeatureKey[]} */
export function parseFeatureOverrides(raw) { /* ... */ }

/** @param {string | undefined} raw @returns {FeatureFlags} */
export function resolveFeatures(raw) { /* ... */ }
```

**Environment override.** `NEXT_PUBLIC_REVORA_FEATURES` is a comma-separated
list of keys to force **on**, additive over the defaults. Unknown or malformed
entries are ignored rather than throwing — a typo in an env var must never take
the app down. `NEXT_PUBLIC_` is required because the nav components are client
components.

```
NEXT_PUBLIC_REVORA_FEATURES="vehicleIntelligence,analytics"
```

This lets an investor demo light up the AI modules without a branch, a code
change or a separate build.

**The raw string is passed in, never read inside `flags.js`.** Next.js inlines
`NEXT_PUBLIC_*` values at build time only through a *static*
`process.env.NEXT_PUBLIC_REVORA_FEATURES` reference, and a pure function that
takes the string as an argument stays testable without stubbing the
environment. A one-line call site in each consumer supplies it:

```js
resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES)
```

`flags.js` has no Supabase, `next/headers` or React imports, so it is
importable from server components, client components and `node --test` alike.

### 4.2 Route gate — `src/lib/features/guard.ts` (server-only)

A disabled module must not remain reachable by URL. A bookmarked
`/ai/vin-decoder` that still renders is a feature you are silently supporting;
one that 404s reads as broken software.

```ts
import "server-only";
export async function requireFeature(
  key: FeatureKey,
  surface: "dashboard" | "portal" = "dashboard",
): Promise<void>
```

Behaviour: if the feature is enabled, return. If not, redirect to
`/?disabled=<key>` (dashboard) or `/portal?disabled=<key>` (portal).

The redirect uses the **locale-aware `redirect` from `@/i18n/navigation`** with
the active locale from `getLocale()`, so an Arabic user lands on
`/ar?disabled=...` rather than losing their locale prefix.

Called immediately after the existing auth guard in each gated route, following
the established `requireMembership()` / `requireCustomerPortal()` idiom.

**The 13 gated route files:**

| Feature key | Routes |
|---|---|
| `vehicleIntelligence` | `(dashboard)/ai/page.tsx`, `ai/search`, `ai/vin-decoder`, `ai/dtc-decoder`, `ai/vehicle-diagnosis`, `(portal)/portal/ai/health-check` |
| `retainerCalculator` | `(dashboard)/tools/retainer-calculator` |
| `membershipBundles` | `(dashboard)/tools/membership-bundles`, `(portal)/portal/memberships` |
| `analytics` | `(dashboard)/analytics` |
| `maintenance` | `(dashboard)/maintenance` |
| `feedback` | `(dashboard)/feedback`, `(portal)/portal/feedback` |

**Landing notice.** The dashboard and portal home pages read the `disabled`
search param and, when present and a known `FeatureKey`, render the existing
`StatusBanner` component with `tone="muted"` and copy explaining the module is
not enabled for this workspace. Unknown values render nothing.

### 4.3 Navigation — `src/lib/nav/` (pure model) + existing `.tsx` (render)

The test runner is `node --test tests/*.test.mjs` — pure logic, no React
renderer. Navigation must therefore be **data** in a separate module to be
testable at all, and follows the same `.js` + `types.ts` split as §4.1:

```
src/lib/nav/
  types.ts   NavItem, NavGroup
  model.js   DASHBOARD_NAV, PORTAL_NAV, visibleGroups
```

`types.ts`:

```ts
export type NavGroup = {
  labelKey?: string;              // absent = ungrouped, rendered without a header
  items: NavItem[];
};
export type NavItem = {
  labelKey: string;
  href: string;
  icon: string;                   // lucide icon name; mapped to a component at render
  aliases?: string[];
  feature?: FeatureKey;           // absent = always available
  permission?: "pricingTools";    // absent = no role restriction
};

```

`model.js` holds the two group arrays and the pure filter:

```js
/**
 * @param {NavGroup[]} groups
 * @param {{ features: FeatureFlags, permissions: { pricingTools: boolean } }} opts
 * @returns {NavGroup[]}
 */
export function visibleGroups(groups, opts) { /* ... */ }
```

`visibleGroups` drops an item when its `feature` is disabled **or** its
`permission` predicate is false, then drops any group left empty. The two
predicates are independent and both must pass.

**This preserves the existing permission semantics.** `showRetainerCalculator`
is today computed as `canManagePricingTools(member.role) || superAdmin` in the
dashboard layout — that is a *role* gate, not a feature gate. Collapsing the two
would silently grant every manager the pricing tools the moment the flag is
turned back on in phase 2. The layout continues to compute the same boolean and
passes it as `permissions.pricingTools`.

**Business dashboard — 14 visible items in 4 sections:**

```
(no header)   Home · Inspections
WORK          Appointments · Jobs · Quotes · Invoices
RECORDS       Customers · Vehicles · Complaints · Documents
BUSINESS      Notifications · Implementation · Billing · Settings
```

Home and Inspections sit ungrouped at the top: the daily landing page and the
chosen differentiator, both above the fold on a phone.

**Customer portal — 10 visible items in 4 sections:**

```
(no header)   Home · Inspections
MY VEHICLES   Vehicles · Documents
SERVICE       Appointments · Quotes · Invoices · Jobs
SUPPORT       Complaints · Settings
```

Group headers render as a small uppercase muted label above their items, inside
the existing scroll container. `ResponsiveSidebarShell` takes `nav` as an opaque
`React.ReactNode`, so the desktop aside and the mobile drawer both inherit the
change with no shell edit. Headers are presentational; the `<nav>` landmark,
`aria-current="page"` and the active-item treatment are unchanged.

### 4.4 Dashboard home — the service pipeline

`(dashboard)/page.tsx` currently renders five equal count cards. It becomes a
three-stage pipeline that mirrors the loop, with the supporting counts demoted
rather than removed.

**Primary row — three large stage cards, each linking into its stage:**

| Stage | Query | Links to |
|---|---|---|
| Inspections to quote | `vehicle_inspections` where `business_id = <active>` and `status = 'completed'` and `quotation_id IS NULL` | `/inspections` |
| Quotes awaiting approval | `quotations` where `status = 'sent'` | `/quotes` |
| Jobs in progress | `jobs` where `status IN ACTIVE_JOB_STATUSES` | `/jobs` |

`inspection_status` is only `draft | completed`, so "awaiting review" does not
exist as a state. The actionable number is a **completed inspection not yet
converted to a quotation** — work that was found, photographed and not yet
priced. `quotation_id` already exists on the inspection header and is selected
in `src/lib/inspections/data.ts`.

**Secondary row — smaller cards, kept:** Customers, Vehicles, Open complaints.

**Get Started card:** primary action becomes **Start an inspection** →
`/inspections/new`. Add customer and Business settings remain as secondary
actions.

All five queries run in a single `Promise.all`, as today. Counts render through
`formatNumber` from `src/lib/formatters.ts` (Western digits in both locales).
The existing `Stat.ready` flag and its `status.laterRelease` copy are no longer
needed on the primary row — every stage shown is live.

### 4.5 Internationalisation

New keys in **both** `src/messages/en.json` and `ar.json`, at key parity:

- `nav.group.work`, `nav.group.records`, `nav.group.business`
- `nav.group.myVehicles`, `nav.group.service`, `nav.group.support`
- `dashboardHome.pipeline.inspectionsToQuote`, `.quotesAwaitingApproval`,
  `.jobsInProgress`, and a short supporting line for each
- `dashboardHome.getStarted.startInspection`
- `features.disabled.title`, `features.disabled.body`

Existing unused keys (`nav.analytics`, `nav.maintenance`, `nav.feedback`,
`nav.vehicleIntelligence`, `nav.retainerCalculator`, `nav.membershipBundles`,
`nav.memberships`, `nav.feedbackSupport`) are **retained**, because their
modules return in phase 2.

## 5. Phase 1 scope decisions

Decided with the product owner on 2026-09-25 for a pilot of up to 10 garages.

**Operational spine — always visible:** Dashboard, Customers, Vehicles,
Appointments, Jobs, Quotes, Invoices, Documents, Complaints, Notifications,
Billing, Implementation, Settings.

**Differentiators kept:** Digital Vehicle Inspection including the tokenised
public share link `i/[token]`, and the full customer portal.

**Hidden in phase 1 (6 dashboard nav items, 2 portal nav items, 13 routes):**

| Module | Reason |
|---|---|
| Vehicle Intelligence (AI) | Advisory-only. Demos well, earns little in a working pilot. |
| Retainer calculator | Sells a business model, not the daily workflow. |
| Membership bundles | Same; depends on the retainer tier model. |
| Analytics | Reporting is not what makes or breaks a ten-site pilot. |
| Maintenance reminders | Outbound automation aimed at the garages' own customers. |
| Feedback / ratings | Thin value at ten sites. |

## 6. Testing and verification

**New unit tests** (`node --test`, pure logic, no renderer):

- `tests/features.test.mjs` (imports `../src/lib/features/flags.js`) — phase 1 defaults are all `false`; a valid
  `NEXT_PUBLIC_REVORA_FEATURES` list enables exactly the named keys; unknown
  keys, empty strings, stray whitespace and stray commas are ignored without
  throwing; an unset variable yields the defaults unchanged.
- `tests/nav-model.test.mjs` (imports `../src/lib/nav/model.js`) — the dashboard model yields 14 items in 4 groups
  and the portal 10 in 4 under phase 1 defaults; enabling a feature restores
  exactly its items; `permissions.pricingTools = false` hides the retainer and
  bundle items independently of their feature flag; a group whose items are all
  filtered is dropped rather than rendered empty; every `labelKey` and
  `group.labelKey` in the model exists in both `en.json` and `ar.json`.

**Existing suites must stay green**, in the project's required order, with build
and typecheck run sequentially and never concurrently:

```
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

**Manual verification:**

1. Sign in as a business owner: sidebar shows 14 items in 4 groups, Inspections
   above the fold.
2. Navigate directly to `/ai/vin-decoder`: redirected to the dashboard with the
   disabled-module banner, locale prefix preserved.
3. Repeat at `/ar/ai/vin-decoder`: lands on `/ar`, banner in Arabic.
4. Set `NEXT_PUBLIC_REVORA_FEATURES="vehicleIntelligence"`, restart: the nav item
   and all five AI routes return.
5. Sign in as a portal customer: 10 items in 4 groups; `/portal/memberships`
   redirects with the banner.
6. Dashboard home shows three pipeline counts matching hand-run SQL against the
   same predicates.

## 7. Delivery

One feature branch off `main`; `main` is the PR base and is never committed to
directly. Suggested commit sequence, each independently green:

1. `features/types.ts` + `features/flags.js` + `features.test.mjs`
2. `features/guard.ts` + `requireFeature` calls in the 13 routes + the
   disabled-module banner on both home pages
3. `nav/types.ts` + `nav/model.js` + `nav-model.test.mjs`
4. `dashboard-nav.tsx` and `portal-nav.tsx` rendering groups from the model;
   dashboard layout passes `permissions.pricingTools`
5. Dashboard home pipeline
6. `en.json` / `ar.json` key parity pass
7. CHANGELOG entry

No migration. No schema change. No file deleted. No route removed.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A hidden module is reachable by URL and silently supported. | `requireFeature` guards all 13 routes server-side; manual step 2 verifies. |
| Feature flag and role permission get conflated, granting pricing tools to managers when the flag returns. | Two independent predicates in `visibleGroups`; a dedicated test asserts permission filtering works with the feature enabled. |
| `ar.json` drifts from `en.json`. | A nav-model test asserts every label key resolves in both files. |
| Locale lost on a gate redirect. | Gate uses the locale-aware `redirect` from `@/i18n/navigation`; manual step 3 verifies. |
| Hiding maintenance reminders and ratings removes between-visit customer contact. | Accepted for phase 1; both are first candidates for phase 2 (§9). |
| `lib/auth.ts` redirects via `next/navigation` rather than the locale-aware helper — a pre-existing inconsistency. | **Out of scope.** `auth.ts` is auth-critical. Recorded as a follow-on, not touched here. |
| Group headers confuse screen-reader users. | Headers are presentational only; the `<nav>` landmark and `aria-current` semantics are unchanged. |

## 9. Open follow-ons (not in this spec)

- Phase 2 re-enablement order, provisionally: Maintenance reminders and Feedback
  first (customer contact), then Analytics, then Vehicle Intelligence, then the
  retainer and bundle pricing tools.
- Per-tenant feature packaging, if phase 2 sells tiers. Needs a table, RLS and a
  migration; deliberately deferred.
- Resolving `lib/auth.ts`'s non-locale-aware `redirect`, as its own change with
  its own auth review.
- Root-admin nav hierarchy — `admin-nav.tsx` is untouched here.
