# App Resilience V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every route in Revora has a confident error boundary and an instant skeleton, the heaviest pages load in parallel/stream, create forms survive a reload, and errors reach Sentry when a DSN is configured.

**Architecture:** Next.js 15 App Router segment files (`error.tsx`, `loading.tsx`) delegate to two shared components (`RouteErrorBoundary`, `AppShellLoading`). A single `reportError()` in `src/lib/observability.ts` is the only thing that knows about Sentry. Draft persistence is a DOM-level hook over `localStorage` with the pure serialise/decode logic in a `.js` module so it is unit-testable with `node --test`.

**Tech Stack:** Next.js 15.5.19, React 19.1, TypeScript 5, next-intl 4 (en/ar), Tailwind 4 + shadcn primitives, Supabase SSR, `@sentry/nextjs` 10.x, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-20-app-resilience-v1-design.md`

## Global Constraints

- App root is `apps/web`; run every command from there with `pnpm`.
- Validation order: `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. Never run `typecheck` and `build` concurrently (both run `next typegen` and race on `tsconfig.tsbuildinfo`).
- Every user-visible string is localised in both `src/messages/en.json` and `src/messages/ar.json`, except `global-error.tsx` and `loading.tsx` files (rendered before next-intl is available; hard-coded English is the existing convention).
- Copy rules for error text (spec §4.1): name what failed; one clause reassuring data is safe; one clear action; make the reference useful; never "unexpected", "oops", "sorry".
- Reuse existing components: `ErrorState`, `EmptyState`, `PageHeader`, `Card*`, `Button`/`buttonVariants`, `SubmitButton`, `FormError`, `StatusBanner`, `toast` from `sonner`. No new styling system.
- Never change auth guards (`requireMembership`, `requireCustomerPortal`, `requireSuperAdmin`), RLS, middleware or Stripe code. Guards run once per page, before any `<Suspense>`.
- `reportError` and Sentry never receive emails, names, phones, plates or VINs — ids only. `sendDefaultPii: false`.
- With no Sentry DSN set, runtime behaviour and build output are unchanged from `main`.
- Draft persistence is wired only in create mode; never on a form that receives a server record prop (`customer`, `vehicle`).
- Pure, unit-tested logic lives in `.js` modules with JSDoc under `src/lib` (existing convention: `locale-path.js`, `retainer/*.js`); TS imports them via `allowJs`.
- Branch: `feature/resilience-v1` (already created, contains the spec commit). Commit after every task with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `src/lib/observability.ts` | `reportError()` — the only Sentry touchpoint; console fallback without DSN |
| `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | DSN-gated `Sentry.init` per runtime with shared `beforeSend` scrubbing |
| `src/lib/sentry-shared.ts` | `shouldDropEvent()` + `scrubEvent()` used by all three configs |
| `src/instrumentation.ts` | `register()` + `onRequestError` (server action / RSC errors) |
| `src/components/route-error-boundary.tsx` | Shared client boundary: copy lookup, `ErrorState`, `reportError` |
| `src/components/navigation-progress.tsx` | Top progress bar, link-agnostic pending detection |
| `src/components/draft-restored-banner.tsx` | "Restored your unsaved draft · Discard" |
| `src/lib/form-draft.js` | Pure helpers: key, encode, decode, serialise entries |
| `src/hooks/use-form-draft.ts` | DOM hook: snapshot on input, restore on mount, clear on submit |
| `tests/form-draft.test.mjs`, `tests/observability.test.mjs` | Unit tests |
| `src/app/**/error.tsx` (×62), `src/app/**/loading.tsx` (×65) | 3–5 line delegations |
| `src/app/[locale]/(portal)/portal/_sections/*.tsx` | Async streamed sections for the portal home |

**Modified**

| File | Change |
|---|---|
| `src/lib/env.ts` | `sentryEnv` block |
| `.env.local.example` | Sentry vars, commented |
| `next.config.ts` | Conditional `withSentryConfig` |
| `src/components/app-shell-loading.tsx` | `variant` prop + `SectionSkeleton` |
| `src/app/global-error.tsx`, 10 existing `error.tsx` | Migrate to `RouteErrorBoundary` / `reportError` |
| `src/app/[locale]/layout.tsx` | Mount `<NavigationProgress />` |
| `src/app/[locale]/(dashboard)/layout.tsx` | `Promise.all` after guard |
| `src/messages/en.json`, `src/messages/ar.json` | `error`, `errorPages.*`, `common.states`, `common.draft` |
| 20 page files with `console.error` | → `reportError` |
| 5 client components lacking pending state | → `SubmitButton` |
| `(portal)/portal/page.tsx`, `quotations/[id]/page.tsx`, `jobs/[id]/page.tsx`, `portal/quotes/[id]/page.tsx`, `portal/settings/page.tsx`, `portal/complaints/page.tsx` | Parallel queries / streaming |
| 7 create forms | `useFormDraft` wiring |
| `CHANGELOG.md` | Unreleased entries |

---

### Task 1: `reportError()` foundation and env

**Files:**
- Create: `apps/web/src/lib/observability.ts`
- Create: `apps/web/src/lib/observability-context.js`
- Create: `apps/web/tests/observability.test.mjs`
- Modify: `apps/web/src/lib/env.ts`
- Modify: `apps/web/.env.local.example`

**Interfaces:**
- Produces: `reportError(error: unknown, ctx?: ReportContext): void` where
  `type ReportContext = { section?: string; route?: string; businessId?: string; digest?: string; extra?: Record<string, unknown> }`.
  Produces `buildReportTags(ctx)` (pure, tested) returning `Record<string,string>` with only defined, string-coerced values under keys `section`, `route`, `business_id`, `digest`.
  Produces `sentryEnv = { dsn: string | null; publicDsn: string | null; environment: string }` from `env.ts`.

- [ ] **Step 1: Write the failing test for the pure tag builder**

`apps/web/tests/observability.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { buildReportTags, formatConsoleLine } from "../src/lib/observability-context.js";

test("buildReportTags maps context to snake_case tags and drops undefined", () => {
  assert.deepEqual(
    buildReportTags({ section: "jobs", businessId: "b1", digest: undefined }),
    { section: "jobs", business_id: "b1" },
  );
});

test("buildReportTags returns an empty object for no context", () => {
  assert.deepEqual(buildReportTags(undefined), {});
});

test("buildReportTags never passes through unknown keys (PII guard)", () => {
  assert.deepEqual(
    buildReportTags({ section: "x", email: "a@b.c", customerName: "Sam" }),
    { section: "x" },
  );
});

test("formatConsoleLine is stable and prefixed", () => {
  assert.equal(
    formatConsoleLine({ section: "jobs", route: "/jobs" }),
    "[revora:error] section=jobs route=/jobs",
  );
  assert.equal(formatConsoleLine({}), "[revora:error]");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && node --test tests/observability.test.mjs`
Expected: FAIL — `Cannot find module '.../src/lib/observability-context.js'`

- [ ] **Step 3: Implement the pure module**

`apps/web/src/lib/observability-context.js`:

```js
/**
 * Pure helpers for error reporting. Kept in plain JS so `node --test` can
 * import them directly (see tests/observability.test.mjs).
 *
 * @typedef {{ section?: string; route?: string; businessId?: string; digest?: string }} ReportTagInput
 */

/** Allow-list: only these keys ever become Sentry tags. Ids only, never PII. */
const TAG_MAP = /** @type {const} */ ({
  section: "section",
  route: "route",
  businessId: "business_id",
  digest: "digest",
});

/**
 * @param {ReportTagInput | undefined} ctx
 * @returns {Record<string, string>}
 */
export function buildReportTags(ctx) {
  /** @type {Record<string, string>} */
  const tags = {};
  if (!ctx) return tags;
  for (const [from, to] of Object.entries(TAG_MAP)) {
    const value = /** @type {Record<string, unknown>} */ (ctx)[from];
    if (value !== undefined && value !== null && value !== "") {
      tags[to] = String(value);
    }
  }
  return tags;
}

/**
 * @param {ReportTagInput | undefined} ctx
 * @returns {string}
 */
