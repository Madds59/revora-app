# Revora MVP Scope V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Revora's phase 1 surface to the operational spine plus inspections and the customer portal, give both sidebars a hierarchy, and rebuild the dashboard home around the inspect → quote → approve → job loop — without deleting any code.

**Architecture:** Three independent mechanisms. A pure feature registry (`src/lib/features/`) decides which optional modules exist in this build. A server-only guard (`requireFeature`) redirects direct URL hits on disabled modules. A pure navigation model (`src/lib/nav/`) holds both sidebars as data and filters them by feature *and* role, with the two predicates kept independent. Rendering components consume the model; no route, component or migration is removed.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript (strict, `allowJs: true`, `checkJs` off), Supabase, next-intl (en/ar), Tailwind v4, shadcn/Base UI, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-25-revora-mvp-scope-design.md`

## Global Constraints

- Never delete a file, route, component, translation key or migration. Modules are hidden, never removed.
- Do not touch auth, RLS, middleware, `/api/stripe/webhook`, `src/lib/auth.ts`, or any applied migration.
- Do not touch `src/components/admin-nav.tsx` or any `(admin)` route.
- Every user-facing string goes through next-intl with **exact key parity between `src/messages/en.json` and `src/messages/ar.json`**.
- Numbers and money render via `src/lib/formatters.ts` (Western digits in both locales).
- Pure, unit-testable logic is authored as **`.js` with JSDoc**, with types in a sibling `types.ts` — matching `src/lib/retainer/*.js` + `src/lib/retainer/types.ts` and `src/lib/form-draft.js`. Tests import the `.js` directly.
- `checkJs` is off, so TypeScript will **not** report errors inside `.js` files, but their JSDoc still types the `.tsx` consumers. Wrong JSDoc fails silently — get it right.
- No new dependencies.
- Validation order, build and typecheck never concurrent: `pnpm lint` → `pnpm typecheck` → `pnpm build` → `pnpm test`.
- Work on branch `revora-mvp-scope-v1`. No push, no PR, no merge, no deploy.

## Review Focus

1. **Malformed `NEXT_PUBLIC_REVORA_FEATURES`** — empty string, stray commas, padding whitespace, unknown names, wrong casing. Must never throw and must never enable an unknown key. *Test in Task 1.*
2. **Crafted `?disabled=` value** — the home pages read this param and render copy from it. An unknown or hostile value (`<script>`, a bare `../`, a valid-looking unknown key) must render no banner at all, never echo the raw value. *Test in Task 3.*
3. **Locale lost on a gate redirect** — an Arabic user hitting `/ar/ai/vin-decoder` must land on `/ar`, not `/`. *Verified manually in Task 3, Step 9.2.* `requireFeature` delegates to next-intl's locale-aware `redirect({ href, locale })`, which has no pure seam to unit-test under `node --test`; the manual check is the only honest verification.
4. **A group whose items are all filtered** — the phase 1 `tools` group is entirely disabled and must not render a stray header above nothing. *Test in Task 2.*
5. **Feature and permission axes conflated** — with `retainerCalculator` force-enabled but `permissions.pricingTools === false`, the retainer and bundle items must still be hidden. *Test in Task 2.*

---

### Task 1: Feature registry

**Files:**
- Create: `apps/web/src/lib/features/types.ts`
- Create: `apps/web/src/lib/features/flags.js`
- Test: `apps/web/tests/features.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `FeatureKey`, `FeatureFlags` (types); `PHASE_1_DEFAULTS`, `FEATURE_KEYS`, `isFeatureKey(value)`, `parseFeatureOverrides(raw)`, `resolveFeatures(raw)`, `isFeatureEnabled(flags, key)`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/features.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  FEATURE_KEYS,
  PHASE_1_DEFAULTS,
  isFeatureEnabled,
  isFeatureKey,
  parseFeatureOverrides,
  resolveFeatures,
} from "../src/lib/features/flags.js";

test("every phase 1 optional module defaults to off", () => {
  assert.deepEqual(PHASE_1_DEFAULTS, {
    vehicleIntelligence: false,
    retainerCalculator: false,
    membershipBundles: false,
    analytics: false,
    maintenance: false,
    feedback: false,
  });
  assert.equal(FEATURE_KEYS.length, 6);
});

test("an unset or blank override leaves the defaults untouched", () => {
  assert.deepEqual(resolveFeatures(undefined), PHASE_1_DEFAULTS);
  assert.deepEqual(resolveFeatures(null), PHASE_1_DEFAULTS);
  assert.deepEqual(resolveFeatures(""), PHASE_1_DEFAULTS);
  assert.deepEqual(resolveFeatures("   "), PHASE_1_DEFAULTS);
});

test("the override enables exactly the keys it names", () => {
  const flags = resolveFeatures("analytics,maintenance");
  assert.equal(flags.analytics, true);
  assert.equal(flags.maintenance, true);
  assert.equal(flags.vehicleIntelligence, false);
  assert.equal(flags.retainerCalculator, false);
});

test("malformed override entries are ignored rather than thrown on", () => {
  // Stray commas, padding, unknown names, wrong casing, non-string input.
  assert.deepEqual(parseFeatureOverrides(",, ,"), []);
  assert.deepEqual(parseFeatureOverrides("  analytics  ,, maintenance "), [
    "analytics",
    "maintenance",
  ]);
  assert.deepEqual(parseFeatureOverrides("Analytics"), []);
  assert.deepEqual(parseFeatureOverrides("nope,analytics"), ["analytics"]);
  assert.deepEqual(parseFeatureOverrides("__proto__"), []);
  assert.deepEqual(parseFeatureOverrides(42), []);
  assert.deepEqual(parseFeatureOverrides({}), []);
});

test("an unknown key never becomes an enabled flag", () => {
  const flags = resolveFeatures("nope,__proto__,constructor");
  assert.deepEqual(flags, PHASE_1_DEFAULTS);
  assert.equal(Object.keys(flags).length, 6);
});

test("isFeatureKey accepts only the six registry names", () => {
  assert.equal(isFeatureKey("analytics"), true);
  assert.equal(isFeatureKey("nope"), false);
  assert.equal(isFeatureKey(""), false);
  assert.equal(isFeatureKey(undefined), false);
  assert.equal(isFeatureKey("<script>alert(1)</script>"), false);
});

test("an ungated item (no feature key) is always enabled", () => {
  assert.equal(isFeatureEnabled(PHASE_1_DEFAULTS, undefined), true);
  assert.equal(isFeatureEnabled(PHASE_1_DEFAULTS, "analytics"), false);
  assert.equal(isFeatureEnabled(resolveFeatures("analytics"), "analytics"), true);
});

test("resolveFeatures returns a fresh object each call", () => {
  const a = resolveFeatures("analytics");
  const b = resolveFeatures(undefined);
  assert.equal(a.analytics, true);
  assert.equal(b.analytics, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && node --test tests/features.test.mjs
```

Expected: FAIL — `Cannot find module .../src/lib/features/flags.js`.

- [ ] **Step 3: Write the types**

Create `apps/web/src/lib/features/types.ts`:

```ts
/**
 * Optional modules only. Anything not named here is always enabled — keeping
 * the registry small keeps the phase 2 re-enablement diff honest.
 */
