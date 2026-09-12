# Legal pages — operator guide

The app publishes four bilingual legal documents at `/legal/privacy`, `/legal/terms`,
`/legal/cookies` and `/legal/refunds` (public, no session needed). They are generated
from `apps/web/src/lib/legal/content/*.js` and rendered by
`apps/web/src/app/[locale]/(legal)/legal/[slug]/page.tsx`.

**Everything under `/legal` is a DRAFT until qualified UAE counsel has reviewed it.**
Every page shows a "Draft — pending legal review" banner while
`LEGAL_REVIEW_STATUS === "draft"` in `apps/web/src/lib/legal/index.js`.

## 1. Configure the legal entity (required before go-live)

Set these in Vercel → Project → Environment Variables (and `.env.local` for dev):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME` | Registered name of the company that operates Revora (the trade-licence holder) |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | Registered address |
| `NEXT_PUBLIC_LEGAL_EMAIL` | Mailbox that will actually receive privacy/legal/refund requests |
| `NEXT_PUBLIC_LEGAL_LICENSE` | Trade licence number (optional, shown in the footer) |
| `NEXT_PUBLIC_LEGAL_JURISDICTION` | `mainland`, `difc` or `adgm` — where the entity is registered |

Until the three required values are set, the footer shows a visible
"business details are not configured" hint instead of blank text, on purpose.

> If no licensed entity exists yet, that is itself a compliance gap: operating a
> paid SaaS in the UAE requires a trade licence whose activities cover software /
> IT services. Resolve this before charging customers.

## 2. Counsel review → flip the banner

1. Send counsel the four content files plus [DPA_DRAFT.md](DPA_DRAFT.md) and
   `docs/security/LEGAL_PRIVACY_REVIEW_CHECKLIST.md`.
2. Apply their edits to the content files (both `en` and `ar` — `pnpm test`
   enforces that section counts match).
3. Set `LEGAL_VERSION` to the review date and `LEGAL_REVIEW_STATUS` to
   `"reviewed"` in `apps/web/src/lib/legal/index.js`. Every document's `updated`
   field must equal `LEGAL_VERSION` (tested).

## 3. Changing the text later

- Any wording change → bump `LEGAL_VERSION`. Signup stores the accepted version in
  auth user metadata (`terms_version`), so a bump identifies who needs to re-accept.
  Re-acceptance prompting is not built yet; today a bump is informational.
- Any new third party that receives personal data (analytics, error telemetry,
  a new notification provider) → update Privacy Policy §4, Cookie Policy §2 if it
  sets cookies, the DPA sub-processor list, and `docs/security/PRIVACY_IMPACT_ASSESSMENT.md`.
- If you ever add a non-essential cookie or tracker, the "no cookie banner" position
  in Cookie Policy §3 stops being true — add consent first.

## 4. What is still open (not code)

| Item | Owner | Why it matters |
|---|---|---|
| Supabase region is `ap-northeast-2` (Seoul) | Operator | Cross-border transfer under UAE PDPL Arts. 22–23; cheapest to move before launch |
| Contracts/DPAs with Supabase, Vercel, Stripe, OpenAI, Resend, Twilio | Operator + counsel | Privacy Policy §5 promises "appropriate safeguards" |
| Data subject request procedure | Operator | Policy §7 says requests are handled manually by email; someone must own that mailbox and respond within the legal window |
| Leaked-password protection | Operator | Supabase dashboard toggle (see `docs/security/DEPLOYMENT_SECURITY_CHECKLIST.md`) |
| FTA e-invoicing mandate (phased from 2026) | Product | Invoicing module will need Peppol-style e-invoices for VAT-registered tenants |
| Dashboard/admin hardcoded English strings | Product | Portal-facing strings were localised in this pass; ~40 dashboard/admin strings remain (see `git grep -nE '>[A-Z][a-z]+( [a-z]+){1,4}<' apps/web/src/app/\\[locale\\]/\\(dashboard\\)`) |