export function formatConsoleLine(ctx) {
  const parts = Object.entries(buildReportTags(ctx)).map(([k, v]) => `${k}=${v}`);
  return parts.length ? `[revora:error] ${parts.join(" ")}` : "[revora:error]";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && node --test tests/observability.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Add `sentryEnv` to `src/lib/env.ts`**

Append after `openAiEnv`:

```ts
/**
 * Sentry is opt-in: with no DSN every capture is a console fallback and the
 * build is unchanged. `publicDsn` is the browser DSN (NEXT_PUBLIC_), `dsn`
 * is server/edge. Both usually hold the same value.
 */
export const sentryEnv = {
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? null,
  publicDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? null,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
};
```

- [ ] **Step 6: Write `reportError`**

`apps/web/src/lib/observability.ts`:

```ts
import { buildReportTags, formatConsoleLine } from "@/lib/observability-context.js";

export type ReportContext = {
  section?: string;
  route?: string;
  /** Tenant id only — never a business name. */
  businessId?: string;
  digest?: string;
  /** Free-form, non-PII diagnostics (counts, enum values, ids). */
  extra?: Record<string, unknown>;
};

const hasDsn = !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

/**
 * Single entry point for "something failed that a human should know about".
 * Safe on server and client. Without a DSN this is a structured console.error
 * (today's behaviour); with one it also reaches Sentry with ids-only tags.
 */
export function reportError(error: unknown, ctx?: ReportContext): void {
  const tags = buildReportTags(ctx);
  console.error(formatConsoleLine(ctx), error);
  if (!hasDsn) return;

  // Lazy import keeps @sentry/nextjs out of every bundle that never reports.
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      if (ctx?.extra) scope.setContext("extra", ctx.extra);
      Sentry.captureException(error);
    });
  });
}
```

(Until Task 2 installs the dependency, this file will not typecheck — that is expected; Task 2 is committed together with it. Do **not** run `pnpm typecheck` yet.)

- [ ] **Step 7: Document env vars**

Append to `apps/web/.env.local.example`:

```
# --- Error tracking (optional) ---
# Leave empty to disable Sentry entirely (no SDK init, no build plugin).
# Use the same DSN for both; NEXT_PUBLIC_ is what the browser bundle reads.
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
# development | preview | production (defaults to VERCEL_ENV, then "development")
SENTRY_ENVIRONMENT=
```

- [ ] **Step 8: Commit (with Task 2)** — continue to Task 2 before committing.

---

### Task 2: Sentry SDK, runtime configs, instrumentation, conditional build plugin

**Files:**
- Modify: `apps/web/package.json` (via `pnpm add`)
- Create: `apps/web/src/lib/sentry-shared.ts`
- Create: `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`
- Create: `apps/web/src/instrumentation.ts`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: `sentryEnv` from Task 1.
- Produces: nothing imported elsewhere; `reportError` from Task 1 now has a real backend.

- [ ] **Step 1: Install the SDK**

Run: `cd apps/web && pnpm add @sentry/nextjs@^10.75.0`
Expected: `package.json` gains `"@sentry/nextjs": "^10.75.0"`; lockfile updated.

- [ ] **Step 2: Shared scrubbing helpers**

`apps/web/src/lib/sentry-shared.ts`:

```ts
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/** Next.js control-flow "errors" that must never be reported. */
const CONTROL_FLOW_DIGESTS = ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK"];

export function isControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  const message = (error as { message?: unknown }).message;
  return CONTROL_FLOW_DIGESTS.some(
    (code) =>
      (typeof digest === "string" && digest.startsWith(code)) ||
      (typeof message === "string" && message.startsWith(code)),
  );
}

/**
 * Drop control-flow errors, strip request bodies/cookies/headers, and drop
 * console breadcrumbs that look like they contain an email address.
 */
export function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isControlFlowError(hint.originalException)) return null;

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  event.user = undefined;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter(
      (b) => !(b.category === "console" && typeof b.message === "string" && b.message.includes("@")),
    );
  }
  return event;
}
```

- [ ] **Step 3: Runtime configs (DSN-gated)**

`apps/web/sentry.client.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

import { beforeSend } from "@/lib/sentry-shared";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  });
}
```

`apps/web/sentry.server.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

import { sentryEnv } from "@/lib/env";
import { beforeSend } from "@/lib/sentry-shared";

if (sentryEnv.dsn) {
  Sentry.init({
    dsn: sentryEnv.dsn,
    environment: sentryEnv.environment,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  });
}
```

`apps/web/sentry.edge.config.ts`: identical to the server config (copy the file verbatim).

- [ ] **Step 4: Instrumentation hook**

`apps/web/src/instrumentation.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures Server Action and RSC render errors with route context. A no-op
// when Sentry.init never ran (no DSN).
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 5: Conditional build plugin in `next.config.ts`**

Replace the last two lines (`const withNextIntl = ...; export default withNextIntl(nextConfig);`) with:

```ts
const withNextIntl = createNextIntlPlugin();
const configWithIntl = withNextIntl(nextConfig);

// Sentry's webpack plugin is only attached when a DSN exists at build time,
// so a build without Sentry is byte-identical to one on main.
const sentryDsnConfigured = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryDsnConfigured
  ? withSentryConfig(configWithIntl, {
      silent: true,
      widenClientFileUpload: false,
      sourcemaps: { disable: true },
      telemetry: false,
    })
  : configWithIntl;
```

and add at the top: `import { withSentryConfig } from "@sentry/nextjs";`

- [ ] **Step 6: Expose the public environment to the browser config**

In `apps/web/.env.local.example`, under the Sentry block add:

```
# Browser copy of SENTRY_ENVIRONMENT (client bundles only see NEXT_PUBLIC_*).
NEXT_PUBLIC_SENTRY_ENVIRONMENT=
```

- [ ] **Step 7: Validate both build modes**

Run sequentially from `apps/web`:

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all pass (the new `observability.test.mjs` included).

```bash
pnpm build
```
Expected: builds with no Sentry output lines.

```bash
NEXT_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 pnpm build
```
Expected: builds; no attempt to upload source maps (disabled); no failure from the dummy DSN.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/lib/observability.ts apps/web/src/lib/observability-context.js apps/web/src/lib/sentry-shared.ts apps/web/tests/observability.test.mjs apps/web/src/lib/env.ts apps/web/.env.local.example apps/web/sentry.client.config.ts apps/web/sentry.server.config.ts apps/web/sentry.edge.config.ts apps/web/src/instrumentation.ts apps/web/next.config.ts
git commit -m "Add env-gated Sentry error tracking behind reportError()

With no DSN nothing changes: reportError is a structured console.error and
the build plugin is not attached. With a DSN, client/server/edge report
with ids-only tags, request bodies stripped and Next control-flow errors
dropped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `RouteErrorBoundary` component and confident copy (en + ar)

**Files:**
- Create: `apps/web/src/components/route-error-boundary.tsx`
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/ar.json`

**Interfaces:**
- Consumes: `reportError` (Task 1), `ErrorState`.
- Produces:
  ```ts
  export type RouteErrorProps = { error: Error & { digest?: string }; reset: () => void };
  export function RouteErrorBoundary(props: RouteErrorProps & {
    section: string;            // key under messages.errorPages
    backHref?: string;          // omit for unauthenticated groups
    padded?: boolean;           // default true → wraps in <div className="p-6">
  }): JSX.Element;
  ```
  Produces i18n keys `errorPages.generic.*` and `common.states.errorReference` = "Send us reference {digest} and we'll fix it fast."

- [ ] **Step 1: Component**

`apps/web/src/components/route-error-boundary.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { ErrorState } from "@/components/error-state";
import { reportError } from "@/lib/observability";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Shared body for every route-segment error.tsx. Copy is looked up under
 * `errorPages.<section>` and falls back to `errorPages.generic` so a missing
 * key can never crash the boundary that is supposed to be the safety net.
 */
export function RouteErrorBoundary({
  error,
  reset,
  section,
  backHref,
  padded = true,
}: RouteErrorProps & { section: string; backHref?: string; padded?: boolean }) {
  const t = useTranslations("errorPages");

  useEffect(() => {
    reportError(error, { section, digest: error.digest });
  }, [error, section]);

  const key = t.has(`${section}.title`) ? section : "generic";
  const body = (
    <ErrorState
      title={t(`${key}.title`)}
      description={t(`${key}.description`)}
      errorDigest={error.digest}
      onRetry={reset}
      backHref={backHref}
      backLabel={backHref ? t(`${key}.backLabel`) : undefined}
    />
  );
  return padded ? <div className="p-6">{body}</div> : body;
}
```

- [ ] **Step 2: Rewrite the shared copy (en)**

In `apps/web/src/messages/en.json`:

Replace `error`:
```json
"error": {
  "code": "Page didn't load",
  "title": "This page didn't load",
  "description": "We couldn't finish loading this screen. Nothing was lost — your data is safe on the server.",
  "tryAgain": "Try again",
  "backToDashboard": "Back to dashboard",
  "reference": "Send us reference {id} and we'll fix it fast."
}
```

Replace `common.states.errorRetry/errorBack/errorReference`:
```json
"errorRetry": "Try again",
"errorBack": "Go back",
"errorReference": "Send us reference {digest} and we'll fix it fast."
```

Replace the whole `errorPages` object with (existing keys rewritten, new keys added):

```json
"errorPages": {
  "generic": { "title": "This page didn't load", "description": "We couldn't finish loading this screen. Nothing was lost — your data is safe. Try again in a moment.", "backLabel": "Go back" },
  "dashboard": { "title": "Dashboard didn't load", "description": "We couldn't reach your business data just now. Nothing was lost — everything is safe on the server.", "backLabel": "Go to dashboard" },
  "customers": { "title": "Customers didn't load", "description": "We couldn't reach your customer records just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to customers" },
  "vehicles": { "title": "Vehicles didn't load", "description": "We couldn't reach your vehicle records just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to vehicles" },
  "vehicleDetail": { "title": "This vehicle didn't load", "description": "We couldn't open this vehicle's record just now. Nothing was lost — it's safe on the server.", "backLabel": "Back to vehicles" },
  "vehicleNew": { "title": "Add vehicle didn't load", "description": "The form didn't open just now. Nothing was lost — try again and your entry will go through.", "backLabel": "Back to vehicles" },
  "vehicleEdit": { "title": "Edit vehicle didn't load", "description": "The form didn't open just now. Nothing was lost — the vehicle record is unchanged.", "backLabel": "Back to vehicles" },
  "jobs": { "title": "Jobs didn't load", "description": "We couldn't reach your jobs list just now. Nothing was lost — every job is safe on the server.", "backLabel": "Back to jobs" },
  "quotations": { "title": "Quotes didn't load", "description": "We couldn't reach your quotes just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to quotes" },
  "invoices": { "title": "Invoices didn't load", "description": "We couldn't reach your invoices just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to invoices" },
  "appointments": { "title": "Appointments didn't load", "description": "We couldn't reach your appointments just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to appointments" },
  "inspections": { "title": "Inspections didn't load", "description": "We couldn't reach your inspections just now. Nothing was lost — every saved result is on the server.", "backLabel": "Back to inspections" },
  "complaints": { "title": "Complaints didn't load", "description": "We couldn't reach your complaints just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to complaints" },
  "documents": { "title": "Documents didn't load", "description": "We couldn't reach your documents just now. Nothing was lost — every file is safe in storage.", "backLabel": "Go to dashboard" },
  "billing": { "title": "Billing didn't load", "description": "We couldn't reach your billing details just now. Your subscription is unaffected.", "backLabel": "Go to dashboard" },
  "analytics": { "title": "Analytics didn't load", "description": "We couldn't build your analytics just now. Nothing was lost — the underlying records are safe.", "backLabel": "Go to dashboard" },
  "notifications": { "title": "Notifications didn't load", "description": "We couldn't reach your notifications just now. Nothing was lost — they're waiting on the server.", "backLabel": "Go to dashboard" },
  "settings": { "title": "Settings didn't load", "description": "We couldn't open your business settings just now. Nothing has changed — your settings are intact.", "backLabel": "Go to dashboard" },
  "ai": { "title": "AI tools didn't load", "description": "We couldn't open this tool just now. Try again — your vehicles and records are unaffected.", "backLabel": "Go to dashboard" },
  "tools": { "title": "This tool didn't load", "description": "We couldn't open this tool just now. Nothing was lost — try again in a moment.", "backLabel": "Go to dashboard" },
  "implementation": { "title": "Implementation didn't load", "description": "We couldn't open your implementation workspace just now. Nothing was lost — your notes are safe.", "backLabel": "Go to dashboard" },
  "maintenance": { "title": "Maintenance didn't load", "description": "We couldn't reach your maintenance reminders just now. Nothing was lost — they're safe on the server.", "backLabel": "Go to dashboard" },
  "feedback": { "title": "Feedback didn't load", "description": "We couldn't open feedback just now. Nothing was lost — every submission is safe.", "backLabel": "Go to dashboard" },
  "admin": { "title": "Admin didn't load", "description": "We couldn't reach platform data just now. Nothing was lost — try again in a moment.", "backLabel": "Go to admin home" },
  "adminTenants": { "title": "Tenants didn't load", "description": "We couldn't reach the tenant list just now. Nothing was lost — try again in a moment.", "backLabel": "Go to admin home" },
  "adminUsers": { "title": "Users didn't load", "description": "We couldn't reach the user list just now. Nothing was lost — try again in a moment.", "backLabel": "Go to admin home" },
  "adminSubscriptions": { "title": "Subscriptions didn't load", "description": "We couldn't reach subscription data just now. Billing is unaffected.", "backLabel": "Go to admin home" },
  "adminBilling": { "title": "Billing didn't load", "description": "We couldn't reach platform billing just now. Stripe records are unaffected.", "backLabel": "Go to admin home" },
  "adminAnalytics": { "title": "Analytics didn't load", "description": "We couldn't build platform analytics just now. Nothing was lost.", "backLabel": "Go to admin home" },
  "adminNotifications": { "title": "Notifications didn't load", "description": "We couldn't reach platform notifications just now. Nothing was lost.", "backLabel": "Go to admin home" },
  "adminAuditLogs": { "title": "Audit logs didn't load", "description": "We couldn't reach the audit log just now. Every entry is still recorded.", "backLabel": "Go to admin home" },
  "adminSettings": { "title": "Settings didn't load", "description": "We couldn't open platform settings just now. Nothing has changed.", "backLabel": "Go to admin home" },
  "adminAdmins": { "title": "Admins didn't load", "description": "We couldn't reach the admin list just now. Nothing was lost.", "backLabel": "Go to admin home" },
  "portal": { "title": "Portal didn't load", "description": "We couldn't reach your workshop data just now. Nothing was lost — it's safe on the server.", "backLabel": "Go to portal home" },
  "portalJobs": { "title": "Jobs didn't load", "description": "We couldn't reach your jobs just now. Nothing was lost — your workshop still has every detail.", "backLabel": "Back to portal" },
  "portalQuotes": { "title": "Quotes didn't load", "description": "We couldn't reach your quotes just now. Nothing was lost — any approval you gave is recorded.", "backLabel": "Back to portal" },
  "portalInvoices": { "title": "Invoices didn't load", "description": "We couldn't reach your invoices just now. Nothing was lost — they're safe with your workshop.", "backLabel": "Back to portal" },
  "portalAppointments": { "title": "Appointments didn't load", "description": "We couldn't reach your appointments just now. Nothing was lost — your bookings still stand.", "backLabel": "Back to portal" },
  "portalInspections": { "title": "Inspections didn't load", "description": "We couldn't open your inspection reports just now. Nothing was lost — they're safe on the server.", "backLabel": "Back to portal" },
  "portalComplaints": { "title": "Complaints didn't load", "description": "We couldn't reach your complaints just now. Nothing was lost — every message you sent is saved.", "backLabel": "Back to portal" },
  "portalDocuments": { "title": "Documents didn't load", "description": "We couldn't reach your documents just now. Nothing was lost — every file is safe in storage.", "backLabel": "Back to portal" },
  "portalVehicles": { "title": "Vehicles didn't load", "description": "We couldn't reach your vehicles just now. Nothing was lost — your workshop still has every record.", "backLabel": "Back to portal" },
  "portalFeedback": { "title": "Feedback didn't load", "description": "We couldn't open feedback just now. Nothing was lost — anything you already sent is saved.", "backLabel": "Back to portal" },
  "portalMemberships": { "title": "Memberships didn't load", "description": "We couldn't reach your membership details just now. Your plan is unaffected.", "backLabel": "Back to portal" },
  "portalSettings": { "title": "Settings didn't load", "description": "We couldn't open your settings just now. Nothing has changed — your preferences are intact.", "backLabel": "Back to portal" },
  "portalAi": { "title": "Health check didn't load", "description": "We couldn't open the health check just now. Try again — your vehicle records are unaffected.", "backLabel": "Back to portal" },
  "auth": { "title": "Sign-in didn't load", "description": "We couldn't open the sign-in screen just now. Your account is unaffected — refresh to try again.", "backLabel": "Go to sign in" },
  "onboarding": { "title": "Setup didn't load", "description": "We couldn't open setup just now. Your progress so far is saved — try again to pick up where you left off.", "backLabel": "Back to setup" },
  "legal": { "title": "This page didn't load", "description": "We couldn't open this document just now. Refresh to try again.", "backLabel": "Go to home" },
  "share": { "title": "This report didn't open", "description": "We couldn't open the shared inspection just now. The report is safe — re-open the link to try again.", "backLabel": "" }
}
```

- [ ] **Step 3: Rewrite the shared copy (ar)**

In `apps/web/src/messages/ar.json` apply the same structure. `error`:

```json
"error": {
  "code": "لم يتم تحميل الصفحة",
  "title": "لم يتم تحميل هذه الصفحة",
  "description": "لم نتمكن من إكمال تحميل هذه الشاشة. لم يُفقد أي شيء — بياناتك محفوظة على الخادم.",
  "tryAgain": "حاول مرة أخرى",
  "backToDashboard": "العودة إلى لوحة التحكم",
  "reference": "أرسل لنا المرجع {id} وسنصلح الأمر بسرعة."
}
```

`common.states`: `"errorRetry": "حاول مرة أخرى"`, `"errorBack": "رجوع"`, `"errorReference": "أرسل لنا المرجع {digest} وسنصلح الأمر بسرعة."`

`errorPages` — every key from Step 2, written to the same rules. Pattern for each: title `لم يتم تحميل <X>` ; description `لم نتمكن من الوصول إلى <X> الآن. لم يُفقد أي شيء — <reassurance>.` ; backLabel matching the English link. Concretely:

```json
"generic": { "title": "لم يتم تحميل هذه الصفحة", "description": "لم نتمكن من إكمال تحميل هذه الشاشة. لم يُفقد أي شيء — بياناتك محفوظة. حاول مرة أخرى بعد لحظات.", "backLabel": "رجوع" },
"dashboard": { "title": "لم يتم تحميل لوحة التحكم", "description": "لم نتمكن من الوصول إلى بيانات منشأتك الآن. لم يُفقد أي شيء — كل شيء محفوظ على الخادم.", "backLabel": "الذهاب إلى لوحة التحكم" },
"customers": { "title": "لم يتم تحميل العملاء", "description": "لم نتمكن من الوصول إلى سجلات عملائك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى العملاء" },
"vehicles": { "title": "لم يتم تحميل المركبات", "description": "لم نتمكن من الوصول إلى سجلات مركباتك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى المركبات" },
"vehicleDetail": { "title": "لم يتم تحميل هذه المركبة", "description": "لم نتمكن من فتح سجل هذه المركبة الآن. لم يُفقد أي شيء — فهو محفوظ على الخادم.", "backLabel": "العودة إلى المركبات" },
"vehicleNew": { "title": "لم يتم تحميل نموذج إضافة مركبة", "description": "لم يُفتح النموذج الآن. لم يُفقد أي شيء — حاول مرة أخرى وسيتم إدخال بياناتك.", "backLabel": "العودة إلى المركبات" },
"vehicleEdit": { "title": "لم يتم تحميل نموذج تعديل المركبة", "description": "لم يُفتح النموذج الآن. لم يُفقد أي شيء — سجل المركبة لم يتغير.", "backLabel": "العودة إلى المركبات" },
"jobs": { "title": "لم يتم تحميل الأعمال", "description": "لم نتمكن من الوصول إلى قائمة أعمالك الآن. لم يُفقد أي شيء — كل عمل محفوظ على الخادم.", "backLabel": "العودة إلى الأعمال" },
"quotations": { "title": "لم يتم تحميل عروض الأسعار", "description": "لم نتمكن من الوصول إلى عروض أسعارك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى عروض الأسعار" },
"invoices": { "title": "لم يتم تحميل الفواتير", "description": "لم نتمكن من الوصول إلى فواتيرك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى الفواتير" },
"appointments": { "title": "لم يتم تحميل المواعيد", "description": "لم نتمكن من الوصول إلى مواعيدك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى المواعيد" },
"inspections": { "title": "لم يتم تحميل الفحوصات", "description": "لم نتمكن من الوصول إلى فحوصاتك الآن. لم يُفقد أي شيء — كل نتيجة محفوظة على الخادم.", "backLabel": "العودة إلى الفحوصات" },
"complaints": { "title": "لم يتم تحميل الشكاوى", "description": "لم نتمكن من الوصول إلى شكاواك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى الشكاوى" },
"documents": { "title": "لم يتم تحميل المستندات", "description": "لم نتمكن من الوصول إلى مستنداتك الآن. لم يُفقد أي شيء — كل ملف محفوظ في التخزين.", "backLabel": "الذهاب إلى لوحة التحكم" },
"billing": { "title": "لم يتم تحميل الفوترة", "description": "لم نتمكن من الوصول إلى تفاصيل الفوترة الآن. اشتراكك لم يتأثر.", "backLabel": "الذهاب إلى لوحة التحكم" },
"analytics": { "title": "لم يتم تحميل التحليلات", "description": "لم نتمكن من إعداد تحليلاتك الآن. لم يُفقد أي شيء — السجلات الأساسية محفوظة.", "backLabel": "الذهاب إلى لوحة التحكم" },
"notifications": { "title": "لم يتم تحميل الإشعارات", "description": "لم نتمكن من الوصول إلى إشعاراتك الآن. لم يُفقد أي شيء — فهي بانتظارك على الخادم.", "backLabel": "الذهاب إلى لوحة التحكم" },
"settings": { "title": "لم يتم تحميل الإعدادات", "description": "لم نتمكن من فتح إعدادات منشأتك الآن. لم يتغير شيء — إعداداتك سليمة.", "backLabel": "الذهاب إلى لوحة التحكم" },
"ai": { "title": "لم يتم تحميل أدوات الذكاء الاصطناعي", "description": "لم نتمكن من فتح هذه الأداة الآن. حاول مرة أخرى — مركباتك وسجلاتك لم تتأثر.", "backLabel": "الذهاب إلى لوحة التحكم" },
"tools": { "title": "لم يتم تحميل هذه الأداة", "description": "لم نتمكن من فتح هذه الأداة الآن. لم يُفقد أي شيء — حاول مرة أخرى بعد لحظات.", "backLabel": "الذهاب إلى لوحة التحكم" },
"implementation": { "title": "لم يتم تحميل التنفيذ", "description": "لم نتمكن من فتح مساحة التنفيذ الآن. لم يُفقد أي شيء — ملاحظاتك محفوظة.", "backLabel": "الذهاب إلى لوحة التحكم" },
"maintenance": { "title": "لم يتم تحميل الصيانة", "description": "لم نتمكن من الوصول إلى تذكيرات الصيانة الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "الذهاب إلى لوحة التحكم" },
"feedback": { "title": "لم يتم تحميل التقييمات", "description": "لم نتمكن من فتح التقييمات الآن. لم يُفقد أي شيء — كل إرسال محفوظ.", "backLabel": "الذهاب إلى لوحة التحكم" },
"admin": { "title": "لم يتم تحميل لوحة الإدارة", "description": "لم نتمكن من الوصول إلى بيانات المنصة الآن. لم يُفقد أي شيء — حاول مرة أخرى بعد لحظات.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminTenants": { "title": "لم يتم تحميل المستأجرين", "description": "لم نتمكن من الوصول إلى قائمة المستأجرين الآن. لم يُفقد أي شيء.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminUsers": { "title": "لم يتم تحميل المستخدمين", "description": "لم نتمكن من الوصول إلى قائمة المستخدمين الآن. لم يُفقد أي شيء.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminSubscriptions": { "title": "لم يتم تحميل الاشتراكات", "description": "لم نتمكن من الوصول إلى بيانات الاشتراكات الآن. الفوترة لم تتأثر.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminBilling": { "title": "لم يتم تحميل الفوترة", "description": "لم نتمكن من الوصول إلى فوترة المنصة الآن. سجلات Stripe لم تتأثر.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminAnalytics": { "title": "لم يتم تحميل التحليلات", "description": "لم نتمكن من إعداد تحليلات المنصة الآن. لم يُفقد أي شيء.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminNotifications": { "title": "لم يتم تحميل الإشعارات", "description": "لم نتمكن من الوصول إلى إشعارات المنصة الآن. لم يُفقد أي شيء.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminAuditLogs": { "title": "لم يتم تحميل سجلات التدقيق", "description": "لم نتمكن من الوصول إلى سجل التدقيق الآن. كل إدخال ما زال مسجلاً.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminSettings": { "title": "لم يتم تحميل الإعدادات", "description": "لم نتمكن من فتح إعدادات المنصة الآن. لم يتغير شيء.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"adminAdmins": { "title": "لم يتم تحميل المسؤولين", "description": "لم نتمكن من الوصول إلى قائمة المسؤولين الآن. لم يُفقد أي شيء.", "backLabel": "الذهاب إلى الصفحة الرئيسية للإدارة" },
"portal": { "title": "لم يتم تحميل البوابة", "description": "لم نتمكن من الوصول إلى بيانات ورشتك الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "الذهاب إلى الصفحة الرئيسية للبوابة" },
"portalJobs": { "title": "لم يتم تحميل الأعمال", "description": "لم نتمكن من الوصول إلى أعمالك الآن. لم يُفقد أي شيء — ورشتك تحتفظ بكل التفاصيل.", "backLabel": "العودة إلى البوابة" },
"portalQuotes": { "title": "لم يتم تحميل عروض الأسعار", "description": "لم نتمكن من الوصول إلى عروض أسعارك الآن. لم يُفقد أي شيء — أي موافقة قدمتها مسجلة.", "backLabel": "العودة إلى البوابة" },
"portalInvoices": { "title": "لم يتم تحميل الفواتير", "description": "لم نتمكن من الوصول إلى فواتيرك الآن. لم يُفقد أي شيء — فهي محفوظة لدى ورشتك.", "backLabel": "العودة إلى البوابة" },
"portalAppointments": { "title": "لم يتم تحميل المواعيد", "description": "لم نتمكن من الوصول إلى مواعيدك الآن. لم يُفقد أي شيء — حجوزاتك ما زالت قائمة.", "backLabel": "العودة إلى البوابة" },
"portalInspections": { "title": "لم يتم تحميل الفحوصات", "description": "لم نتمكن من فتح تقارير الفحص الآن. لم يُفقد أي شيء — فهي محفوظة على الخادم.", "backLabel": "العودة إلى البوابة" },
"portalComplaints": { "title": "لم يتم تحميل الشكاوى", "description": "لم نتمكن من الوصول إلى شكاواك الآن. لم يُفقد أي شيء — كل رسالة أرسلتها محفوظة.", "backLabel": "العودة إلى البوابة" },
"portalDocuments": { "title": "لم يتم تحميل المستندات", "description": "لم نتمكن من الوصول إلى مستنداتك الآن. لم يُفقد أي شيء — كل ملف محفوظ في التخزين.", "backLabel": "العودة إلى البوابة" },
"portalVehicles": { "title": "لم يتم تحميل المركبات", "description": "لم نتمكن من الوصول إلى مركباتك الآن. لم يُفقد أي شيء — ورشتك تحتفظ بكل سجل.", "backLabel": "العودة إلى البوابة" },
"portalFeedback": { "title": "لم يتم تحميل التقييم", "description": "لم نتمكن من فتح التقييم الآن. لم يُفقد أي شيء — ما أرسلته سابقاً محفوظ.", "backLabel": "العودة إلى البوابة" },
"portalMemberships": { "title": "لم يتم تحميل العضويات", "description": "لم نتمكن من الوصول إلى تفاصيل عضويتك الآن. خطتك لم تتأثر.", "backLabel": "العودة إلى البوابة" },
"portalSettings": { "title": "لم يتم تحميل الإعدادات", "description": "لم نتمكن من فتح إعداداتك الآن. لم يتغير شيء — تفضيلاتك سليمة.", "backLabel": "العودة إلى البوابة" },
"portalAi": { "title": "لم يتم تحميل الفحص الصحي", "description": "لم نتمكن من فتح الفحص الصحي الآن. حاول مرة أخرى — سجلات مركبتك لم تتأثر.", "backLabel": "العودة إلى البوابة" },
"auth": { "title": "لم يتم تحميل تسجيل الدخول", "description": "لم نتمكن من فتح شاشة تسجيل الدخول الآن. حسابك لم يتأثر — حدّث الصفحة للمحاولة مرة أخرى.", "backLabel": "الذهاب إلى تسجيل الدخول" },
"onboarding": { "title": "لم يتم تحميل الإعداد", "description": "لم نتمكن من فتح الإعداد الآن. تقدمك محفوظ — حاول مرة أخرى لتكمل من حيث توقفت.", "backLabel": "العودة إلى الإعداد" },
"legal": { "title": "لم يتم تحميل هذه الصفحة", "description": "لم نتمكن من فتح هذا المستند الآن. حدّث الصفحة للمحاولة مرة أخرى.", "backLabel": "الذهاب إلى الصفحة الرئيسية" },
"share": { "title": "لم يُفتح هذا التقرير", "description": "لم نتمكن من فتح الفحص المشترك الآن. التقرير محفوظ — أعد فتح الرابط للمحاولة مرة أخرى.", "backLabel": "" }
```

- [ ] **Step 4: Verify the JSON is valid and both locales have identical key sets**

Run from `apps/web`:

```bash
node -e '
const en=require("./src/messages/en.json"), ar=require("./src/messages/ar.json");
const keys=o=>Object.keys(o).sort().join(",");
if (keys(en.errorPages)!==keys(ar.errorPages)) { console.error("errorPages key mismatch"); process.exit(1); }
for (const k of Object.keys(en.errorPages)) if (keys(en.errorPages[k])!==keys(ar.errorPages[k])) { console.error("mismatch in", k); process.exit(1); }
console.log("ok", Object.keys(en.errorPages).length, "sections");'
```
Expected: `ok 52 sections`

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck` — Expected: PASS.

```bash
git add apps/web/src/components/route-error-boundary.tsx apps/web/src/messages/en.json apps/web/src/messages/ar.json
git commit -m "Add RouteErrorBoundary and rewrite error copy to be specific and reassuring

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Migrate existing boundaries and `global-error.tsx`

**Files:**
- Modify: `apps/web/src/app/global-error.tsx`, `apps/web/src/app/[locale]/error.tsx`
- Modify (rewrite): the 12 existing route `error.tsx` files:
  `(admin)/error.tsx`, `(dashboard)/error.tsx`, `(dashboard)/analytics/error.tsx`, `(dashboard)/notifications/error.tsx`, `(dashboard)/vehicles/error.tsx`, `(dashboard)/vehicles/[id]/error.tsx`, `(dashboard)/vehicles/[id]/edit/error.tsx`, `(dashboard)/vehicles/new/error.tsx`, `(portal)/error.tsx`, `(portal)/portal/documents/error.tsx`, `(portal)/portal/jobs/error.tsx`, `(portal)/portal/settings/error.tsx`

**Interfaces:**
- Consumes: `RouteErrorBoundary`, `RouteErrorProps`, `reportError`.

- [ ] **Step 1: Rewrite each existing route `error.tsx`**

Each file becomes exactly this shape, with `section`/`backHref` from the table:

```tsx
"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function DashboardError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="dashboard" backHref="/" />;
}
```

| File | export name | section | backHref |
|---|---|---|---|
| `(admin)/error.tsx` | `AdminError` | `admin` | `/admin` |
| `(dashboard)/error.tsx` | `DashboardError` | `dashboard` | `/` |
| `(dashboard)/analytics/error.tsx` | `AnalyticsError` | `analytics` | `/` |
| `(dashboard)/notifications/error.tsx` | `NotificationsError` | `notifications` | `/` |
| `(dashboard)/vehicles/error.tsx` | `VehiclesError` | `vehicles` | `/` |
| `(dashboard)/vehicles/[id]/error.tsx` | `VehicleDetailError` | `vehicleDetail` | `/vehicles` |
| `(dashboard)/vehicles/[id]/edit/error.tsx` | `VehicleEditError` | `vehicleEdit` | `/vehicles` |
| `(dashboard)/vehicles/new/error.tsx` | `VehicleNewError` | `vehicleNew` | `/vehicles` |
| `(portal)/error.tsx` | `PortalError` | `portal` | `/portal` |
| `(portal)/portal/documents/error.tsx` | `PortalDocumentsError` | `portalDocuments` | `/portal` |
| `(portal)/portal/jobs/error.tsx` | `PortalJobsError` | `portalJobs` | `/portal` |
| `(portal)/portal/settings/error.tsx` | `PortalSettingsError` | `portalSettings` | `/portal` |

- [ ] **Step 2: `[locale]/error.tsx` — keep the branded full-page look, add reporting**

Replace the `useEffect` body:

```tsx
useEffect(() => {
  reportError(error, { section: "locale-root", digest: error.digest });
}, [error]);
```

and import `reportError` from `@/lib/observability`. Remove the stale comment. Leave the JSX (it already reads `error.*`, whose copy Task 3 rewrote).

- [ ] **Step 3: `global-error.tsx` — confident copy + reporting**

Replace the `useEffect` with `reportError(error, { section: "global", digest: error.digest });` (import it) and replace the `BrandState` props:

```tsx
<BrandState
  code="Revora didn't load"
  title="Revora didn't load this time"
  description="Something stopped the app from starting. Nothing was lost — your data is safe on the server. Reload to pick up where you were."
>
```

Below the button, add the reference line:

```tsx
{error.digest && (
  <p className="text-muted-foreground/70 mt-1 w-full text-xs">
    Send us reference {error.digest} and we'll fix it fast.
  </p>
)}
```

- [ ] **Step 4: Verify in the browser**

Start the dev server via `preview_start` (add a `.claude/launch.json` entry `{"name":"web","runtimeExecutable":"pnpm","runtimeArgs":["dev"],"port":3000}` under `apps/web` if it does not exist). Temporarily add `throw new Error("boundary check");` as the first line of `VehiclesPage` in `(dashboard)/vehicles/page.tsx`, load `/en/vehicles` signed in, confirm the "Vehicles didn't load" copy, the retry button, the reference line, and a `[revora:error] section=vehicles digest=...` console line. Load `/ar/vehicles` and confirm the Arabic copy renders RTL. **Remove the throw.**

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add apps/web/src/app
git commit -m "Route all existing error boundaries through RouteErrorBoundary and reportError

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `error.tsx` for every remaining page directory

**Files:**
- Create: 62 `error.tsx` files (table below)

**Interfaces:**
- Consumes: `RouteErrorBoundary`, `RouteErrorProps`, `errorPages.*` keys from Task 3.

- [ ] **Step 1: Generate the files from a table**

Run from `apps/web` (the loop writes only where no `error.tsx` exists, so it is safe to re-run):

```bash
gen_error() { # dir section backHref exportName
  local f="src/app/[locale]/$1/error.tsx"
  [ -f "$f" ] && { echo "skip $f"; return; }
  local back=""; [ -n "$3" ] && back=" backHref=\"$3\""
  cat > "$f" <<EOF
"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function $4(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="$2"$back />;
}
EOF
  echo "wrote $f"
}
# admin
gen_error "(admin)/admin/admins" adminAdmins /admin AdminAdminsError
gen_error "(admin)/admin/analytics" adminAnalytics /admin AdminAnalyticsError
gen_error "(admin)/admin/audit-logs" adminAuditLogs /admin AdminAuditLogsError
gen_error "(admin)/admin/billing" adminBilling /admin AdminBillingError
gen_error "(admin)/admin/dashboard" admin /admin AdminDashboardError
gen_error "(admin)/admin/notifications" adminNotifications /admin AdminNotificationsError
gen_error "(admin)/admin/settings" adminSettings /admin AdminSettingsError
gen_error "(admin)/admin/subscriptions" adminSubscriptions /admin AdminSubscriptionsError
gen_error "(admin)/admin/tenants" adminTenants /admin AdminTenantsError
gen_error "(admin)/admin/users" adminUsers /admin AdminUsersError
# auth / onboarding / legal / share (group level)
gen_error "(auth)" auth /login AuthError
gen_error "(onboarding)" onboarding /onboarding OnboardingError
gen_error "(legal)" legal / LegalError
gen_error "i/[token]" share "" ShareError
# dashboard
gen_error "(dashboard)/ai" ai / AiError
gen_error "(dashboard)/ai/dtc-decoder" ai /ai AiDtcError
gen_error "(dashboard)/ai/search" ai /ai AiSearchError
gen_error "(dashboard)/ai/vehicle-diagnosis" ai /ai AiDiagnosisError
gen_error "(dashboard)/ai/vin-decoder" ai /ai AiVinError
gen_error "(dashboard)/appointments" appointments / AppointmentsError
gen_error "(dashboard)/appointments/[id]" appointments /appointments AppointmentDetailError
gen_error "(dashboard)/billing" billing / BillingError
gen_error "(dashboard)/complaints" complaints / ComplaintsError
gen_error "(dashboard)/complaints/[id]" complaints /complaints ComplaintDetailError
gen_error "(dashboard)/customers" customers / CustomersError
gen_error "(dashboard)/customers/[id]" customers /customers CustomerDetailError
gen_error "(dashboard)/customers/new" customers /customers CustomerNewError
gen_error "(dashboard)/documents" documents / DocumentsError
gen_error "(dashboard)/feedback" feedback / FeedbackError
gen_error "(dashboard)/implementation" implementation / ImplementationError
gen_error "(dashboard)/implementation/import-templates" implementation /implementation ImportTemplatesError
gen_error "(dashboard)/inspections" inspections / InspectionsError
gen_error "(dashboard)/inspections/[id]" inspections /inspections InspectionDetailError
gen_error "(dashboard)/inspections/new" inspections /inspections InspectionNewError
gen_error "(dashboard)/invoices" invoices / InvoicesError
gen_error "(dashboard)/invoices/[id]" invoices /invoices InvoiceDetailError
gen_error "(dashboard)/jobs" jobs / JobsError
gen_error "(dashboard)/jobs/[id]" jobs /jobs JobDetailError
gen_error "(dashboard)/maintenance" maintenance / MaintenanceError
gen_error "(dashboard)/quotations" quotations / QuotationsError
gen_error "(dashboard)/quotations/[id]" quotations /quotations QuotationDetailError
gen_error "(dashboard)/quotations/new" quotations /quotations QuotationNewError
gen_error "(dashboard)/quotes" quotations / QuotesAliasError
gen_error "(dashboard)/settings" settings / SettingsError
gen_error "(dashboard)/settings/business" settings /settings BusinessSettingsError
gen_error "(dashboard)/tools/membership-bundles" tools / MembershipBundlesError
gen_error "(dashboard)/tools/retainer-calculator" tools / RetainerCalculatorError
# portal
gen_error "(portal)/portal/ai/health-check" portalAi /portal PortalHealthCheckError
gen_error "(portal)/portal/appointments" portalAppointments /portal PortalAppointmentsError
gen_error "(portal)/portal/appointments/[id]" portalAppointments /portal/appointments PortalAppointmentDetailError
gen_error "(portal)/portal/appointments/new" portalAppointments /portal/appointments PortalAppointmentNewError
gen_error "(portal)/portal/complaints" portalComplaints /portal PortalComplaintsError
gen_error "(portal)/portal/complaints/[id]" portalComplaints /portal/complaints PortalComplaintDetailError
gen_error "(portal)/portal/complaints/new" portalComplaints /portal/complaints PortalComplaintNewError
gen_error "(portal)/portal/feedback" portalFeedback /portal PortalFeedbackError
gen_error "(portal)/portal/inspections" portalInspections /portal PortalInspectionsError
gen_error "(portal)/portal/inspections/[id]" portalInspections /portal/inspections PortalInspectionDetailError
gen_error "(portal)/portal/invoices" portalInvoices /portal PortalInvoicesError
gen_error "(portal)/portal/invoices/[id]" portalInvoices /portal/invoices PortalInvoiceDetailError
gen_error "(portal)/portal/jobs/[id]" portalJobs /portal/jobs PortalJobDetailError
gen_error "(portal)/portal/memberships" portalMemberships /portal PortalMembershipsError
gen_error "(portal)/portal/quotes" portalQuotes /portal PortalQuotesError
gen_error "(portal)/portal/quotes/[id]" portalQuotes /portal/quotes PortalQuoteDetailError
gen_error "(portal)/portal/vehicles" portalVehicles /portal PortalVehiclesError
gen_error "(portal)/portal/vehicles/[id]" portalVehicles /portal/vehicles PortalVehicleDetailError
```

Note: `(dashboard)/dashboard` is a redirect alias, `(dashboard)/page.tsx` is covered by `(dashboard)/error.tsx`, `(portal)/portal/page.tsx` by `(portal)/error.tsx`, `(admin)/admin/page.tsx` by `(admin)/error.tsx`, and the five `(auth)/*` pages by the new `(auth)/error.tsx`.

- [ ] **Step 2: Confirm coverage**

```bash
for p in $(find src/app -name page.tsx); do d=$(dirname "$p"); [ -f "$d/error.tsx" ] || echo "NO-ERROR $p"; done | grep -vE "\(dashboard\)/dashboard/|\(dashboard\)/page|\(portal\)/portal/page|\(admin\)/admin/page|\(auth\)/|\(legal\)/legal|\(onboarding\)/onboarding/page"; echo done
```
Expected: only `done`. (The excluded paths are covered by a group-level `error.tsx` one directory up — `(dashboard)/error.tsx`, `(portal)/error.tsx`, `(admin)/error.tsx`, `(auth)/error.tsx`, `(legal)/error.tsx`, `(onboarding)/error.tsx`.)

- [ ] **Step 3: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add "src/app"
git commit -m "Add a specific error boundary to every route segment

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Route page-level `console.error` through `reportError`

**Files:**
- Modify (20): `(admin)/admin/{admins,audit-logs,billing,notifications,subscriptions,tenants,users}/page.tsx`, `(admin)/admin/page.tsx`, `(dashboard)/{appointments,billing,customers,documents,invoices,jobs,maintenance,notifications,quotations}/page.tsx`, `(dashboard)/tools/retainer-calculator/page.tsx`, `(dashboard)/vehicles/[id]/page.tsx`, `(dashboard)/vehicles/[id]/edit/page.tsx`, `(dashboard)/vehicles/new/page.tsx`, `(portal)/portal/{appointments,documents,invoices,jobs,quotes}/page.tsx`

(Server action files under `actions.ts` are out of scope — their `console.error` sits inside try/catch that returns a user message; `onRequestError` already captures thrown action errors.)

**Interfaces:**
- Consumes: `reportError(error, { section, businessId })`.

- [ ] **Step 1: Mechanical replacement**

In each page, add `import { reportError } from "@/lib/observability";` and change every

```ts
if (error) console.error("CustomersPage failed to load", error);
```

to

```ts
if (error) reportError(error, { section: "customers", businessId: business.id });
```

Section values: use the same `section` string the directory's `error.tsx` uses (Task 5 table). For admin pages omit `businessId`; for portal pages omit `businessId` (customers are scoped by RLS; pass nothing tenant-identifying). For `vehicles/[id]/page.tsx`'s four calls use `extra: { part: "jobs" }` etc. instead of separate message strings:

```ts
if (jobError) reportError(jobError, { section: "vehicleDetail", businessId: business.id, extra: { part: "jobs" } });
```

- [ ] **Step 2: Verify nothing was missed**

```bash
grep -rn "console.error" src/app --include=page.tsx
```
Expected: no output.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/app
git commit -m "Report page query failures through reportError with tenant/section tags

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `AppShellLoading` variants and `SectionSkeleton`

**Files:**
- Modify: `apps/web/src/components/app-shell-loading.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type LoadingVariant = "stats" | "list" | "detail" | "form";
  export function AppShellLoading(props: { title: string; description: string; variant?: LoadingVariant }): JSX.Element;
  export function SectionSkeleton(props: { rows?: number; title?: boolean; className?: string }): JSX.Element;
  ```

- [ ] **Step 1: Rewrite the component**

```tsx
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type LoadingVariant = "stats" | "list" | "detail" | "form";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** One card of placeholder rows — used as a Suspense fallback for streamed sections. */
export function SectionSkeleton({
  rows = 3,
  title = true,
  className,
}: {
  rows?: number;
  title?: boolean;
  className?: string;
}) {
  return (
    <Card className={className} aria-busy="true">
      {title && (
        <CardHeader>
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock key={index} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function StatsBody() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-8 w-16" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <SectionSkeleton rows={3} />
    </>
  );
}

function ListBody() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-9 w-full sm:w-64" />
        <SkeletonBlock className="h-9 w-28" />
        <SkeletonBlock className="h-9 w-28" />
      </div>
      <SectionSkeleton rows={6} title={false} />
    </>
  );
}

function DetailBody() {
  return (
    <>
      <Card>
        <CardHeader className="gap-2">
          <SkeletonBlock className="h-5 w-56 max-w-full" />
          <SkeletonBlock className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </CardContent>
      </Card>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} />
    </>
  );
}

function FormBody() {
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex flex-col gap-5 pt-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ))}
        <SkeletonBlock className="h-10 w-32" />
      </CardContent>
    </Card>
  );
}

const BODY: Record<LoadingVariant, () => React.JSX.Element> = {
  stats: StatsBody,
  list: ListBody,
  detail: DetailBody,
  form: FormBody,
};

export function AppShellLoading({
  title,
  description,
  variant = "stats",
}: {
  description: string;
  title: string;
  variant?: LoadingVariant;
}) {
  const Body = BODY[variant];
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex flex-col gap-6 p-6" role="status" aria-live="polite" aria-label={description}>
        <Body />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck (existing call sites still compile with no `variant`) and commit**

```bash
pnpm typecheck
git add src/components/app-shell-loading.tsx
git commit -m "Add list/detail/form skeleton variants and SectionSkeleton

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: `loading.tsx` for every remaining page directory

**Files:**
- Create: 65 `loading.tsx` files (table below)

**Interfaces:**
- Consumes: `AppShellLoading` with `variant`.

- [ ] **Step 1: Generate from a table**

Run from `apps/web`:

```bash
gen_loading() { # dir variant title description
  local f="src/app/[locale]/$1/loading.tsx"
  [ -f "$f" ] && { echo "skip $f"; return; }
  cat > "$f" <<EOF
import { AppShellLoading } from "@/components/app-shell-loading";

export default function Loading() {
  return <AppShellLoading variant="$2" title="$3" description="$4" />;
}
EOF
  echo "wrote $f"
}
# admin
gen_loading "(admin)/admin/admins" list "Admins" "Loading platform admins..."
gen_loading "(admin)/admin/analytics" stats "Analytics" "Loading platform analytics..."
gen_loading "(admin)/admin/audit-logs" list "Audit logs" "Loading audit entries..."
gen_loading "(admin)/admin/billing" stats "Billing" "Loading platform billing..."
gen_loading "(admin)/admin/dashboard" stats "Admin" "Loading platform overview..."
gen_loading "(admin)/admin/notifications" list "Notifications" "Loading platform notifications..."
gen_loading "(admin)/admin/settings" form "Settings" "Loading platform settings..."
gen_loading "(admin)/admin/subscriptions" list "Subscriptions" "Loading subscriptions..."
gen_loading "(admin)/admin/tenants" list "Tenants" "Loading tenants..."
gen_loading "(admin)/admin/users" list "Users" "Loading users..."
# auth / onboarding / legal / share
gen_loading "(auth)" form "Revora" "Preparing sign in..."
gen_loading "(onboarding)" form "Set up your workshop" "Preparing setup..."
gen_loading "(legal)" detail "Legal" "Loading document..."
gen_loading "i/[token]" detail "Inspection report" "Opening shared report..."
# dashboard
gen_loading "(dashboard)/ai" stats "AI tools" "Loading AI tools..."
gen_loading "(dashboard)/ai/dtc-decoder" form "DTC decoder" "Loading decoder..."
gen_loading "(dashboard)/ai/search" form "AI search" "Loading search..."
gen_loading "(dashboard)/ai/vehicle-diagnosis" form "Vehicle diagnosis" "Loading diagnosis..."
gen_loading "(dashboard)/ai/vin-decoder" form "VIN decoder" "Loading decoder..."
gen_loading "(dashboard)/appointments" list "Appointments" "Loading appointments..."
gen_loading "(dashboard)/appointments/[id]" detail "Appointment" "Loading appointment..."
gen_loading "(dashboard)/customers" list "Customers" "Loading customers..."
gen_loading "(dashboard)/customers/[id]" detail "Customer" "Loading customer..."
gen_loading "(dashboard)/customers/new" form "Add customer" "Loading form..."
gen_loading "(dashboard)/feedback" list "Feedback" "Loading feedback..."
gen_loading "(dashboard)/implementation" detail "Implementation" "Loading implementation workspace..."
gen_loading "(dashboard)/implementation/import-templates" list "Import templates" "Loading templates..."
gen_loading "(dashboard)/inspections/new" form "New inspection" "Loading inspection setup..."
gen_loading "(dashboard)/invoices" list "Invoices" "Loading invoices..."
gen_loading "(dashboard)/invoices/[id]" detail "Invoice" "Loading invoice..."
gen_loading "(dashboard)/jobs/[id]" detail "Job" "Loading job..."
gen_loading "(dashboard)/maintenance" list "Maintenance" "Loading maintenance reminders..."
gen_loading "(dashboard)/quotations" list "Quotes" "Loading quotes..."
gen_loading "(dashboard)/quotations/[id]" detail "Quote" "Loading quote..."
gen_loading "(dashboard)/quotations/new" form "New quote" "Loading form..."
gen_loading "(dashboard)/quotes" list "Quotes" "Loading quotes..."
gen_loading "(dashboard)/settings" form "Settings" "Loading settings..."
gen_loading "(dashboard)/settings/business" form "Business settings" "Loading business settings..."
gen_loading "(dashboard)/tools/membership-bundles" detail "Membership bundles" "Loading bundles..."
gen_loading "(dashboard)/tools/retainer-calculator" form "Retainer calculator" "Loading calculator..."
# portal
gen_loading "(portal)/portal/ai/health-check" form "Health check" "Loading health check..."
gen_loading "(portal)/portal/appointments" list "Appointments" "Loading your appointments..."
gen_loading "(portal)/portal/appointments/[id]" detail "Appointment" "Loading appointment..."
gen_loading "(portal)/portal/appointments/new" form "Request appointment" "Loading form..."
gen_loading "(portal)/portal/complaints" list "Complaints" "Loading your complaints..."
gen_loading "(portal)/portal/feedback" form "Feedback" "Loading feedback..."
gen_loading "(portal)/portal/invoices" list "Invoices" "Loading your invoices..."
gen_loading "(portal)/portal/invoices/[id]" detail "Invoice" "Loading invoice..."
gen_loading "(portal)/portal/memberships" detail "Memberships" "Loading your membership..."
gen_loading "(portal)/portal/vehicles" list "Vehicles" "Loading your vehicles..."
gen_loading "(portal)/portal/vehicles/[id]" detail "Vehicle" "Loading vehicle..."
```

Then set the right variant on the **existing** files that currently default to `stats` but are lists/details: edit these to pass `variant`:

| File | variant |
|---|---|
| `(dashboard)/complaints/loading.tsx` | `list` |
| `(dashboard)/complaints/[id]/loading.tsx` | `detail` |
| `(dashboard)/documents/loading.tsx` | `list` |
| `(dashboard)/inspections/loading.tsx` | `list` |
| `(dashboard)/inspections/[id]/loading.tsx` | `detail` |
| `(dashboard)/jobs/loading.tsx` | `list` |
| `(dashboard)/notifications/loading.tsx` | `list` |
| `(dashboard)/vehicles/loading.tsx` | `list` |
| `(dashboard)/vehicles/[id]/loading.tsx` | `detail` |
| `(dashboard)/vehicles/[id]/edit/loading.tsx`, `vehicles/new/loading.tsx` | `form` |
| `(portal)/portal/complaints/[id]/loading.tsx` | `detail` |
| `(portal)/portal/complaints/new/loading.tsx` | `form` |
| `(portal)/portal/documents/loading.tsx` | `list` |
| `(portal)/portal/inspections/loading.tsx` | `list` |
| `(portal)/portal/inspections/[id]/loading.tsx` | `detail` |
| `(portal)/portal/jobs/loading.tsx`, `quotes/loading.tsx` | `list` |
| `(portal)/portal/jobs/[id]/loading.tsx`, `quotes/[id]/loading.tsx` | `detail` |
| `(portal)/portal/settings/loading.tsx` | `form` |

(Open each; if it renders custom skeleton JSX rather than `AppShellLoading`, leave it as is.)

- [ ] **Step 2: Confirm coverage**

```bash
for p in $(find src/app -name page.tsx); do d=$(dirname "$p"); [ -f "$d/loading.tsx" ] || echo "NO-LOADING $p"; done | grep -vE "\(dashboard\)/dashboard/|\(dashboard\)/page|\(portal\)/portal/page|\(admin\)/admin/page|\(auth\)/|\(legal\)/legal|\(onboarding\)/onboarding/page"; echo done
```
Expected: only `done`. (The excluded paths are covered by a group-level `loading.tsx` one directory up.)

- [ ] **Step 3: Browser check, then commit**

With the dev server running and DevTools network throttled to "Slow 3G", navigate `/en/jobs` → `/en/customers` → `/en/customers/new`. Expected: list skeleton, then form skeleton, each appearing immediately on click. Screenshot one.

```bash
pnpm lint && pnpm typecheck
git add src/app
git commit -m "Add a loading skeleton to every route segment

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Navigation progress bar

**Files:**
- Create: `apps/web/src/components/navigation-progress.tsx`
- Modify: `apps/web/src/app/[locale]/layout.tsx`

**Interfaces:**
- Produces: `<NavigationProgress />` (no props).

- [ ] **Step 1: Component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SHOW_DELAY_MS = 150;
const SAFETY_TIMEOUT_MS = 8000;

/**
 * Returns true when a click will be handled by the Next router as an
 * in-app navigation (so a progress bar is warranted).
 */
function isInAppNavigationClick(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.target as Element | null;
  const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
  if (samePage) return false; // hash-only or no-op
  return true;
}

/**
 * Thin top bar shown while a route transition is in flight. Link-agnostic:
 * it listens for in-app anchor clicks and popstate, and ends on any
 * pathname/searchParams change. Delayed 150ms so instant navigations never
 * flash. Purely decorative (aria-hidden); loading.tsx carries the a11y state.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const pending = useRef(false);
  const showTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    function clearTimers() {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
      showTimer.current = null;
      safetyTimer.current = null;
    }
    function finish() {
      if (!pending.current) return;
      pending.current = false;
      clearTimers();
      setProgress(100);
      window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }
    function start() {
      if (pending.current) return;
      pending.current = true;
      showTimer.current = window.setTimeout(() => {
        setProgress(15);
        setVisible(true);
        window.setTimeout(() => setProgress(80), 20);
      }, SHOW_DELAY_MS);
      safetyTimer.current = window.setTimeout(finish, SAFETY_TIMEOUT_MS);
    }
    function onClick(event: MouseEvent) {
      if (isInAppNavigationClick(event)) start();
    }
    function onPopState() {
      start();
    }
    finishRef.current = finish;
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, []);

  // Any route change (link, popstate, router.replace from a filter) ends the bar.
  useEffect(() => {
    finishRef.current();
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
```

(Add `import { cn } from "@/lib/utils";` to the imports.)

- [ ] **Step 2: Mount it**

In `apps/web/src/app/[locale]/layout.tsx`, import `Suspense` from `react` and `NavigationProgress`, and render inside `ThemeProvider` before `{children}`:

```tsx
<Suspense fallback={null}>
  <NavigationProgress />
</Suspense>
```

(`useSearchParams` requires a Suspense boundary in the App Router.)

- [ ] **Step 3: Browser check**

Throttle to Slow 3G, click between dashboard sections: a 2px primary-coloured bar appears at the top ~150ms after the click and completes on arrival. Click a same-page hash link or ⌘-click a link: no bar. Press browser Back: bar appears. Check `/ar` renders the same.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/components/navigation-progress.tsx "src/app/[locale]/layout.tsx"
git commit -m "Show a top progress bar during route transitions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Pending-state fixes and empty-state audit

**Files:**
- Modify: `src/app/[locale]/(portal)/portal/appointments/cancel-appointment-button.tsx`, `src/app/[locale]/(dashboard)/notifications/notification-read-button.tsx`, `src/components/notification-read-button.tsx`, `src/components/business-rating-form.tsx`, `src/components/complaint-assignment-modal.tsx`
- Possibly modify: `src/app/[locale]/(dashboard)/vehicles/page.tsx`, `src/app/[locale]/(portal)/portal/memberships/page.tsx`

**Interfaces:**
- Consumes: `SubmitButton` (`src/components/submit-button.tsx`, accepts all `Button` props).

- [ ] **Step 1: Swap submit buttons for `SubmitButton` in the five components**

In each file: `import { SubmitButton } from "@/components/submit-button";` and replace the submit `<Button type="submit" ...>` with `<SubmitButton ...>` keeping the same `variant`/`size`/`className`/children. Concretely:

- `cancel-appointment-button.tsx` line 30: `<Button type="submit" variant="outline">` → `<SubmitButton variant="outline">`
- `(dashboard)/notifications/notification-read-button.tsx` line 54 and `components/notification-read-button.tsx` line 54: `<Button type="submit" variant="outline" size="sm">` → `<SubmitButton variant="outline" size="sm">`
- `business-rating-form.tsx` line 85: `<Button type="submit" className="w-fit">` → `<SubmitButton className="w-fit">`
- `complaint-assignment-modal.tsx` line 121: `<Button type="submit" className="w-full sm:w-auto">` → `<SubmitButton className="w-full sm:w-auto">`

Remove the `Button` import only if nothing else in the file uses it (the modal still uses it for its trigger).

- [ ] **Step 2: Re-run the audit**

```bash
for f in $(grep -rlE "useActionState|useTransition" src); do case "$f" in *.tsx) ;; *) continue;; esac; grep -qE "SubmitButton|isPending|pending|disabled=\{" "$f" || echo "NO-PENDING: $f"; done; echo done
```
Expected: only `done`.

- [ ] **Step 3: Empty-state check on the two list pages the heuristic flagged**

Open `(dashboard)/vehicles/page.tsx` and `(portal)/portal/memberships/page.tsx`. For each list rendered from a query result, confirm an empty branch exists. If a list has no empty branch, add:

```tsx
{rows.length === 0 ? (
  <EmptyState title={t("empty.title")} description={t("empty.description")} />
) : ( /* existing list */ )}
```

adding `empty.title`/`empty.description` under that page's namespace in both locale files (e.g. `dashboardVehicles.empty` — "No vehicles yet" / "Add a customer's vehicle to start tracking jobs, quotes and inspections." and the Arabic "لا توجد مركبات بعد" / "أضف مركبة عميل لبدء تتبع الأعمال وعروض الأسعار والفحوصات."). If both pages already handle empty, record "verified, no change" in the commit message.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src
git commit -m "Show pending state on every submit and verify list empty states

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Parallelise the dashboard layout and detail-page queries

**Files:**
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/app/[locale]/(dashboard)/quotations/[id]/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/jobs/[id]/page.tsx`
- Modify: `src/app/[locale]/(portal)/portal/quotes/[id]/page.tsx`
- Modify: `src/app/[locale]/(portal)/portal/settings/page.tsx`
- Modify: `src/app/[locale]/(portal)/portal/complaints/page.tsx`

**Interfaces:** none new. Guards stay first and sequential.

- [ ] **Step 1: Dashboard layout**

Replace lines 22–25 of `(dashboard)/layout.tsx`:

```ts
const { member, business } = await requireMembership();
const [user, memberships, superAdmin] = await Promise.all([
  getUser(),
  getCurrentMemberships(),
  isSuperAdmin(),
]);
```

- [ ] **Step 2: `quotations/[id]/page.tsx` — quote + items in parallel, approval resolved in JS**

Replace lines 67–93 (the three sequential queries) with:

```ts
const [{ data }, { data: itemRows }, { data: approvalRows }] = await Promise.all([
  supabase
    .from("quotations")
    .select(
      "*, customer:customers(full_name, app_user_id, preferred_language), vehicle:vehicles(make, model, plate_number)",
    )
    .eq("business_id", business.id)
    .eq("id", id)
    .maybeSingle(),
  supabase
    .from("quotation_items")
    .select("*")
    .eq("business_id", business.id)
    .eq("quotation_id", id)
    .order("created_at", { ascending: true }),
  supabase
    .from("approvals")
    .select("*")
    .eq("business_id", business.id)
    .eq("quotation_id", id),
]);
if (!data) notFound();
const quote = data as unknown as QuoteWithRelations;
const items = (itemRows ?? []) as QuotationItem[];
// Approvals are per quote version; pick the one for the current version.
const approval =
  ((approvalRows ?? []) as Approval[]).find(
    (row) => row.quotation_version === quote.current_version,
  ) ?? null;
```

Also move `getUser()`, `getLocale()`, `getTranslations(...)` into one `Promise.all` after `requireMembership()`:

```ts
const [user, locale, supabase, t] = await Promise.all([
  getUser(),
  getLocale(),
  createClient(),
  getTranslations("dashboardQuotations.detail"),
]);
```

- [ ] **Step 3: `portal/quotes/[id]/page.tsx` — same shape (no `business_id` filters; RLS scopes)**

Replace lines 54–87 with the parallel version: the quote query, the `quotation_items` query (`.eq("quotation_id", id).order(...)`), and `approvals` (`.eq("quotation_id", id)`), then `if (!data) notFound();`, the existing ownership check **unchanged**, then `items` and the `.find(row => row.quotation_version === quote.current_version)` selection. The ownership `notFound()` must still run before anything from `items`/`approval` is used.

- [ ] **Step 4: `jobs/[id]/page.tsx` — one round trip after the job**

Replace lines 60–95 so the job query stays first (its `notFound()` must gate the rest), then:

```ts
const [{ data: taskRows }, { data: updateRows }, { data: existingInvoice }, attachments] =
  await Promise.all([
    supabase.from("job_tasks").select("*").eq("business_id", business.id).eq("job_id", id).order("created_at", { ascending: true }),
    supabase.from("job_updates").select("*").eq("business_id", business.id).eq("job_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, invoice_number, status").eq("business_id", business.id).eq("job_id", id).maybeSingle(),
    loadJobAttachments(id, "staff"),
  ]);
const tasks = (taskRows ?? []) as JobTask[];
const updates = (updateRows ?? []) as JobUpdate[];
```

- [ ] **Step 5: `portal/settings/page.tsx`**

Read lines 20–60. `getUser()` and `loadPreferenceAccounts(accounts, …)` do not depend on the `data` query at line 27; group all three:

```ts
const [{ data }, user, preferenceAccounts] = await Promise.all([
  supabase.from(/* keep the existing query verbatim */),
  getUser(),
  loadPreferenceAccounts(accounts, t("fallback.workshop")),
]);
```

Keep any `if (error)` handling that existed for the first query.

- [ ] **Step 6: `portal/complaints/page.tsx`**

The `businesses` lookup (line 65) depends on the complaint rows, so it stays sequential. No change beyond confirming this; note it in the commit body.

- [ ] **Step 7: Validate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Load `/en/quotations/<id>`, `/en/jobs/<id>`, `/en/portal/quotes/<id>` (as a customer), `/en/portal/settings` — each renders identically to before. Run `pnpm smoke:routes`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/(dashboard)/layout.tsx" "src/app/[locale]/(dashboard)/quotations/[id]/page.tsx" "src/app/[locale]/(dashboard)/jobs/[id]/page.tsx" "src/app/[locale]/(portal)/portal/quotes/[id]/page.tsx" "src/app/[locale]/(portal)/portal/settings/page.tsx"
git commit -m "Run independent layout and detail-page queries in parallel

Approvals are fetched per quote and matched to current_version in JS so
the approval lookup no longer waits on the quote round trip.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Stream the portal home page

**Files:**
- Create: `src/app/[locale]/(portal)/portal/_sections/pending-quotes-section.tsx`
- Create: `src/app/[locale]/(portal)/portal/_sections/active-jobs-section.tsx`
- Create: `src/app/[locale]/(portal)/portal/_sections/complaints-section.tsx`
- Modify: `src/app/[locale]/(portal)/portal/page.tsx`

(Spec §4.3 also named the dashboard home and `quotations/[id]`. The dashboard home already runs its five count queries in one `Promise.all` and has no secondary data section; `quotations/[id]`'s "secondary" data is the approval, which the header status depends on. Both are covered by Task 11 instead of Suspense — record this deviation in the commit body.)

**Interfaces:**
- Consumes: `SectionSkeleton` (Task 7), `reportError`.
- Produces: three async Server Components each taking `{ customerIds: string[] }`.

- [ ] **Step 1: Create the three section components**

Each moves the query **and** the JSX block it feeds out of `page.tsx` unchanged. Types (`PendingQuote`, `ActiveJob`, `ComplaintRow`) move with their section; `ACTIVE_JOB_STATUSES` and other imports are re-imported.

`_sections/pending-quotes-section.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability";
import type { Quotation } from "@/lib/database.types";
// + every import the moved JSX needs (Link, Card*, Badge, FileCheck2, ArrowRight, formatCurrency, buttonVariants)

type PendingQuote = Pick<Quotation, "id" | "quote_number" | "total" | "currency"> & {
  business: { name: string } | null;
};

export async function PendingQuotesSection({ customerIds }: { customerIds: string[] }) {
  const t = await getTranslations("portalHome");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("id, quote_number, total, currency, business:businesses(name)")
    .eq("status", "sent")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) reportError(error, { section: "portal", extra: { part: "pendingQuotes" } });
  const pendingQuotes = (data ?? []) as unknown as PendingQuote[];
  if (pendingQuotes.length === 0) return null;
  return (
    /* lines 157–191 of the original page.tsx, verbatim */
  );
}
```

`_sections/active-jobs-section.tsx` — same pattern with the `jobs` query (lines 95–101) and JSX lines 195–224; returns `null` when empty.

`_sections/complaints-section.tsx` — the `complaints` query (65–70), the dependent `businesses` lookup (72–78), the `typedComplaints` mapping (80–83), and the JSX card from line 226 to 270 (this one keeps its `EmptyState` branch, so it never returns `null`).

Copy the `PendingQuote`/`ActiveJob`/`ComplaintRow` type definitions from `page.tsx` into the section that uses them and delete them from `page.tsx`.

- [ ] **Step 2: Rewire `page.tsx`**

After the guard and the `accounts.length === 0` early return, `page.tsx` keeps only `customerIds` and renders:

```tsx
import { Suspense } from "react";
import { SectionSkeleton } from "@/components/app-shell-loading";
import { PendingQuotesSection } from "./_sections/pending-quotes-section";
import { ActiveJobsSection } from "./_sections/active-jobs-section";
import { ComplaintsSection } from "./_sections/complaints-section";
// ...
<Suspense fallback={<SectionSkeleton rows={2} />}>
  <PendingQuotesSection customerIds={customerIds} />
