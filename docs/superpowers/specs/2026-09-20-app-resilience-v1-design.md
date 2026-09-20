# App Resilience V1 — Error Boundaries, Loading States, Faster Loads, Draft Persistence, Error Tracking

**Date:** 2026-09-20
**Status:** Approved design, awaiting implementation plan
**App root:** `apps/web` (Next.js 15.5 App Router, React 19, Supabase, next-intl en/ar)

## 1. Problem

Revora's dashboard, customer portal and root-admin surfaces load all data in
Server Components and mutate through Server Actions. That architecture is
sound, but the user-facing resilience around it is uneven:

| Concern | Today |
|---|---|
| Error boundaries | 10 of 82 page directories have `error.tsx`. `(auth)`, `(onboarding)`, `(legal)` and `i/[token]` have none. Copy is apologetic and generic ("That didn't work as expected"). Boundaries only `console.error`. |
| Loading states | 17 of 82 page directories have `loading.tsx`. Sibling navigations inside a route group (e.g. `/jobs` → `/customers`) show nothing until the server responds. No navigation progress indicator. |
| Load time | The dashboard layout awaits `getCurrentMemberships` and `isSuperAdmin` serially; ~15 pages chain 6–8 sequential Supabase calls where most are independent. Nothing streams. |
| Data persistence | A refresh, back-swipe or session expiry on any create form (new quote, complaint, appointment request, onboarding…) loses everything typed. |
| Error tracking | None. 26 pages `console.error` a failed query and render a generic alert; nothing reaches an operator. |

## 2. Goals

1. Every route renders a specific, confident error boundary when its server
   render throws, and every boundary reports the error.
2. Every route shows an instant skeleton on navigation, and every async
   submit shows a pending state and surfaces its error or its result.
3. Perceived load time drops on the heaviest pages without adding a cache.
4. Create forms survive reload/nav-away on the same device and tenant.
5. Errors reach Sentry when a DSN is configured, with tenant/route context and
   without PII; with no DSN the app behaves exactly as today.

## 3. Non-goals

- Server-side (cross-device) drafts. Offline/PWA caching. UI-preference persistence.
- Any data cache layer (`unstable_cache`, `revalidate`, `"use cache"`). Tenant
  data freshness is more valuable than the milliseconds saved.
- Sentry source-map upload / release tagging (needs an org auth token in
  Vercel — follow-on).
- Restyling forms that already have correct pending/error handling.
- Changes to auth guards (`requireMembership`, `requireCustomerPortal`,
  `requireSuperAdmin`), RLS, middleware or Stripe code.

## 4. Design

### 4.1 Error boundaries and confident copy

**Shared component** `src/components/route-error-boundary.tsx` (client):

```tsx
<RouteErrorBoundary
  error={error} reset={reset}
  section="jobs"            // key under messages.errorPages
  backHref="/"              // optional; omitted for unauthenticated groups
/>
```

- Resolves `errorPages.<section>.{title,description,backLabel}` via
  `useTranslations`; falls back to `errorPages.generic` if the key is absent
  so a missing translation never crashes the boundary itself.
- Renders the existing `ErrorState` (retry button, back link, digest line).
- `useEffect` → `reportError(error, { section, digest: error.digest })`.

**Per-route files.** Every page directory without an `error.tsx` gets one
(≈62 files), each 3–5 lines delegating to `RouteErrorBoundary`. Existing
`error.tsx` files are rewritten to use the same component so behaviour and
copy are uniform. Group-level boundaries are kept and also migrated.

Route groups with no boundary today get one at the group root:

| Group | `backHref` | Copy stance |
|---|---|---|
| `(auth)` | `/login` | Unauthenticated; "sign-in page didn't load", no dashboard link |
| `(onboarding)` | `/onboarding` | Encouraging: setup progress is saved server-side |
| `(legal)` | `/` | Public; suggest refreshing |
| `i/[token]` | none | Public inspection share; suggest re-opening the link |

**Copy rules** (applied to `error.*`, `errorPages.*`, `common.states.*`,
`global-error.tsx`, in both `en.json` and `ar.json`):

