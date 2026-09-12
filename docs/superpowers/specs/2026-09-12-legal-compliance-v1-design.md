# Legal & Compliance Foundation V1 — Design

Date: 2026-09-12
Branch: `feature/legal-compliance` (off `feature/dvi-v1` @ `9055075`)
Status: implemented on `feature/legal-compliance` (2026-09-12); pending counsel review of the drafted text

---

## 1. Problem

Revora processes workshops' customer data (names, phones, plates, VINs, signed approvals, damage photos,
invoices) as a **processor** under the UAE PDPL, and account-holder data as a **controller**, with:

- no privacy notice, terms, cookie disclosure or refund terms anywhere in the app;
- no consent captured at signup, no `marketing_consent` capture, no customer self-service opt-out;
- no business details (legal entity, address, contact) anywhere;
- two over-claims in copy ("no more disputes", "digital signature") and invoices that are not yet FTA
  tax invoices but are not labelled as such;
- a handful of WCAG 2.1 AA failures (contrast, unlabelled controls, invisible focus, unannounced errors);
- 58 `SECURITY DEFINER` RPCs executable by `anon` (all guarded internally, but exposed needlessly);
- privacy docs that name processors (PostHog, Sentry) that do not exist in the code.

The audit that produced this list is in the conversation of 2026-09-12; its facts were verified against the
live Supabase project (`ap-northeast-2`) and Vercel project (no analytics script, no custom domain).

## 2. Goals

- Public, bilingual (EN/AR) Privacy Policy, Terms of Service, Cookie Policy and Refund Policy pages, drafted
  from the **verified** data flows and clearly marked as drafts pending qualified UAE counsel.
- Business details rendered from configuration in every legal surface and the auth layout footer.
- Consent captured where the law expects it: terms/privacy at signup, marketing consent per customer,
  self-service email/SMS opt-out for portal customers.
- Claims corrected; invoice compliance notice; persistent AI advisory notice.
- WCAG fixes for the specific findings.
- Migration hardening the RPC surface and enabling customer-owned preference rows.
- Docs corrected so counsel drafts from facts.

## 3. Non-goals

- Moving the Supabase region (requires a new project + data migration; Operator decision).
- Applying the migration to the remote project (follows `DB_MIGRATION_RELEASE_SOP.md`).
- A tenant DPA as a web page — drafted as `docs/legal/DPA_DRAFT.md` for counsel.
- Self-service data export / account deletion (documented as manual in the policy; product work later).
- Fixing every hardcoded English string in the dashboard/admin (portal-facing ones only).
- Counsel sign-off. Nothing here is legal advice.

## 4. Legal pages

Route group `apps/web/src/app/[locale]/(legal)/legal/` with `layout.tsx` and four pages:
`privacy`, `terms`, `cookies`, `refunds`. Public: `isPublicPath` in `lib/supabase/middleware.ts` gains
`rest.startsWith("/legal")`.

Content lives in `apps/web/src/lib/legal/content/<page>.js` (JS + JSDoc, matching `lib/ratings.js`, so the
`node --test` suite can import it; types in `lib/legal/types.ts`), each exporting
`{ en: LegalDocument, ar: LegalDocument }` where

```ts
type LegalDocument = {
  title: string;
  updated: string;          // ISO date
  intro: string[];
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};
```

`lib/legal/index.js` exports `LEGAL_VERSION` (`"2026-09-12"`), `LEGAL_REVIEW_STATUS`
(`"draft" | "reviewed"`), `LEGAL_CONTENT` (slug → content module), `getLegalDocument(slug, locale)` and
`renderLegalText(text, business)`. Entity-dependent text uses `{entityName}` / `{address}` / `{email}`
tokens substituted at render from `lib/legal/business.js`, so the page always reflects current env; the
test suite rejects unknown tokens.

The layout renders: brand logo, page nav (4 links), the draft banner when `LEGAL_REVIEW_STATUS === "draft"`,
the document, and a footer with business details + "Last updated". `dir`/`lang` come from the locale layout.

## 5. Business details

`lib/legal/business.js` exports `getBusinessDetails()` reading:

| Env var | Meaning | Fallback |
|---|---|---|
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME` | Registered operator of Revora | `[Set NEXT_PUBLIC_LEGAL_ENTITY_NAME]` |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | Registered address | `[Set NEXT_PUBLIC_LEGAL_ADDRESS]` |
| `NEXT_PUBLIC_LEGAL_EMAIL` | Privacy/legal contact | `[Set NEXT_PUBLIC_LEGAL_EMAIL]` |
| `NEXT_PUBLIC_LEGAL_LICENSE` | Trade licence number | omitted when unset |
| `NEXT_PUBLIC_LEGAL_JURISDICTION` | `mainland` / `difc` / `adgm` | `mainland` |

`isConfigured` is true only when the three required values are set; the legal footer shows a visible
"business details not configured" hint otherwise (never blank). `.env.local.example` documents all five
(that file is gitignored in this repo, so `README.md` and `docs/legal/README.md` carry the same list).

Rendered by `components/legal-footer.tsx` in: the auth layout (below the form column), the legal layout,
and the shell account menus (dashboard, portal, admin) as a "Legal" link group.

## 6. Consent

**Signup.** A required checkbox `accept_terms` with links to `/legal/terms` and `/legal/privacy`.
`signUp` rejects when missing (`auth.actions.termsRequired`) and passes
`terms_accepted_at` (ISO) + `terms_version` (`LEGAL_VERSION`) in `options.data`. No schema change.

**Marketing consent.** `customer-form.tsx` gains a `marketing_consent` checkbox (unchecked by default, with
helper text that consent must come from the customer). `validation/customers.js` gains
`marketingConsent: checkbox()` (a `"on"`/absent → boolean preprocess in `common.js`); create/update actions
persist it.

**Portal opt-out.** `notification_preferences` gains policy `notification_preferences_customer_manage_own`
(insert/update/delete where `customer_id` is the caller's linked customer and `user_id is null`).
New server action `savePortalNotificationPreferences` in `(portal)/portal/actions.ts` upserts two rows per
linked account (`channel` in `email|sms`, `template_key null`, `enabled`, `opted_out_at`). A
`PortalNotificationPreferencesForm` client component appears in Portal → Settings replacing the
"Editable customer settings are not enabled yet" copy. The dispatcher already honours these rows.

## 7. Copy and claims

- `auth.layout.digitalApprovalsBody`: "Signed, audited sign-off on every job, so there is a clear record
  if a question comes up." (+ AR)
- `forms.quote.approvalRecorded`: "Your approval is recorded with a timestamp and your typed electronic
  signature." (+ AR)
- Invoice pages (dashboard + portal): `StatusBanner tone="muted"` with `dashboardInvoices.complianceNotice`
  / `portalInvoices.complianceNotice`: generated invoices are structured for UAE VAT but the workshop is
  responsible for confirming FTA tax-invoice requirements.
- AI pages (dashboard 3 + portal health check): `vehicleIntelligence.advisoryNotice` banner.
- `settings/business/page.tsx` logo alt → locale ternary (that page uses inline `locale === "ar"` copy
  throughout rather than message keys).

## 8. Accessibility

| Finding | Fix |
|---|---|
| `text-emerald-600` success text (4 auth clients) | `text-primary` |
| `text-muted-foreground/50` dashboard stat | `text-muted-foreground/80` (3xl text; ≥3:1 large-text threshold with margin) |
| `text-sidebar-foreground/45` auth footer | `/60` |
| `text-sidebar-foreground/50` business switcher | `/60` |
| `outline-none` raw `<select>`/`<input>` (rating form, feedback filters) | add `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` |
| Retainer calculator labels | `htmlFor`/`id` pairs |
| Placeholder-only textareas/search | `<Label>` (visible or `sr-only`) |
| Inline errors | `role="alert"` added to all 50 existing `<p className="text-destructive text-sm">` error paragraphs; new `components/form-error.tsx` for new forms |

## 9. Database (`0038_legal_compliance_hardening.sql`)

1. For every `SECURITY DEFINER` function in `public` except the two inspection share resolvers
   (`resolve_inspection_share(bytea)`, `resolve_inspection_share_items(bytea)` — the intentional anon
   doorway from 0037): snapshot whether `authenticated` / `service_role` could execute it, `revoke execute
   from public, anon` (anon reaches most functions through the implicit PUBLIC grant, not a direct one),
   then re-grant exactly the roles snapshotted. This preserves service-role-only functions such as
   `claim_queued_notification_events`. `alter default privileges` stops anon being re-granted on future
   functions. A `do` block asserts the invariant. Verified on a clone of the local stack:
   `supabase/tests/legal_compliance_tests.sql` (8 checks, all pass).
2. `alter function public.set_updated_at() set search_path = '';` (body uses only `now()` and `new`).
3. The portal preference policy from §6.
4. `comment on` the migration's intent for the SOP reviewer.

Leaked-password protection is an Auth dashboard setting: documented in
`docs/security/DEPLOYMENT_SECURITY_CHECKLIST.md`, not code.

## 10. Docs

- `PRIVACY_IMPACT_ASSESSMENT.md`, `PRIVACY_AND_DATA_GOVERNANCE.md`, `LEGAL_PRIVACY_REVIEW_CHECKLIST.md`,
  `TERMS_PRIVACY_REQUIRED_CLAUSES.md`: remove PostHog/Sentry as live processors (note them as "not
  integrated; re-review before adding"), record Supabase region `ap-northeast-2` and Vercel default region,
  add NHTSA and OpenAI regions, link the new legal pages.
- `docs/legal/DPA_DRAFT.md`: Revora ↔ tenant DPA draft covering scope, sub-processors, security measures,
  DSAR split, breach notice, deletion/return, audit, transfers.
- `docs/legal/README.md`: how to configure business details, flip `LEGAL_REVIEW_STATUS`, bump
  `LEGAL_VERSION`, and what remains for counsel/Operator (region, licence, e-invoicing).
- Delete `apps/web/public/{file,globe,next,vercel,window}.svg`.

## 11. Localization

All new UI strings go in `messages/en.json` + `messages/ar.json` under `legal`, `auth.signup`,
`portalSettings.preferences`, `dashboardInvoices`, `portalInvoices`, `vehicleIntelligence`, `settings`.
Legal document bodies are in the content modules (§4). Portal-facing hardcoded English strings found by
the audit are moved into `messages/*` under their page namespaces.

## 12. Testing

- `tests/legal-content.test.mjs`: every page has both locales, non-empty sections, matching section
  counts, `updated === LEGAL_VERSION`, no `[Set ` placeholders inside document text.
- `tests/legal-business.test.mjs`: fallbacks and `isConfigured`.
- `tests/customer-input-validation.test.mjs`: `marketingConsent` on/absent/garbage.
- `tests/portal-input-validation.test.mjs`: preference payload schema.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` green.

## 13. Release criteria

- All four legal pages render in `/en` and `/ar`, unauthenticated.
- Signup blocked without acceptance; metadata carries version.
- Portal customer can toggle email/SMS; dispatcher skips accordingly (existing unit tests cover
  `preferenceEnabled`).
- Migration reviewed via the SOP before apply.
- Operator has set the five `NEXT_PUBLIC_LEGAL_*` vars and had counsel review before flipping
  `LEGAL_REVIEW_STATUS` to `reviewed`.