</Suspense>
<Suspense fallback={<SectionSkeleton rows={2} />}>
  <ActiveJobsSection customerIds={customerIds} />
</Suspense>
<Suspense fallback={<SectionSkeleton rows={3} />}>
  <ComplaintsSection customerIds={customerIds} />
</Suspense>
```

in place of the three moved blocks. The account cards (lines 115–136) and the AI card (138–154) stay inline — they need no query. Remove `createClient` and the now-unused imports/types from `page.tsx`.

- [ ] **Step 3: Verify**

```bash
pnpm lint && pnpm typecheck
```
In the browser as a portal customer, throttle to Slow 3G and load `/en/portal`: the header, account cards and AI card paint first; three skeleton cards fill in. Content matches the pre-change page. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(portal)/portal"
git commit -m "Stream portal home sections under Suspense

Dashboard home already parallelises its counts and has no secondary
section; quote detail's approval drives header state, so both are handled
by query parallelisation rather than Suspense.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Draft persistence — pure helpers (TDD)

**Files:**
- Create: `apps/web/src/lib/form-draft.js`
- Create: `apps/web/tests/form-draft.test.mjs`

**Interfaces:**
- Produces:
  ```js
  export const DRAFT_VERSION = 1;
  export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  export function draftStorageKey(scope, key) // -> "revora:draft:<scope>:<key>"
  export function serializeDraftEntries(entries, skipNames) // Iterable<[string, string|File-like]>, Set<string> -> Record<string, string|string[]>
  export function encodeDraft(values, now) // -> JSON string {v, savedAt, values}
  export function decodeDraft(raw, now) // -> { savedAt: string, values } | null
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/form-draft.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_MAX_AGE_MS,
  decodeDraft,
  draftStorageKey,
  encodeDraft,
  serializeDraftEntries,
} from "../src/lib/form-draft.js";