1. **Name what failed** — "Jobs didn't load", not "Something went wrong".
2. **Reassure about data** — one clause: "Nothing was lost — your data is safe."
3. **One clear action** — "Try again" is primary; back link is secondary.
4. **Make the reference useful** — "Send us reference `{digest}` and we'll
   fix it fast", not "Reference: …".
5. Never blame the user; never say "unexpected", "oops", or "sorry".

Example (en): *"**Jobs didn't load.** We couldn't reach your jobs list just
now. Nothing was lost — your data is safe on the server. Try again, and if it
keeps happening send us reference `{digest}` so we can fix it fast."*

Arabic copy is written to the same rules, not machine-translated word for
word; the existing `ar.json` voice is the reference.

`global-error.tsx` cannot use next-intl (it replaces the root layout); it keeps
hard-coded English but adopts the same rules and calls `reportError`.

### 4.2 Loading states

**Skeleton variants.** `AppShellLoading` gains `variant?: "stats" | "list" |
"detail" | "form"` (default `"stats"`, so all current call sites are
unchanged):

- `stats` — current layout (4 stat cards + table card).
- `list` — header, toolbar row (search + 2 filter pills), 6 table rows.
- `detail` — header, summary card, two stacked section cards.
- `form` — header, 5 label+input pairs, submit-button block.

Each variant is a pure presentational tree using the existing `SkeletonBlock`
pattern; a `SectionSkeleton` export (a single card of N rows) is added for
Suspense fallbacks in §4.3.

**Per-route files.** Every page directory without a `loading.tsx` gets one
(≈65 files) choosing the variant that matches the page. Title/description
come from a short hard-coded English string as today (loading files render
before translations resolve; this matches the existing convention).

**Navigation progress bar.** `src/components/navigation-progress.tsx`
(client), mounted once in `src/app/[locale]/layout.tsx` inside the providers:

- A fixed 2px bar at the top using the primary colour token, `aria-hidden`,
  `pointer-events-none`; respects `prefers-reduced-motion` (no animation,
  just visible/hidden).
- Pending detection is link-agnostic (55 files import `next/link`, 18 use
  `@/i18n/navigation`; instrumenting one `Link` would miss most navigations):
  a capturing `click` listener on `document` starts pending when the target
  is a same-origin `<a href>` that is not `target="_blank"`, not `download`,
  not a hash-only change, and the click has no modifier keys / non-primary
  button. `popstate` also starts pending. Programmatic `router.replace`
  calls in the admin browsers already change `searchParams`, which ends the
  bar; they are not instrumented separately.
- Ends on any `usePathname()`/`useSearchParams()` change, and on a 8s safety
  timeout so a cancelled navigation never leaves a stuck bar.
- Shows only after a 150ms delay so instant navigations don't flash;
  animates to ~80% then completes.
- No dependency added; ~80 lines.

**Async-action audit.** All 58 client components using
`useActionState`/`useTransition`/`useFormStatus` are checked against three
rules: (a) the submit control is disabled with a spinner while pending (use
`SubmitButton`, or `Loader2` + `disabled` for non-form buttons), (b) an action
error is rendered via `FormError` (`role="alert"`) or `toast.error`, (c) a
success without redirect is acknowledged (toast or inline). Only violations
are changed. Findings are listed in the implementation plan per file.

**Empty-state audit.** Every page rendering a list is checked for an
`EmptyState` when the array is empty; missing ones are added using existing
copy patterns.

### 4.3 Reduce loading periods

**Layout.** `(dashboard)/layout.tsx`: after `requireMembership()` resolves,
`getUser()`, `getCurrentMemberships()` and `isSuperAdmin()` run in one
`Promise.all`. (`(portal)` and `(admin)` layouts already have a single guard
plus a request-cached `getUser`; no change.)