export type FeatureKey =
  | "vehicleIntelligence"
  | "retainerCalculator"
  | "membershipBundles"
  | "analytics"
  | "maintenance"
  | "feedback";

export type FeatureFlags = Record<FeatureKey, boolean>;
```

- [ ] **Step 4: Write the minimal implementation**

Create `apps/web/src/lib/features/flags.js`:

```js
/**
 * Phase 1 feature registry. Pure on purpose: no process.env read, no Supabase,
 * no React, so this file stays unit-testable with `node --test` and importable
 * from both server and client components.
 *
 * The raw NEXT_PUBLIC_REVORA_FEATURES string is passed IN rather than read
 * here. Next.js only inlines NEXT_PUBLIC_* through a static
 * `process.env.NEXT_PUBLIC_X` reference, and taking the string as an argument
 * keeps this testable without stubbing the environment.
 */

/** @typedef {import("./types").FeatureKey} FeatureKey */
/** @typedef {import("./types").FeatureFlags} FeatureFlags */

/** @type {FeatureFlags} */
export const PHASE_1_DEFAULTS = Object.freeze({
  vehicleIntelligence: false,
  retainerCalculator: false,
  membershipBundles: false,
  analytics: false,
  maintenance: false,
  feedback: false,
});

/** @type {FeatureKey[]} */
export const FEATURE_KEYS = Object.freeze(Object.keys(PHASE_1_DEFAULTS));

/**
 * @param {unknown} value
 * @returns {boolean} true only for one of the six registry names
 */
export function isFeatureKey(value) {
  return typeof value === "string" && FEATURE_KEYS.includes(value);
}

/**
 * Parse NEXT_PUBLIC_REVORA_FEATURES. Additive: every name listed is forced on.
 * Unknown names, blank entries and padding are dropped — a typo in an env var
 * must never take the app down.
 *
 * @param {unknown} raw
 * @returns {FeatureKey[]}
 */
export function parseFeatureOverrides(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(isFeatureKey);
}

/**
 * @param {unknown} raw NEXT_PUBLIC_REVORA_FEATURES
 * @returns {FeatureFlags} a fresh, unfrozen copy
 */
export function resolveFeatures(raw) {
  /** @type {FeatureFlags} */
  const flags = { ...PHASE_1_DEFAULTS };
  for (const key of parseFeatureOverrides(raw)) {
    flags[key] = true;
  }
  return flags;
}

/**
 * @param {FeatureFlags} flags
 * @param {FeatureKey | undefined} key undefined means the item is not gated
 * @returns {boolean}
 */
export function isFeatureEnabled(flags, key) {
  if (key === undefined) return true;
  return flags[key] === true;
}
```

Note `FEATURE_KEYS.includes(value)` guards `__proto__` correctly because it tests membership in a literal array, not key lookup on an object.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/web && node --test tests/features.test.mjs
```