test("draftStorageKey namespaces by scope then key", () => {
  assert.equal(draftStorageKey("biz-1", "quote:new"), "revora:draft:biz-1:quote:new");
});

test("serializeDraftEntries keeps strings, groups repeats, skips files and skipped names", () => {
  const fileLike = { name: "photo.jpg", size: 10 };
  const entries = [
    ["title", "Brake pads"],
    ["tags", "a"],
    ["tags", "b"],
    ["photo", fileLike],
    ["password", "hunter2"],
  ];
  assert.deepEqual(serializeDraftEntries(entries, new Set(["password"])), {
    title: "Brake pads",
    tags: ["a", "b"],
  });
});

test("encodeDraft/decodeDraft round-trip", () => {
  const now = Date.parse("2026-09-20T10:00:00Z");
  const raw = encodeDraft({ title: "x" }, now);
  assert.deepEqual(decodeDraft(raw, now + 1000), {
    savedAt: "2026-09-20T10:00:00.000Z",
    values: { title: "x" },
  });
});

test("decodeDraft rejects malformed, wrong version, and stale drafts", () => {
  const now = Date.parse("2026-09-20T10:00:00Z");
  assert.equal(decodeDraft("not json", now), null);
  assert.equal(decodeDraft(JSON.stringify({ v: 99, savedAt: new Date(now).toISOString(), values: {} }), now), null);
  assert.equal(decodeDraft(JSON.stringify({ v: 1, savedAt: "garbage", values: {} }), now), null);
  const stale = encodeDraft({ a: "1" }, now - DRAFT_MAX_AGE_MS - 1);
  assert.equal(decodeDraft(stale, now), null);
  const fresh = encodeDraft({ a: "1" }, now - DRAFT_MAX_AGE_MS + 1000);
  assert.ok(decodeDraft(fresh, now));
});