**Pages.** Each page with ≥4 sequential awaits is refactored so that
independent queries run in one `Promise.all` and only genuinely dependent
queries (needing an id from a prior result) stay sequential. Candidates
identified: `portal/page`, `quotations/[id]`, `inspections/new`,
`portal/vehicles/[id]`, `portal/settings`, `portal/quotes`,
`portal/quotes/[id]`, `portal/jobs`, `portal/invoices/[id]`,
`portal/feedback`, `portal/complaints`, `vehicles/[id]`, `quotations`,
`jobs/[id]`, `invoices`. Error handling per query is preserved (each result's
`error` is still checked and reported).

**Streaming.** One page is split so the shell + primary content paint before
secondary data:

| Page | Streams first | Suspense-wrapped |
|---|---|---|
| `(portal)/portal` | header + vehicles/next appointment | recent quotes, invoices, complaints |

Its secondary sections become `async` Server Components rendered under
`<Suspense fallback={<SectionSkeleton rows={n} />}>`. Each keeps its own
query-error branch. Auth guards run once in the page before any Suspense
boundary; child sections receive `business.id`/customer ids as props and
never re-run guards.

The dashboard home and `quotations/[id]` were handled by query
parallelisation instead of streaming: the dashboard home already batches its
counts into a single `Promise.all` and has no secondary section left to
defer, and the quote detail page's approval query drives the header's status
badge directly, so there is no secondary section that could stream in after
the header without the header itself waiting on it.

### 4.4 Draft persistence

**Hook** `src/hooks/use-form-draft.ts`:

```ts
const draft = useFormDraft({ key: "quote:new", scope: business.id, error: state.error });
// draft.ref      -> attach to <form>
// draft.restored -> boolean, true when values were written back on mount
// draft.savedAt  -> Date | null
// draft.discard()-> clears storage and resets the form to defaults
// draft.clear()  -> clears storage only (call on success)
```

Signature: `useFormDraft({ key, scope, error?, enabled? })`. `key` and
`scope` build the storage key; `error` is the current `useActionState` error
message, checked once the form's native `reset` event settles (see below);
`enabled` (default `true`) lets a caller opt a form instance out entirely
(e.g. edit forms) without conditionally calling the hook.

Behaviour:

- Storage key `revora:draft:<scope>:<key>`; value
  `{ v: 1, savedAt: ISO, values: Record<string, string | string[]> }`.
- Serialises `new FormData(form)` on `input` and `change` events, debounced
  400ms. Skips `type=password`, `type=file`, `type=hidden`, and any control
  with `data-no-draft`. Checkbox groups and multi-selects serialise as arrays.
- On mount: reads storage; ignores and deletes drafts older than 7 days or
  with a different `v`; otherwise restores each matching `[name]` control's
  value and sets `restored = true` (see "Restoring values" below).
- **Clear-on-submit, restore-on-error:** a `useActionState` form resets its
  uncontrolled fields via a native `reset` event fired in the same commit
  that delivers the action result — before any passive effect can run — so
  the hook can't tell success from failure at submit time. Instead, the
  form's `submit` handler captures the about-to-be-cleared values into a ref
  and clears storage optimistically; the `reset` event handler then defers to
  a macrotask (by which point the latest `error` from `useActionState` has
  landed via a layout effect) and, only if that error is set, restores both
  the DOM values and the persisted draft from what was captured. A
  successful submit's `reset` leaves storage cleared. `discard()` flags its
  own `form.reset()` to be ignored by this listener and clears the captured
  values so a discard during an in-flight failed submit can't resurrect the
  discarded draft.
- **Restoring values (native setters):** both the on-mount restore and the
  restore-on-error path write through the DOM prototype's `value`/`checked`
  setter (the same path browser autofill takes) rather than assigning
  `el.value` directly, then dispatch `input`/`change` events. This is
  required for Base UI `<Select>`s, whose hidden input only reacts to a
  "real" native value change — a plain `el.value = ...` assignment is
  invisible to it and would leave the visible trigger unsynced with the
  restored value.
- All storage access wrapped in try/catch; a throwing `localStorage`
  (private mode, quota) degrades to no persistence, never an error.
- Cross-tab: no sync; last write wins.