Expected: PASS, 8/8.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/features/types.ts apps/web/src/lib/features/flags.js apps/web/tests/features.test.mjs
git commit -m "Add phase 1 feature registry with env override parsing"
```

---

### Task 2: Navigation model

**Files:**
- Create: `apps/web/src/lib/nav/types.ts`
- Create: `apps/web/src/lib/nav/model.js`
- Modify: `apps/web/src/messages/en.json` (add `nav.group.*`)
- Modify: `apps/web/src/messages/ar.json` (add `nav.group.*`)
- Test: `apps/web/tests/nav-model.test.mjs`

**Interfaces:**
- Consumes: `isFeatureEnabled`, `FeatureFlags` from Task 1.
- Produces: `NavItem`, `NavGroup`, `NavPermissions` (types); `DASHBOARD_NAV`, `PORTAL_NAV`, `visibleGroups(groups, opts)`, `isNavItemActive(pathname, item)`.

The six hidden modules **stay in the model**, in a fifth `tools` group carrying their `feature` keys. `visibleGroups` drops groups left empty, so phase 1 renders exactly 4 groups / 14 items while phase 2 re-enablement is a flag flip with the item already in a sensible home.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/nav-model.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PHASE_1_DEFAULTS, resolveFeatures } from "../src/lib/features/flags.js";
import {
  DASHBOARD_NAV,
  PORTAL_NAV,
  isNavItemActive,
  visibleGroups,
} from "../src/lib/nav/model.js";

const ALL_ALLOWED = { pricingTools: true };
const NO_PRICING = { pricingTools: false };
const phase1 = { features: PHASE_1_DEFAULTS, permissions: ALL_ALLOWED };

const countItems = (groups) =>
  groups.reduce((total, group) => total + group.items.length, 0);

test("phase 1 dashboard nav is 14 items in 4 groups", () => {
  const groups = visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(groups.length, 4);
  assert.equal(countItems(groups), 14);
});

test("phase 1 portal nav is 10 items in 4 groups", () => {
  const groups = visibleGroups(PORTAL_NAV, phase1);
  assert.equal(groups.length, 4);
  assert.equal(countItems(groups), 10);
});

test("home and inspections lead both sidebars, ungrouped", () => {
  const [dashLead] = visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(dashLead.labelKey, undefined);
  assert.deepEqual(
    dashLead.items.map((i) => i.labelKey),
    ["dashboard", "inspections"],
  );

  const [portalLead] = visibleGroups(PORTAL_NAV, phase1);
  assert.equal(portalLead.labelKey, undefined);
  assert.deepEqual(
    portalLead.items.map((i) => i.labelKey),
    ["home", "inspections"],
  );
});

test("a group whose items are all filtered is dropped, not rendered empty", () => {
  const groups = visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(
    groups.some((group) => group.labelKey === "tools"),
    false,
  );
  assert.equal(
    groups.every((group) => group.items.length > 0),
    true,
  );
});

test("enabling a feature restores exactly its items", () => {
  const groups = visibleGroups(DASHBOARD_NAV, {
    features: resolveFeatures("analytics"),
    permissions: ALL_ALLOWED,
  });
  assert.equal(countItems(groups), 15);
  const tools = groups.find((group) => group.labelKey === "tools");
  assert.deepEqual(
    tools.items.map((i) => i.labelKey),
    ["analytics"],
  );
});

test("permission filtering is independent of the feature flag", () => {
  // Feature ON, permission OFF -> still hidden. This is the regression that
  // would silently grant every manager the pricing tools in phase 2.
  const groups = visibleGroups(DASHBOARD_NAV, {
    features: resolveFeatures("retainerCalculator,membershipBundles"),
    permissions: NO_PRICING,
  });
  assert.equal(countItems(groups), 14);
  assert.equal(
    groups.some((group) => group.labelKey === "tools"),
    false,
  );

  const allowed = visibleGroups(DASHBOARD_NAV, {
    features: resolveFeatures("retainerCalculator,membershipBundles"),
    permissions: ALL_ALLOWED,
  });
  assert.equal(countItems(allowed), 16);
});

test("visibleGroups does not mutate the source model", () => {
  const before = JSON.stringify(DASHBOARD_NAV);
  visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(JSON.stringify(DASHBOARD_NAV), before);
});

test("isNavItemActive matches the item, its children and its aliases", () => {
  const quotes = { labelKey: "quotes", href: "/quotes", icon: "FileText", aliases: ["/quotations"] };
  assert.equal(isNavItemActive("/quotes", quotes), true);
  assert.equal(isNavItemActive("/quotes/abc", quotes), true);
  assert.equal(isNavItemActive("/quotations/abc", quotes), true);
  assert.equal(isNavItemActive("/quotes-archive", quotes), false);

  const dashboard = { labelKey: "dashboard", href: "/dashboard", icon: "Home", aliases: ["/"] };
  assert.equal(isNavItemActive("/", dashboard), true);
  assert.equal(isNavItemActive("/customers", dashboard), false);

  const portalHome = { labelKey: "home", href: "/portal", icon: "Home", exact: true };
  assert.equal(isNavItemActive("/portal", portalHome), true);
  assert.equal(isNavItemActive("/portal/jobs", portalHome), false);
});

test("every label key in both models resolves in en.json and ar.json", () => {
  // Resolve relative to this file, not the cwd, so the test survives being run
  // from the repo root as well as from apps/web.
  const load = (locale) =>
    JSON.parse(
      readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"),
    );
  const en = load("en");
  const ar = load("ar");

  for (const groups of [DASHBOARD_NAV, PORTAL_NAV]) {
    for (const group of groups) {
      if (group.labelKey) {
        assert.ok(en.nav.group[group.labelKey], `en nav.group.${group.labelKey}`);
        assert.ok(ar.nav.group[group.labelKey], `ar nav.group.${group.labelKey}`);
      }
      for (const item of group.items) {
        assert.ok(en.nav[item.labelKey], `en nav.${item.labelKey}`);
        assert.ok(ar.nav[item.labelKey], `ar nav.${item.labelKey}`);
      }
    }
  }
  assert.deepEqual(Object.keys(en.nav.group).sort(), Object.keys(ar.nav.group).sort());
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && node --test tests/nav-model.test.mjs
```

Expected: FAIL — `Cannot find module .../src/lib/nav/model.js`.

- [ ] **Step 3: Write the types**

Create `apps/web/src/lib/nav/types.ts`:

```ts
import type { FeatureKey } from "@/lib/features/types";

export type NavPermissionKey = "pricingTools";

export type NavItem = {
  /** Key under `nav.*` in the message files. */
  labelKey: string;
  href: string;
  /** lucide-react export name; mapped to a component by the render layer. */
  icon: string;
  /** Extra paths that should mark this item active. */
  aliases?: string[];
  /** Match the pathname exactly instead of by prefix. */
  exact?: boolean;
  /** Absent means the item is never feature-gated. */
  feature?: FeatureKey;
  /** Absent means no role restriction. */
  permission?: NavPermissionKey;
};

export type NavGroup = {
  /** Key under `nav.group.*`. Absent renders the items with no header. */
  labelKey?: string;
  items: NavItem[];
};

export type NavPermissions = Record<NavPermissionKey, boolean>;
```

- [ ] **Step 4: Write the model**

Create `apps/web/src/lib/nav/model.js`:

```js
/**
 * Both sidebars as data. No React here, so `node --test` can import it and the
 * grouping, filtering and active-path rules are unit-testable.
 *
 * The six modules hidden in phase 1 stay in the `tools` group carrying their
 * feature keys. visibleGroups drops a group left empty, so phase 1 renders
 * four groups; phase 2 re-enablement is a flag flip, not a re-placement.
 */

import { isFeatureEnabled } from "../features/flags.js";

/** @typedef {import("./types").NavItem} NavItem */
/** @typedef {import("./types").NavGroup} NavGroup */
/** @typedef {import("./types").NavPermissions} NavPermissions */
/** @typedef {import("../features/types").FeatureFlags} FeatureFlags */

/** @type {NavGroup[]} */
export const DASHBOARD_NAV = [
  {
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: "Home", aliases: ["/"] },
      { labelKey: "inspections", href: "/inspections", icon: "ClipboardCheck" },
    ],
  },
  {
    labelKey: "work",
    items: [
      { labelKey: "appointments", href: "/appointments", icon: "CalendarClock" },
      { labelKey: "jobs", href: "/jobs", icon: "Wrench" },
      { labelKey: "quotes", href: "/quotes", icon: "FileText", aliases: ["/quotations"] },
      { labelKey: "invoices", href: "/invoices", icon: "Receipt" },
    ],
  },
  {
    labelKey: "records",
    items: [
      { labelKey: "customers", href: "/customers", icon: "Users" },
      { labelKey: "vehicles", href: "/vehicles", icon: "CarFront" },
      { labelKey: "complaints", href: "/complaints", icon: "MessageSquareWarning" },
      { labelKey: "documents", href: "/documents", icon: "Files" },
    ],
  },
  {
    labelKey: "business",
    items: [
      { labelKey: "notifications", href: "/notifications", icon: "Bell" },
      { labelKey: "implementation", href: "/implementation", icon: "ClipboardList" },
      { labelKey: "billing", href: "/billing", icon: "CreditCard" },
      {
        labelKey: "settings",
        href: "/settings",
        icon: "Settings",
        aliases: ["/settings/business"],
      },
    ],
  },
  {
    labelKey: "tools",
    items: [
      {
        labelKey: "vehicleIntelligence",
        href: "/ai",
        icon: "ScanSearch",
        feature: "vehicleIntelligence",
        aliases: [
          "/ai/search",
          "/ai/vin-decoder",
          "/ai/dtc-decoder",
          "/ai/vehicle-diagnosis",
        ],
      },
      { labelKey: "analytics", href: "/analytics", icon: "BarChart3", feature: "analytics" },
      { labelKey: "maintenance", href: "/maintenance", icon: "Gauge", feature: "maintenance" },
      { labelKey: "feedback", href: "/feedback", icon: "MessageSquare", feature: "feedback" },
      {
        labelKey: "retainerCalculator",
        href: "/tools/retainer-calculator",
        icon: "Calculator",
        feature: "retainerCalculator",
        permission: "pricingTools",
      },
      {
        labelKey: "membershipBundles",
        href: "/tools/membership-bundles",
        icon: "Layers",
        feature: "membershipBundles",
        permission: "pricingTools",
      },
    ],
  },
];

/** @type {NavGroup[]} */
export const PORTAL_NAV = [
  {
    items: [
      { labelKey: "home", href: "/portal", icon: "Home", exact: true },
      { labelKey: "inspections", href: "/portal/inspections", icon: "ClipboardCheck" },
    ],
  },
  {
    labelKey: "myVehicles",
    items: [
      { labelKey: "vehicles", href: "/portal/vehicles", icon: "CarFront" },
      { labelKey: "documents", href: "/portal/documents", icon: "Files" },
    ],
  },
  {
    labelKey: "service",
    items: [
      { labelKey: "appointments", href: "/portal/appointments", icon: "CalendarClock" },
      { labelKey: "quotes", href: "/portal/quotes", icon: "FileText" },
      { labelKey: "invoices", href: "/portal/invoices", icon: "Receipt" },
      { labelKey: "jobs", href: "/portal/jobs", icon: "Wrench" },
    ],
  },
  {
    labelKey: "support",
    items: [
      { labelKey: "complaints", href: "/portal/complaints", icon: "MessageSquare" },
      { labelKey: "settings", href: "/portal/settings", icon: "Settings" },
    ],
  },
  {
    labelKey: "tools",
    items: [
      {
        labelKey: "memberships",
        href: "/portal/memberships",
        icon: "Layers",
        feature: "membershipBundles",
      },
      {
        labelKey: "feedbackSupport",
        href: "/portal/feedback",
        icon: "MessageSquare",
        feature: "feedback",
      },
    ],
  },
];

/**
 * Drop items whose feature is off OR whose permission is denied — the two
 * predicates are independent and both must pass — then drop empty groups.
 *
 * @param {NavGroup[]} groups
 * @param {{ features: FeatureFlags, permissions: NavPermissions }} opts
 * @returns {NavGroup[]} new array; the source model is never mutated
 */
export function visibleGroups(groups, { features, permissions }) {
  /** @type {NavGroup[]} */
  const visible = [];
  for (const group of groups) {
    const items = group.items.filter(
      (item) =>
        isFeatureEnabled(features, item.feature) &&
        (item.permission === undefined || permissions[item.permission] === true),
    );
    if (items.length > 0) visible.push({ ...group, items });
  }
  return visible;
}

/**
 * @param {string} pathname locale-stripped pathname from `usePathname()`
 * @param {NavItem} item
 * @returns {boolean}
 */
export function isNavItemActive(pathname, item) {
  const candidates = [item.href, ...(item.aliases ?? [])];
  return candidates.some((candidate) => {
    if (item.exact) return pathname === candidate;
    if (candidate === "/") return pathname === "/";
    if (pathname === candidate) return true;
    return pathname.startsWith(`${candidate}/`);
  });
}
```

- [ ] **Step 5: Add the group labels to both message files**