test("decodeDraft ignores non-string values defensively", () => {
  const now = Date.now();
  const raw = JSON.stringify({ v: 1, savedAt: new Date(now).toISOString(), values: { ok: "1", bad: 5, arr: ["a", 2] } });
  assert.deepEqual(decodeDraft(raw, now)?.values, { ok: "1", arr: ["a"] });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/form-draft.test.mjs` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/web/src/lib/form-draft.js`:

```js
/**
 * Pure helpers behind useFormDraft(). No DOM, no storage — those live in the
 * hook so this file stays unit-testable with `node --test`.
 */

export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {string} scope tenant identity (business id / customer id / user id)
 * @param {string} key form identity, e.g. "quote:new"
 */
export function draftStorageKey(scope, key) {
  return `revora:draft:${scope}:${key}`;
}

/**
 * @param {Iterable<[string, unknown]>} entries FormData entries
 * @param {Set<string>} skipNames field names that must never be persisted
 * @returns {Record<string, string | string[]>}
 */
export function serializeDraftEntries(entries, skipNames) {
  /** @type {Record<string, string | string[]>} */
  const out = {};
  for (const [name, value] of entries) {
    if (skipNames.has(name) || typeof value !== "string") continue;
    const existing = out[name];
    if (existing === undefined) out[name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[name] = [existing, value];
  }
  return out;
}

/**
 * @param {Record<string, string | string[]>} values
 * @param {number} now epoch ms
 */
export function encodeDraft(values, now) {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: new Date(now).toISOString(), values });
}

/**
 * @param {string | null | undefined} raw
 * @param {number} now epoch ms
 * @returns {{ savedAt: string; values: Record<string, string | string[]> } | null}
 */
export function decodeDraft(raw, now) {
  if (!raw) return null;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { v, savedAt, values } = /** @type {{ v?: unknown; savedAt?: unknown; values?: unknown }} */ (parsed);
  if (v !== DRAFT_VERSION || typeof savedAt !== "string") return null;
  const savedMs = Date.parse(savedAt);
  if (Number.isNaN(savedMs) || now - savedMs > DRAFT_MAX_AGE_MS) return null;
  if (!values || typeof values !== "object") return null;

  /** @type {Record<string, string | string[]>} */
  const clean = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string") clean[name] = value;
    else if (Array.isArray(value)) clean[name] = value.filter((item) => typeof item === "string");
  }
  return { savedAt, values: clean };
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `node --test tests/form-draft.test.mjs` — Expected: PASS (5 tests).

```bash
git add src/lib/form-draft.js tests/form-draft.test.mjs
git commit -m "Add pure form-draft helpers with unit tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: `useFormDraft` hook, banner, and i18n

**Files:**
- Create: `apps/web/src/hooks/use-form-draft.ts`
- Create: `apps/web/src/components/draft-restored-banner.tsx`
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/ar.json` (`common.draft`)

**Interfaces:**
- Consumes: Task 13 helpers; `StatusBanner`; `Button`.
- Produces:
  ```ts
  export function useFormDraft(opts: { key: string; scope: string | null | undefined; error?: string | null; enabled?: boolean }): {
    ref: (form: HTMLFormElement | null) => void;
    restored: boolean;
    savedAt: Date | null;
    discard: () => void;
    clear: () => void;
  };
  export function DraftRestoredBanner(props: { savedAt: Date | null; onDiscard: () => void; className?: string }): JSX.Element;
  ```

- [ ] **Step 1: Hook**

`apps/web/src/hooks/use-form-draft.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  decodeDraft,
  draftStorageKey,
  encodeDraft,
  serializeDraftEntries,
} from "@/lib/form-draft.js";

const DEBOUNCE_MS = 400;
const NEVER_PERSIST_TYPES = new Set(["password", "file", "hidden"]);

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota: degrade to no persistence */
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function skipNamesFor(form: HTMLFormElement): Set<string> {
  const skip = new Set<string>();
  for (const el of Array.from(form.elements)) {
    const input = el as HTMLInputElement;
    if (!input.name) continue;
    if (NEVER_PERSIST_TYPES.has(input.type) || input.hasAttribute("data-no-draft")) {
      skip.add(input.name);
    }
  }
  return skip;
}

function applyValues(form: HTMLFormElement, values: Record<string, string | string[]>) {
  for (const [name, value] of Object.entries(values)) {
    const controls = Array.from(form.elements).filter(
      (el) => (el as HTMLInputElement).name === name,
    ) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];
    if (controls.length === 0) continue;
    const wanted = Array.isArray(value) ? value : [value];
    for (const control of controls) {
      const input = control as HTMLInputElement;
      if (input.type === "checkbox" || input.type === "radio") {
        input.checked = wanted.includes(input.value);
      } else if (control instanceof HTMLSelectElement && control.multiple) {
        for (const option of Array.from(control.options)) option.selected = wanted.includes(option.value);
      } else {
        control.value = wanted[0] ?? "";
      }
      // Let any React-observed state (controlled selects, char counters) catch up.
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

/**
 * Persists an uncontrolled <form>'s values to localStorage so a reload or
 * nav-away doesn't lose typed work. Scope by tenant id so shared devices
 * never leak drafts across businesses/customers.
 *
 * - Snapshot on input/change (debounced).
 * - Restore on mount; `restored` flips true so the caller can show a banner.
 * - Clear on submit; if `error` arrives afterwards, re-snapshot so the draft
 *   survives a failed submit + reload.
 */
export function useFormDraft({
  key,
  scope,
  error,
  enabled = true,
}: {
  key: string;
  scope: string | null | undefined;
  /** The action's current error message; a change re-saves the draft. */
  error?: string | null;
  enabled?: boolean;
}) {
  const storageKey = scope && enabled ? draftStorageKey(scope, key) : null;
  const formRef = useRef<HTMLFormElement | null>(null);
  const timer = useRef<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const snapshot = useCallback(() => {
    const form = formRef.current;
    if (!form || !storageKey) return;
    const values = serializeDraftEntries(new FormData(form).entries(), skipNamesFor(form));
    if (Object.values(values).every((v) => (Array.isArray(v) ? v.length === 0 : v === ""))) {
      safeRemove(storageKey);
      return;
    }
    safeSet(storageKey, encodeDraft(values, Date.now()));
  }, [storageKey]);

  const clear = useCallback(() => {
    if (storageKey) safeRemove(storageKey);
  }, [storageKey]);

  const discard = useCallback(() => {
    clear();
    formRef.current?.reset();
    setRestored(false);
    setSavedAt(null);
  }, [clear]);

  // React 19 ref callbacks may return a cleanup; it runs when the form
  // unmounts or when this callback's identity changes (new scope/key).
  const ref = useCallback(
    (form: HTMLFormElement | null) => {
      formRef.current = form;
      if (!form || !storageKey) return;

      const draft = decodeDraft(safeGet(storageKey), Date.now());
      if (draft) {
        applyValues(form, draft.values);
        setRestored(true);
        setSavedAt(new Date(draft.savedAt));
      } else {
        safeRemove(storageKey); // purge stale / invalid
      }

      const onEdit = () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(snapshot, DEBOUNCE_MS);
      };
      const onSubmit = () => {
        if (timer.current) window.clearTimeout(timer.current);
        clear();
      };
      form.addEventListener("input", onEdit);
      form.addEventListener("change", onEdit);
      form.addEventListener("submit", onSubmit);
      return () => {
        form.removeEventListener("input", onEdit);
        form.removeEventListener("change", onEdit);
        form.removeEventListener("submit", onSubmit);
        if (timer.current) window.clearTimeout(timer.current);
      };
    },
    [storageKey, snapshot, clear],
  );

  // A failed submit cleared the draft on submit; put it back so a reload
  // after the error still restores what was typed.
  useEffect(() => {
    if (error) snapshot();
  }, [error, snapshot]);

  return { ref, restored, savedAt, discard, clear };
}
```

- [ ] **Step 2: Banner**

`apps/web/src/components/draft-restored-banner.tsx`:

```tsx
"use client";

import { History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";

export function DraftRestoredBanner({
  savedAt,
  onDiscard,
  className,
}: {
  savedAt: Date | null;
  onDiscard: () => void;
  className?: string;
}) {
  const t = useTranslations("common.draft");
  const format = useFormatter();
  return (
    <StatusBanner tone="muted" icon={History} title={t("restoredTitle")} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{savedAt ? t("savedAgo", { when: format.relativeTime(savedAt) }) : t("savedRecently")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          {t("discard")}
        </Button>
      </div>
    </StatusBanner>
  );
}
```

(`StatusBanner` renders `children` under the title; confirm its `children` slot accepts a block element — it does, per `src/components/status-banner.tsx`.)

- [ ] **Step 3: i18n**

Add under `common` in `en.json`:

```json
"draft": {
  "restoredTitle": "Restored your unsaved draft",
  "savedAgo": "Saved {when}. Keep going, or discard it to start fresh.",
  "savedRecently": "Saved a moment ago. Keep going, or discard it to start fresh.",
  "discard": "Discard draft"
}
```

and in `ar.json`:

```json
"draft": {
  "restoredTitle": "استعدنا مسودتك غير المحفوظة",
  "savedAgo": "حُفظت {when}. تابع، أو تجاهلها لتبدأ من جديد.",
  "savedRecently": "حُفظت قبل لحظات. تابع، أو تجاهلها لتبدأ من جديد.",
  "discard": "تجاهل المسودة"
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/hooks/use-form-draft.ts src/components/draft-restored-banner.tsx src/messages/en.json src/messages/ar.json
git commit -m "Add useFormDraft hook and DraftRestoredBanner

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Wire drafts into the seven create forms

**Files:**
- Modify: `src/app/[locale]/(dashboard)/quotations/new/new-quote-form.tsx` + `quotations/new/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/customers/customer-form.tsx` + `customers/new/page.tsx`
- Modify: `src/components/vehicle-form.tsx` + `(dashboard)/vehicles/new/page.tsx`
- Modify: `src/components/complaint-submission-form.tsx`
- Modify: `src/components/feedback-submission-form.tsx`
- Modify: `src/app/[locale]/(portal)/portal/appointments/request-appointment-form.tsx`
- Modify: `src/app/[locale]/(onboarding)/onboarding/onboarding-form.tsx` + `onboarding/page.tsx`

**Interfaces:**
- Consumes: `useFormDraft`, `DraftRestoredBanner`.

For each form the pattern is identical:

```tsx
import { useFormDraft } from "@/hooks/use-form-draft";
import { DraftRestoredBanner } from "@/components/draft-restored-banner";
// inside the component, after useActionState:
const draft = useFormDraft({ key: "<key>", scope: <scope>, error: state.error, enabled: <createMode> });
// on the <form>:
<form ref={draft.ref} action={formAction} ...>
  {draft.restored && <DraftRestoredBanner savedAt={draft.savedAt} onDiscard={draft.discard} />}
```

- [ ] **Step 1: New quote**

`new-quote-form.tsx`: add prop `businessId: string`; `useFormDraft({ key: "quote:new", scope: businessId, error: state.error })`. In `quotations/new/page.tsx` pass `businessId={business.id}` (the page already has `business` from `requireMembership()`).

- [ ] **Step 2: Customer form (create only)**

`customer-form.tsx`: add optional prop `draftScope?: string`; `useFormDraft({ key: "customer:new", scope: draftScope, error: state.error, enabled: !customer })`. In `customers/new/page.tsx` pass `draftScope={business.id}` (add `const { business } = await requireMembership();` if the page doesn't already destructure it). The `[id]` edit page passes nothing, so `scope` is undefined and the hook is inert.

- [ ] **Step 3: Vehicle form (create only)**

`vehicle-form.tsx`: add optional prop `draftScope?: string`; `useFormDraft({ key: "vehicle:new", scope: draftScope, error: state.error, enabled: !vehicle })`. `vehicles/new/page.tsx` passes `draftScope={business.id}`; the edit page passes nothing.

The customer `<select>` in this form drives `selectedCustomerId` state via `onChange`; the hook dispatches `change` after restoring, so the derived state updates. Verify in the browser that a restored customer selection shows the right locked/derived UI.

- [ ] **Step 4: Complaint submission (portal)**

`complaint-submission-form.tsx`: scope is the first linked customer: `useFormDraft({ key: "complaint:new", scope: accounts[0]?.customer_id, error: state.error })`.

- [ ] **Step 5: Feedback submission**

`feedback-submission-form.tsx` already has a `formRef`; merge: keep `formRef` for its existing use and add a callback that assigns both:

```tsx
const draft = useFormDraft({ key: "feedback:new", scope: businessId ?? accounts?.[0]?.businessId, error: state.error });
const setFormRef = (el: HTMLFormElement | null) => { formRef.current = el; draft.ref(el); };
<form ref={setFormRef} ...>
```

The hidden `business_id` inputs are skipped automatically (`type=hidden`).

- [ ] **Step 6: Request appointment (portal)**

`request-appointment-form.tsx`: `useFormDraft({ key: "appointment:request", scope: accounts[0]?.customerId, error: state.error })`. Check the exact field name on `AccountOption` (line ~21 shows `businessId`; use the customer id field if present, otherwise `businessId`).

- [ ] **Step 7: Onboarding**

`onboarding-form.tsx`: add prop `userId: string`; `useFormDraft({ key: "onboarding", scope: userId, error: state.error })`. In `onboarding/page.tsx` pass `userId={user.id}` (`user` is already loaded at line 20).

- [ ] **Step 8: Browser verification (the spec's tests 3 and 4)**

1. `/en/quotations/new`: type a title/notes, reload → banner appears, values present. Click "Discard draft" → form empty, `localStorage` key gone. Type again, submit successfully → redirected, and `localStorage` has no `revora:draft:` key for that form.
2. Trigger a validation error on `/en/customers/new` (submit empty name), reload → typed values still restored.
3. Switch active business via the business switcher, open `/en/customers/new` → no banner (different scope).
4. `/en/vehicles/<id>/edit`: type, reload → **no** banner, server values shown.
5. `/ar/portal/complaints/new`: banner renders RTL with Arabic copy.

- [ ] **Step 9: Lint, typecheck, test, commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src
git commit -m "Persist create-form drafts to localStorage, scoped per tenant

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Changelog, full validation, and branch wrap-up

**Files:**
- Modify: `CHANGELOG.md` (repo root)

- [ ] **Step 1: Changelog**

Under the `## [Unreleased]` heading (create it above the newest release if absent), add:

```markdown
### Added
- Env-gated Sentry error tracking behind a single `reportError()` helper; no-op without a DSN.
- Error boundary on every route segment with specific, reassuring copy (en/ar).
- Loading skeleton on every route segment, skeleton variants, and a navigation progress bar.
- Draft persistence for create forms (quote, customer, vehicle, complaint, feedback, appointment request, onboarding), scoped per tenant.

### Changed
- Dashboard layout and quote/job detail pages run independent queries in parallel; portal home streams its sections.
- Every submit button shows a pending state.
```

- [ ] **Step 2: Full validation, sequentially**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
NEXT_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 pnpm build
pnpm smoke:routes
```
Expected: every command exits 0. Record the outputs.

- [ ] **Step 3: Final browser pass** — re-run spec §6 items 1, 2, 5 and 6 once on the final build (`pnpm start` after `pnpm build`, or the dev server) and keep the screenshots for the PR.

- [ ] **Step 4: Commit and hand off**

```bash
git add CHANGELOG.md
git commit -m "Record App Resilience V1 in the changelog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then invoke `superpowers:finishing-a-development-branch` to decide on PR/merge. Do not push without the user's go-ahead.

---

## Self-review notes

- **Spec coverage:** §4.1 → Tasks 3–5; §4.2 → Tasks 7–10; §4.3 → Tasks 11–12 (with the recorded deviation for dashboard home / quote detail streaming); §4.4 → Tasks 13–15; §4.5 → Tasks 1–2 and 6; §6/§7 → Task 16. Spec §4.2's EmptyState audit is Task 10 Step 3.
- **Type consistency:** `RouteErrorProps` (Task 3) is what Tasks 4–5 import; `LoadingVariant`/`SectionSkeleton` (Task 7) are what Tasks 8 and 12 use; `useFormDraft`'s return `{ ref, restored, savedAt, discard, clear }` (Task 14) matches Task 15's usage; `reportError(error, { section, businessId, digest, extra })` is used identically in Tasks 3, 4, 6, 12.
- **Known judgement calls left to the implementer:** exact `AccountOption` field name in Task 15 Step 6; whether the two list pages in Task 10 Step 3 already have empty branches.