**Banner** `src/components/draft-restored-banner.tsx`: renders the existing
`StatusBanner` with `tone="muted"`, title "Restored your unsaved draft",
children = relative time ("saved 5 minutes ago") + a `Button
variant="ghost" size="sm"` "Discard". i18n keys under `common.draft.*`
(en + ar); relative time via `Intl.RelativeTimeFormat` with the active locale.

**Scope** is the tenant identity so shared devices never leak drafts:
`business.id` for dashboard forms, the customer account id for portal forms,
and `user.id` for onboarding. These are already available in each page and
are passed as a prop.

**Applied to** (create flows only — edit forms are pre-filled from the server
and a stale draft would silently overwrite real data):

| Form | Key |
|---|---|
| `quotations/new/new-quote-form.tsx` | `quote:new` |
| `customers/customer-form.tsx` (when no `customer` prop) | `customer:new` |
| `components/vehicle-form.tsx` (when no `vehicle` prop) | `vehicle:new` |
| `components/complaint-submission-form.tsx` | `complaint:new` |
| `components/feedback-submission-form.tsx` | `feedback:new` |
| `portal/appointments/request-appointment-form.tsx` | `appointment:request` |
| `onboarding/onboarding-form.tsx` | `onboarding` |

Not applied: inspection editor (already persists per tap to the server),
auth forms (credentials), any edit form.