In `apps/web/src/messages/en.json`, add a `group` object inside the existing `nav` object:

```json
"group": {
  "work": "Work",
  "records": "Records",
  "business": "Business",
  "myVehicles": "My vehicles",
  "service": "Service",
  "support": "Support",
  "tools": "Tools"
}
```

In `apps/web/src/messages/ar.json`, inside its `nav` object, at the same key parity:

```json
"group": {
  "work": "العمل",
  "records": "السجلات",
  "business": "الأعمال",
  "myVehicles": "مركباتي",
  "service": "الخدمة",
  "support": "الدعم",
  "tools": "الأدوات"
}
```

Do not remove any existing `nav.*` key. `nav.analytics`, `nav.maintenance`, `nav.feedback`, `nav.vehicleIntelligence`, `nav.retainerCalculator`, `nav.membershipBundles`, `nav.memberships` and `nav.feedbackSupport` are all still referenced by the `tools` groups.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/web && node --test tests/nav-model.test.mjs
```

Expected: PASS, 9/9.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/nav/types.ts apps/web/src/lib/nav/model.js apps/web/tests/nav-model.test.mjs apps/web/src/messages/en.json apps/web/src/messages/ar.json
git commit -m "Add grouped navigation model with feature and permission filtering"
```

---

### Task 3: Server-side feature gate

**Files:**
- Create: `apps/web/src/lib/features/guard.ts`
- Modify: 13 gated route files (listed in Step 4)
- Modify: `apps/web/src/app/[locale]/(dashboard)/page.tsx` (disabled banner only — the pipeline is Task 6)
- Modify: `apps/web/src/app/[locale]/(portal)/portal/page.tsx` (disabled banner)
- Modify: `apps/web/src/messages/en.json`, `ar.json` (`features.disabled.*`)
- Test: `apps/web/tests/features.test.mjs` (extend)

**Interfaces:**
- Consumes: `resolveFeatures`, `isFeatureKey`, `FeatureKey` from Task 1.
- Produces: `requireFeature(key, surface?)`, `disabledBannerKey(rawParam)`.

- [ ] **Step 1: Write the failing test for the param sanitizer**

Append to `apps/web/tests/features.test.mjs`:

```js
import { disabledBannerKey } from "../src/lib/features/flags.js";

test("the ?disabled= param only ever yields a known feature key", () => {
  assert.equal(disabledBannerKey("analytics"), "analytics");
  assert.equal(disabledBannerKey("nope"), null);
  assert.equal(disabledBannerKey(""), null);
  assert.equal(disabledBannerKey(undefined), null);
  // A hostile value must never come back for rendering.
  assert.equal(disabledBannerKey("<script>alert(1)</script>"), null);
  assert.equal(disabledBannerKey("../../etc/passwd"), null);
  assert.equal(disabledBannerKey("__proto__"), null);
  // Next gives an array when the param repeats; take the first valid entry.
  assert.equal(disabledBannerKey(["analytics", "nope"]), "analytics");
  assert.equal(disabledBannerKey(["nope"]), null);
  assert.equal(disabledBannerKey([]), null);
});
```

Move the `disabledBannerKey` import into the existing import block at the top of the file rather than adding a second import statement.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && node --test tests/features.test.mjs
```

Expected: FAIL — `disabledBannerKey is not a function`.

- [ ] **Step 3: Add the sanitizer to `flags.js`**

Append to `apps/web/src/lib/features/flags.js`:

```js
/**
 * Narrow a `?disabled=` search param to a known feature key. Anything else
 * yields null so the banner renders nothing rather than echoing user input.
 *
 * @param {unknown} rawParam string | string[] | undefined, as Next supplies it
 * @returns {FeatureKey | null}
 */
export function disabledBannerKey(rawParam) {
  const candidates = Array.isArray(rawParam) ? rawParam : [rawParam];
  for (const candidate of candidates) {
    if (isFeatureKey(candidate)) return candidate;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && node --test tests/features.test.mjs
```

Expected: PASS, 9/9.

- [ ] **Step 5: Write the guard**

Create `apps/web/src/lib/features/guard.ts`:

```ts
import "server-only";

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { resolveFeatures } from "@/lib/features/flags";
import type { FeatureKey } from "@/lib/features/types";

/**
 * Guards a route belonging to an optional module. Mirrors the
 * requireMembership() idiom: redirect, never 404 — a bookmarked URL for a
 * finished feature should degrade, not look broken.
 *
 * Uses the locale-aware redirect so an Arabic user stays on /ar.
 *
 * Signature verified against next-intl 4.13.0: redirect({ href, locale }).
 * routing.ts defines no `pathnames`, so `href` accepts a plain
 * { pathname, query } object.
 */
export async function requireFeature(
  key: FeatureKey,
  surface: "dashboard" | "portal" = "dashboard",
): Promise<void> {
  const features = resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES);
  if (features[key]) return;

  const locale = await getLocale();
  const pathname = surface === "portal" ? "/portal" : "/";
  redirect({ href: { pathname, query: { disabled: key } }, locale });
}
```

- [ ] **Step 6: Call the guard in all 13 routes**

In each file below, insert the `requireFeature` call **immediately after the existing auth guard** (`requireMembership()` / `requireCustomerPortal()`), adding the import `import { requireFeature } from "@/lib/features/guard";`.

| File (under `apps/web/src/app/[locale]/`) | Call |
|---|---|
| `(dashboard)/ai/page.tsx` | `await requireFeature("vehicleIntelligence");` |
| `(dashboard)/ai/search/page.tsx` | `await requireFeature("vehicleIntelligence");` |
| `(dashboard)/ai/vin-decoder/page.tsx` | `await requireFeature("vehicleIntelligence");` |
| `(dashboard)/ai/dtc-decoder/page.tsx` | `await requireFeature("vehicleIntelligence");` |
| `(dashboard)/ai/vehicle-diagnosis/page.tsx` | `await requireFeature("vehicleIntelligence");` |
| `(dashboard)/tools/retainer-calculator/page.tsx` | `await requireFeature("retainerCalculator");` |
| `(dashboard)/tools/membership-bundles/page.tsx` | `await requireFeature("membershipBundles");` |
| `(dashboard)/analytics/page.tsx` | `await requireFeature("analytics");` |
| `(dashboard)/maintenance/page.tsx` | `await requireFeature("maintenance");` |
| `(dashboard)/feedback/page.tsx` | `await requireFeature("feedback");` |
| `(portal)/portal/memberships/page.tsx` | `await requireFeature("membershipBundles", "portal");` |
| `(portal)/portal/feedback/page.tsx` | `await requireFeature("feedback", "portal");` |
| `(portal)/portal/ai/health-check/page.tsx` | `await requireFeature("vehicleIntelligence", "portal");` |

**Two exceptions.** `(dashboard)/ai/page.tsx` and `(dashboard)/ai/search/page.tsx` have **no page-level auth guard** — they are protected by the `(dashboard)` layout's `requireMembership()`. Do not add an auth guard to them (that is out of scope); place `await requireFeature("vehicleIntelligence");` as the first statement inside the component body instead.

For `(dashboard)/ai/search/page.tsx`, the first statement is a `Promise.all` destructuring. Put the `requireFeature` call on the line **before** it, so a disabled build never runs `searchVehicleIntelligence`.

- [ ] **Step 7: Add the banner strings**

`en.json`, as a new top-level `features` object:

```json
"features": {
  "disabled": {
    "title": "That module isn't enabled",
    "body": "This workspace is running the phase 1 feature set. Ask your Revora contact if you need this module switched on."
  }
}
```

`ar.json`, at the same key parity:

```json
"features": {
  "disabled": {
    "title": "هذه الوحدة غير مفعّلة",
    "body": "تعمل مساحة العمل هذه على مجموعة ميزات المرحلة الأولى. تواصل مع جهة الاتصال لديك في ريفورا لتفعيل هذه الوحدة."
  }
}
```

- [ ] **Step 8: Render the banner on both home pages**

In `apps/web/src/app/[locale]/(dashboard)/page.tsx`, accept `searchParams` and render the banner above the existing content:

```tsx
import { StatusBanner } from "@/components/status-banner";
import { disabledBannerKey } from "@/lib/features/flags";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ disabled?: string | string[] }>;
}) {
  const t = await getTranslations("dashboardHome");
  const tf = await getTranslations("features");
  const { disabled } = await searchParams;
  const disabledKey = disabledBannerKey(disabled);
  // ...existing requireMembership / supabase work unchanged...
```

and inside the returned `<div className="flex flex-col gap-6 p-6">`, as its first child:

```tsx
{disabledKey && (
  <StatusBanner tone="muted" role="status" title={tf("disabled.title")}>
    <p>{tf("disabled.body")}</p>
  </StatusBanner>
)}
```

Apply the identical pattern to `apps/web/src/app/[locale]/(portal)/portal/page.tsx`, placing the banner above the existing `PageHeader`'s sibling content. Note that portal home returns early when `accounts.length === 0`; render the banner in **both** return paths, or hoist it into a shared local variable used by each.

- [ ] **Step 9: Verify the gate end to end**

```bash
cd apps/web && pnpm lint && pnpm typecheck
```

Expected: exit 0 for both. Then start the dev server and check manually:

1. `/ai/vin-decoder` → redirects to `/` with the muted banner.
2. `/ar/ai/vin-decoder` → redirects to `/ar` (locale preserved), banner in Arabic.
3. `/?disabled=<script>alert(1)</script>` → **no banner**, no echoed text.
4. `/?disabled=analytics` → banner renders.
5. `/portal/memberships` → redirects to `/portal` with the banner.
6. `NEXT_PUBLIC_REVORA_FEATURES=vehicleIntelligence pnpm dev` → all five `/ai/*` routes load normally.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/features/guard.ts apps/web/src/lib/features/flags.js apps/web/tests/features.test.mjs apps/web/src/messages/en.json apps/web/src/messages/ar.json "apps/web/src/app/[locale]"
git commit -m "Gate optional modules server-side with a locale-aware redirect"
```

---

### Task 4: Dashboard sidebar renders the grouped model

**Files:**
- Modify: `apps/web/src/components/dashboard-nav.tsx` (full rewrite of the component body; the file keeps its name and export)
- Modify: `apps/web/src/app/[locale]/(dashboard)/layout.tsx:36` (replace the `showRetainerCalculator` prop)

**Interfaces:**
- Consumes: `DASHBOARD_NAV`, `visibleGroups`, `isNavItemActive` from Task 2; `resolveFeatures` from Task 1.
- Produces: `<DashboardNav permissions={{ pricingTools: boolean }} />`.

- [ ] **Step 1: Rewrite the component**

Replace the contents of `apps/web/src/components/dashboard-nav.tsx`:

```tsx
"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
  Calculator,
  CalendarClock,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  Files,
  Gauge,
  Home,
  Layers,
  MessageSquare,
  MessageSquareWarning,
  Receipt,
  ScanSearch,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveFeatures } from "@/lib/features/flags";
import { DASHBOARD_NAV, isNavItemActive, visibleGroups } from "@/lib/nav/model";
import type { NavPermissions } from "@/lib/nav/types";

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  Bell,
  Calculator,
  CalendarClock,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  Files,
  Gauge,
  Home,
  Layers,
  MessageSquare,
  MessageSquareWarning,
  Receipt,
  ScanSearch,
  Settings,
  Users,
  Wrench,
};

export function DashboardNav({ permissions }: { permissions: NavPermissions }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const features = resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES);
  const groups = visibleGroups(DASHBOARD_NAV, { features, permissions });

  return (
    <nav className="flex flex-col gap-4 px-2">
      {groups.map((group, index) => (
        <div key={group.labelKey ?? `lead-${index}`} className="flex flex-col gap-0.5">
          {group.labelKey && (
            <p className="text-sidebar-foreground/50 px-3 pt-1 pb-1 text-[0.6875rem] font-semibold tracking-wider uppercase">
              {t(`group.${group.labelKey}`)}
            </p>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-sidebar-primary absolute inset-y-1.5 start-0 w-0.5 rounded-full"
                  />
                )}
                {Icon && (
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                    )}
                  />
                )}
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
```

`t(\`group.${group.labelKey}\`)` is a dynamic next-intl key; that is already the pattern this file used for `t(item.labelKey)`.

- [ ] **Step 2: Rewire the layout**

In `apps/web/src/app/[locale]/(dashboard)/layout.tsx`, keep the existing permission computation and pass it under the new prop name. Replace:

```tsx
  const showRetainerCalculator = canManagePricingTools(member.role) || superAdmin;
```

with:

```tsx
  const pricingTools = canManagePricingTools(member.role) || superAdmin;
```

and replace:

```tsx
      nav={<DashboardNav showRetainerCalculator={showRetainerCalculator} />}
```

with:

```tsx
      nav={<DashboardNav permissions={{ pricingTools }} />}
```

Leave the `canManagePricingTools` import and every other line of the layout unchanged.

- [ ] **Step 3: Verify**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

Expected: exit 0 for all three. Then in the browser, signed in as an owner: the sidebar shows Home and Inspections at the top with no header, then WORK, RECORDS and BUSINESS — 14 links, 4 sections, no empty TOOLS header. Open the mobile drawer and confirm it matches.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard-nav.tsx "apps/web/src/app/[locale]/(dashboard)/layout.tsx"
git commit -m "Render the dashboard sidebar from the grouped nav model"
```

---

### Task 5: Portal sidebar renders the grouped model

**Files:**
- Modify: `apps/web/src/components/portal-nav.tsx`

**Interfaces:**
- Consumes: `PORTAL_NAV`, `visibleGroups`, `isNavItemActive` from Task 2; `resolveFeatures` from Task 1.
- Produces: `<PortalNav />` — unchanged call signature, so `(portal)/layout.tsx` needs no edit.

- [ ] **Step 1: Rewrite the component**

Replace the contents of `apps/web/src/components/portal-nav.tsx`:

```tsx
"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  CarFront,
  ClipboardCheck,
  FileText,
  Files,
  Home,
  Layers,
  MessageSquare,
  Receipt,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveFeatures } from "@/lib/features/flags";
import { PORTAL_NAV, isNavItemActive, visibleGroups } from "@/lib/nav/model";

const ICONS: Record<string, LucideIcon> = {
  CalendarClock,
  CarFront,
  ClipboardCheck,
  FileText,
  Files,
  Home,
  Layers,
  MessageSquare,
  Receipt,
  Settings,
  Wrench,
};

export function PortalNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const features = resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES);
  // The portal has no role axis; pricingTools is irrelevant here but the
  // filter signature is shared, so pass it explicitly rather than defaulting.
  const groups = visibleGroups(PORTAL_NAV, {
    features,
    permissions: { pricingTools: true },
  });

  return (
    <nav className="flex flex-col gap-4 px-2">
      {groups.map((group, index) => (
        <div key={group.labelKey ?? `lead-${index}`} className="flex flex-col gap-0.5">
          {group.labelKey && (
            <p className="text-sidebar-foreground/50 px-3 pt-1 pb-1 text-[0.6875rem] font-semibold tracking-wider uppercase">
              {t(`group.${group.labelKey}`)}
            </p>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-sidebar-primary absolute inset-y-1.5 start-0 w-0.5 rounded-full"
                  />
                )}
                {Icon && (
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                    )}
                  />
                )}
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
```

Note the behavioural change this fixes: the old portal component matched every item with `pathname.startsWith(item.href)`, so `/portal/quotes` also lit up any item whose href was a prefix. `isNavItemActive` requires an exact match or a `/`-delimited child, and marks portal home `exact`.

- [ ] **Step 2: Verify**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

Expected: exit 0 for all three. Then signed in as a portal customer: Home and Inspections lead, then MY VEHICLES, SERVICE, SUPPORT — 10 links, 4 sections. Navigate to `/portal/jobs` and confirm Home is **not** also highlighted.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/portal-nav.tsx
git commit -m "Render the portal sidebar from the grouped nav model"
```

---

### Task 6: Dashboard home shows the service pipeline

**Files:**
- Modify: `apps/web/src/app/[locale]/(dashboard)/page.tsx`
- Modify: `apps/web/src/messages/en.json`, `ar.json` (`dashboardHome.pipeline.*`, `dashboardHome.getStarted.startInspection`)

**Interfaces:**
- Consumes: `disabledBannerKey` (already wired in Task 3), `formatNumber` from `@/lib/formatters`, `ACTIVE_JOB_STATUSES` from `@/lib/jobs`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the strings**

`en.json`, inside the existing `dashboardHome` object:

```json
"pipeline": {
  "title": "Your service pipeline",
  "inspectionsToQuote": "Inspections to quote",
  "inspectionsToQuoteHint": "Completed inspections with no quote yet",
  "quotesAwaitingApproval": "Quotes awaiting approval",
  "quotesAwaitingApprovalHint": "Sent to the customer, not yet answered",
  "jobsInProgress": "Jobs in progress",
  "jobsInProgressHint": "Active work on the floor"
}
```

and inside `dashboardHome.getStarted`:

```json
"startInspection": "Start an inspection"
```

`ar.json`, at the same key parity:

```json
"pipeline": {
  "title": "مسار الخدمة لديك",
  "inspectionsToQuote": "فحوصات بانتظار التسعير",
  "inspectionsToQuoteHint": "فحوصات مكتملة بلا عرض سعر بعد",
  "quotesAwaitingApproval": "عروض الأسعار بانتظار الموافقة",
  "quotesAwaitingApprovalHint": "أُرسلت إلى العميل ولم يُرد عليها بعد",
  "jobsInProgress": "مهام قيد التنفيذ",
  "jobsInProgressHint": "أعمال جارية في الورشة"
}
```

and inside its `getStarted`:

```json
"startInspection": "ابدأ فحصًا"
```

Keep `dashboardHome.stats.*` and `dashboardHome.status.*` — the secondary row still uses `stats`.

- [ ] **Step 2: Add the inspections query**

In `apps/web/src/app/[locale]/(dashboard)/page.tsx`, add a sixth entry to the existing `Promise.all`, keeping every existing query unchanged:

```ts
    supabase
      .from("vehicle_inspections")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "completed")
      .is("quotation_id", null),
```

and destructure it as `{ count: inspectionsToQuoteCount }`. The `.eq("business_id", business.id)` scoping is mandatory and matches every sibling query — RLS backs it, but the explicit filter is the house pattern.

- [ ] **Step 3: Replace the stats block with the pipeline**

Replace the `stats` array and the grid that renders it. The pipeline row:

```tsx
const locale = (await getLocale()) === "ar" ? "ar" : "en";

const pipeline = [
  {
    label: t("pipeline.inspectionsToQuote"),
    hint: t("pipeline.inspectionsToQuoteHint"),
    value: inspectionsToQuoteCount ?? 0,
    icon: ClipboardCheck,
    href: "/inspections",
  },
  {
    label: t("pipeline.quotesAwaitingApproval"),
    hint: t("pipeline.quotesAwaitingApprovalHint"),
    value: pendingQuoteCount ?? 0,
    icon: FileCheck2,
    href: "/quotes",
  },
  {
    label: t("pipeline.jobsInProgress"),
    hint: t("pipeline.jobsInProgressHint"),
    value: activeJobCount ?? 0,
    icon: Wrench,
    href: "/jobs",
  },
];

const secondary = [
  { label: t("stats.customers"), value: customerCount ?? 0, icon: Users },
  { label: t("stats.vehicles"), value: vehicleCount ?? 0, icon: CarFront },
  { label: t("stats.openComplaints"), value: openComplaintCount ?? 0, icon: MessageSquareWarning },
];
```

Add `import { getLocale } from "next-intl/server";`, `import { formatNumber } from "@/lib/formatters";`, and `ClipboardCheck` to the existing lucide import.

Render the pipeline as three large linked cards:

```tsx
<section className="flex flex-col gap-3">
  <h2 className="text-muted-foreground text-sm font-medium">{t("pipeline.title")}</h2>
  <div className="grid gap-4 md:grid-cols-3">
    {pipeline.map((stage) => {
      const Icon = stage.icon;
      return (
        <Link key={stage.href} href={stage.href} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardDescription>{stage.label}</CardDescription>
                <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" />
                </span>
              </div>
              <CardTitle className="text-4xl tabular-nums">
                {formatNumber(stage.value, undefined, locale)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">{stage.hint}</span>
            </CardContent>
          </Card>
        </Link>
      );
    })}
  </div>
</section>
```

Render `secondary` in the existing smaller card style at `sm:grid-cols-3`, using `formatNumber(s.value, undefined, locale)` for each value. Drop the `Stat.ready` flag and its `status.live` / `status.laterRelease` line from the rendered output — every number shown is live. Leave the message keys in place.

- [ ] **Step 4: Retarget Get Started**

In the Get Started card, make the primary button:

```tsx
<Link href="/inspections/new" className={cn(buttonVariants({ size: "lg" }), "w-full justify-center")}>
  {t("getStarted.startInspection")}
  <ArrowRight className="rtl:rotate-180" />
</Link>
```

and demote the existing "Add a customer" link to `variant: "secondary"`. Keep "Business settings" as-is and drop "Manage vehicles" from the card (the key stays in the message files).

- [ ] **Step 5: Verify**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Expected: exit 0 for all four, run in that order and never build/typecheck concurrently.

Then check the three counts against the database directly:

```sql
select count(*) from vehicle_inspections
  where business_id = '<your business id>' and status = 'completed' and quotation_id is null;
select count(*) from quotations where business_id = '<id>' and status = 'sent';
```

The page must match. Also load `/ar` and confirm the numbers render in Western digits and the layout mirrors correctly.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[locale]/(dashboard)/page.tsx" apps/web/src/messages/en.json apps/web/src/messages/ar.json
git commit -m "Lead the dashboard home with the inspect-quote-approve-job pipeline"
```

---

### Task 7: Changelog and full validation

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the changelog entry**

Under `## [Unreleased]`, add to the existing `### Added` list:

```markdown
- Phase 1 feature registry (`NEXT_PUBLIC_REVORA_FEATURES`) with a server-side route gate for optional modules.
- Grouped navigation in the business dashboard and customer portal.
```

and add a `### Changed` entry:

```markdown
- The dashboard home now leads with the inspect → quote → approve → job pipeline instead of flat counters.
- Vehicle Intelligence, the retainer calculator, membership bundles, analytics, maintenance reminders and feedback are hidden in phase 1. No code was removed; re-enable them through `NEXT_PUBLIC_REVORA_FEATURES`.
```

- [ ] **Step 2: Run the full validation suite**

```bash
cd apps/web && pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Expected: exit 0 for each, in that order. Record the actual test count in the final report — do not claim a pass that did not run.

- [ ] **Step 3: Confirm nothing was deleted**

```bash
git diff --stat main...HEAD -- ':(exclude)*.md'
```

Expected: no file shows as deleted, and the 13 gated route files show small additive diffs only.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "Record MVP Scope V1 in the changelog"
```