**Tests** `tests/form-draft.test.mjs` (project's `node --test` style) cover
the pure helpers extracted to `src/lib/form-draft.ts`: serialise (skips
sensitive types, arrays for groups), deserialise/validate (version, age
cutoff, malformed JSON), and key construction.

### 4.5 Error tracking (Sentry, env-gated)

**Dependency:** `@sentry/nextjs` (latest 10.x at implementation time).

**Files:**

- `src/instrumentation-client.ts` — browser init, the Next ≥15.3
  bundler-agnostic convention (replaces the deprecated
  `sentry.client.config.ts` webpack-only injection); calls `Sentry.init`
  only when `NEXT_PUBLIC_SENTRY_DSN` is present, with `environment` from
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? NEXT_PUBLIC_VERCEL_ENV ??
  "development"`; `tracesSampleRate: 0`; `sendDefaultPii: false`.
- `sentry.server.config.ts`, `sentry.edge.config.ts` — each calls
  `Sentry.init` only when `SENTRY_DSN` is present; `environment` from
  `SENTRY_ENVIRONMENT ?? VERCEL_ENV ?? "development"`; `tracesSampleRate: 0`
  (errors only in V1); `sendDefaultPii: false`.
- `src/instrumentation.ts` — `register()` imports the server/edge config per
  runtime; `onRequestError = Sentry.captureRequestError` so Server Action and
  RSC render errors are captured with route context.
- `next.config.ts` — wrapped with `withSentryConfig(config, { silent: true,
  widenClientFileUpload: false, sourcemaps: { disable: true } })`, imported
  from the `@sentry/nextjs/config` subpath (avoids the deprecated top-level
  `@sentry/nextjs` import-path warning), **only when `SENTRY_DSN` or
  `NEXT_PUBLIC_SENTRY_DSN` is set at build time**; otherwise the current
  export is returned untouched. The SDK is never initialised or loaded at
  runtime without a DSN; the edge bundle still carries the inert SDK code
  because the Edge bundler inlines dynamic imports (≈80 kB) regardless of
  whether they run, which is accepted.
- `src/lib/observability.ts` — exports:

  ```ts
  reportError(error: unknown, ctx?: { section?: string; route?: string;
    businessId?: string; digest?: string; extra?: Record<string, unknown> })
  ```

  Server and client safe. No DSN → `console.error` with a structured prefix
  (keeps today's behaviour). With DSN → `Sentry.captureException` with tags
  `section`, `route`, `business_id`, `digest`. Never accepts or forwards
  emails, names, phone numbers, plates or VINs; callers pass ids only.

- `beforeSend` (all three configs): drop events whose error is
  `NEXT_REDIRECT` / `NEXT_NOT_FOUND` / `NEXT_HTTP_ERROR_FALLBACK`; strip
  `request.data`, cookies and headers; drop breadcrumbs of category `console`
  that contain an `@`; scrubs `request.url` / `query_string` /
  `contexts.nextjs.request_path` / navigation breadcrumbs (drops query
  strings; redacts `/i/<token>` share paths).

**Call sites:** every `error.tsx` + `global-error.tsx` (via
`RouteErrorBoundary`), and the 26 page-level `console.error("XPage failed to
load", error)` calls become `reportError(error, { section, businessId })`.

**Env:** `.env.local.example` gains commented `SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`. `src/lib/env.ts` gains a
`sentryEnv` block mirroring `stripeEnv` (nullable, never required). No
secrets are committed; the DSN is added in Vercel by the operator.

**CSP:** the existing CSP omits `connect-src`, so Sentry ingest is not
blocked. No header change.

## 5. Data flow summary

```
navigation ──► loading.tsx (instant skeleton) ──► page RSC
                      │                             │  Promise.all(queries)
   NavigationProgress ┘                             ├─ primary content
                                                    └─ <Suspense> secondary
page throws ─────────► error.tsx ─► RouteErrorBoundary ─► ErrorState (copy)
                                              └─► reportError ─► Sentry (if DSN)
form input ──► useFormDraft ──► localStorage[revora:draft:<scope>:<key>]
reload ──────► useFormDraft restores ──► DraftRestoredBanner ──► discard/clear
```

## 6. Testing and verification

**Automated (must pass):** `pnpm lint`, `pnpm typecheck`, `pnpm test`
(including new `form-draft.test.mjs`), `pnpm build` twice — once with no
Sentry env, once with a dummy DSN — and `pnpm smoke:routes`.

**Browser (dev server, recorded as screenshots in the PR):**

1. Force a throw in one dashboard page → boundary shows the new copy, retry
   works, `reportError` logs (no DSN) / event appears (with DSN).
2. Throttle network, navigate `/jobs` → `/customers` → skeleton + progress bar
   appear within 150ms.
3. Type into the new-quote form, reload → values restored with banner;
   Discard clears; successful submit leaves no draft in `localStorage`.
4. Two different business scopes on one device do not see each other's drafts.
5. Dashboard home: header/KPIs render before the activity section resolves.
6. RTL (`/ar`) rendering of the boundary, banner and progress bar.

## 7. Delivery

Branch `feature/resilience-v1` off `main`, five commits in this order so each
is independently revertible:

1. Observability foundation (`reportError`, Sentry configs, env, instrumentation).
2. Error boundaries + copy (en/ar).
3. Loading skeleton variants, `loading.tsx` coverage, progress bar, action/empty audits.
4. Parallelised queries + streaming on the three pages.
5. Draft persistence hook, banner, form wiring, tests.

`CHANGELOG.md` gets an Unreleased entry per commit.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Draft restore overwrites server-provided defaults on an edit form | Hook is only wired in create mode (`!customer`, `!vehicle`), enforced in the plan's per-form checklist. |
| Draft leaks across tenants on a shared shop tablet | Scope key is tenant id; verified in browser test 4. |
| `withSentryConfig` alters build output / bundle when DSN absent | Wrapper applied only when a DSN env var exists; when absent, the SDK is not initialised but the edge bundle contains inert SDK code due to Edge bundler dynamic import inlining (≈80 kB). |
| PII reaches Sentry | `sendDefaultPii: false`, `beforeSend` scrubbing, `reportError` accepts ids only; reviewed in the security pass. |
| `Promise.all` changes error semantics (one rejection fails all) | Supabase client returns `{ data, error }` and never rejects on query errors; only thrown auth errors reject, and those already abort the page. |
| ~130 new small files bloat the tree | All are 3–5 line delegations to two shared components; no logic duplication. |

## 9. Open follow-ons (not in this spec)

- Sentry source maps + release tagging once `SENTRY_AUTH_TOKEN` exists.
- Performance tracing (`tracesSampleRate > 0`) after error volume is understood.
- UI-preference persistence and offline shell (see `docs/PWA_READINESS.md`).
