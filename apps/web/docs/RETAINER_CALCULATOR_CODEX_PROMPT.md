# Service Retainer Pricing Calculator — Codex Execution Brief

Hand-off pack for building the **Service Retainer Pricing Calculator** module in
Revora (`apps/web`). Paste **Part 1** to Codex as the task. Parts 2–5 are exact
contracts/skeletons to remove ambiguity. Part 6 is the human operator runbook.

> Authoring note: the original feature brief was written against assumptions that
> do not match this repo (it references `tenants`/`quotes` tables, timestamped
> migrations, a `/dashboard/...` URL, and PostHog/Sentry/Recharts/PDF libraries
> that are **not installed**). Part 1 §1 "Ground truth" corrects all of these.
> Where the brief and Ground Truth conflict, **Ground Truth wins.**

---

## Part 1 — The Codex prompt

**From:** CEO + Senior Engineering Manager, Revora · **To:** Codex (implementing engineer)
**Mandate:** Ship this module to production quality inside `apps/web`, matching
Revora conventions exactly. The decisions below are final.

### 0. Definition of done
A business owner/manager opens `/en/tools/retainer-calculator` (and `/ar/...`),
builds a costed monthly retainer with live pricing, saves/duplicates/compares
scenarios, generates Essential/Growth/Premium tiers, converts a scenario into a
real quotation, and exports a print-ready PDF — all tenant-isolated by RLS, fully
bilingual (EN/AR) with Western-digit money, and **green on `lint`, `build`,
`typecheck`, `test`**. Unauthorized roles and customers are blocked. No
regressions to auth, RLS, middleware, webhook, or existing modules. If it isn't
tenant-safe, server-recomputed, bilingual, and test-covered, it isn't done.

### 1. Ground truth (use these; they override the brief)
- App: `apps/web` (Next.js 15 App Router, TS, Tailwind, shadcn/ui, Supabase,
  next-intl, Zod v4). No new app.
- **No `tenants` table / no `tenant_id`.** `business_id` IS the tenant boundary.
- **No `quotes` table** — it's `public.quotations` (+ `public.quotation_items`).
  Scenario FK: `quote_id → public.quotations(id)`.
- `created_by` references `public.profiles(id)` (matches `quotations`).
- Route groups are not in the URL. File
  `apps/web/src/app/[locale]/(dashboard)/tools/retainer-calculator/page.tsx` ⇒
  URL `/en/tools/retainer-calculator` & `/ar/...`. `[locale]` canonical; `/`→`/en`.
- Migrations are **sequential**; latest applied is `0024`. Create exactly
  `supabase/migrations/0025_retainer_pricing_scenarios.sql`. Never edit 0001–0024.
- Reuse DB primitives: trigger `public.set_updated_at()` (BEFORE UPDATE, see 0024);
  business RLS helper `public.has_business_role(target_business_id uuid,
  allowed_roles public.member_role[])` (0002); cross-tenant super-admin via
  `public.is_platform_admin()` (0009, table `public.platform_admins`).
- Roles: `member_role` = `super_admin, business_owner, manager, employee,
  customer`. **No `service_advisor` role, no granular permission system**
  ("service advisor" = `employee`). Auth: `requireMembership()` → `{ member,
  business }`; `getUser()`. Role gates in `src/lib/permissions.ts`.
- **NOT installed** (do not assume): PostHog, Sentry, Recharts, any PDF lib,
  `stripe` SDK. See §3.
- Money/i18n: all currency/number/date via `src/lib/formatters.ts`
  (`formatCurrency(value, currency)`, `formatNumber`, `formatDate` — forced
  `latn` digits). Server totals helper `src/lib/money.ts`. UI strings via
  next-intl; **`src/messages/en.json` and `ar.json` must stay key-for-key
  identical**; RTL must work.
- Mirror patterns: server-action forms (`FormState = { error?, message? }` +
  `useActionState`) — see `quotations/[id]/*-form.tsx` + `actions.ts`;
  pure-logic-in-`.js` + `types.ts` + Zod + `node:test` — see
  `src/lib/vehicle-intelligence/{safety.js,schemas.js,types.ts}` and
  `tests/vehicle-intelligence.test.mjs`.

### 2. Hard guardrails (instant reject if violated)
Do not modify: `src/middleware.ts`, `src/lib/supabase/middleware.ts`,
`/api/stripe/webhook`, migrations 0001–0024, auth/onboarding, or `account_intent`
semantics (routing metadata only — never authorization). New migration `0025`
only, RLS enabled at creation. **Server recomputes every monetary value** before
persistence (never trust client totals). All inputs Zod-validated. **Never run
`build` and `typecheck` in parallel.** Clean server/client boundaries. No secrets
in code/logs/analytics.

### 3. Final engineering decisions (do not deliberate)
- **Permission gate:** add `canManagePricingTools(role)` to `permissions.ts` =
  `['business_owner','manager']`; super-admins pass via `is_platform_admin()`.
  `employee` excluded by default (mirrors `canManageQuotes`). One gate for route +
  every action + nav entry. (Exact snippet: Part 4.)
- **Charts:** dependency-free inline SVG/CSS. Do NOT add Recharts.
- **PDF:** print-optimized server-rendered HTML view (`?print=1` segment +
  `@media print`) → user prints to PDF. No PDF dependency.
- **Analytics:** `src/lib/analytics/track.ts` → `trackRetainerEvent(name,
  metadata)`, a **safe no-op unless PostHog is wired** (env + dynamic-import
  guard). Metadata only: `business_id`, role, `service_category`, `billing_cycle`,
  `margin_range` bucket, `contract_length` bucket. Never prices/costs/customer
  identity/item details.
- **Error capture:** helper that calls Sentry only if present (guarded), else
  `console.error`. No hard Sentry dependency.
- **Pure core authored as `.js` ESM** (build-free, node:test-importable) +
  `types.ts` + Zod schema file.
- **New dependencies forbidden by default**; only with explicit `pnpm add` +
  lockfile + loud justification in the report.

### 4. Execution plan (phased; each phase green before the next)
- **Phase 0 — Recon (read only).** Confirm Ground-Truth files; note exact
  signatures of `set_updated_at`/`has_business_role`/`is_platform_admin`,
  quotations columns + secure quote RPC (`0008_secure_quote_creation.sql`), the
  form/action pattern, the VI test pattern, `dashboard-nav.tsx`, brand tokens
  (`brand.tsx`), `en.json` namespacing. Output a 10-line "conventions found" note.
- **Phase 1 — Migration `0025`.** Table per Part 4 below. Checks, indexes,
  `before update` trigger → `public.set_updated_at()`, **RLS enabled**, policies
  mirroring quotations: CRUD `using/with check (public.has_business_role(
  business_id, array['business_owner','manager']::public.member_role[]) or
  public.is_platform_admin())`; customers get nothing. Migration file only; list
  `supabase migration up` + type regen as **manual operator steps**.
- **Phase 2 — Pure calc + rules.** `src/lib/retainer/calculate-retainer.js`
  (contract: Part 2), `types.ts` (Part 2), `retainer-schema.ts` (Part 3),
  `recommendations.js`. Percentages are decimals (40%→0.4). Implement full formula
  chain + rounding + cycle conversion + optional annual prepay discount. Guard
  hard: cap/reject margin ≥ 1, negative costs, division-by-zero, empty arrays,
  NaN/Infinity → safe result. Implement all brief recommendation rules.
- **Phase 3 — Server actions** `src/lib/actions/retainer-scenarios.ts`:
  `create/update/delete/get/list/duplicate/compareRetainerScenarios`,
  `convertScenarioToQuote`. Each: `requireMembership()` → `canManagePricingTools`
  (or platform-admin) → enforce `business_id` → Zod-validate → **recompute via
  `calculateRetainer`** → persist → typed `{ error?, message?, data? }`.
  `convertScenarioToQuote` reuses the secure quote RPC (`0008`); retainer as
  quotation line item(s) + scope/SLA/payment-terms in notes; set `quote_id` +
  `status='converted_to_quote'`; never bypass server-side totals; if a field is
  missing, use notes — don't alter quote schema.
- **Phase 4 — UI.** Server `page.tsx` guards + renders client
  `RetainerCalculator`. Components in `src/components/retainer-calculator/`:
  `RetainerCalculator, LaborCostBuilder, PartsCostBuilder, ToolCostBuilder,
  OverheadCostBuilder, RiskSettings, PricingStrategy, ResultsDashboard,
  Recommendations` (rule-based "Pricing Insights", structured behind a clean
  interface for a future AI provider — **call no AI API**), `ScenarioComparison,
  PricingTiers`. Implement brief sections A–V (header Save/Export PDF/Create
  Quote/Reset; Business Context; Labor/Parts/Tool builders with
  add/remove/duplicate + category presets; Overhead; Risk/SLA; Pricing Strategy;
  Results Dashboard; Smart Recommendations; Scenario System incl. mark-recommended
  + attach-to-customer; Pricing Tiers Essential/Growth/Premium from one scenario;
  Pricing Insights). Live client calc via the same `calculateRetainer`;
  persistence via server actions (authoritative recompute). shadcn/ui + Tailwind,
  Desert Graphite + UAE-flag, dashboard cards, mobile-responsive, RTL-correct.
  Add a `canManagePricingTools`-gated "Tools" nav entry in `dashboard-nav.tsx`.
- **Phase 5 — i18n / money / states / PDF / analytics.** New `retainerCalculator`
  namespace in both message files (identical keys; pro English, Arabic flagged for
  native review — skeleton in Part 5). Localize labels only — keep stored
  enum/code constants in source. All money/numbers via formatters (Western
  digits; VAT 5%). States: loading, empty, permission-denied, Zod errors,
  calc-error fallback, `sonner` toasts. Implement print PDF view + no-op-safe
  analytics + guarded Sentry (§3).
- **Phase 6 — Tests.** `tests/retainer-calculator.test.mjs` (node:test, imports
  pure `.js` directly): base/margin/discount/VAT/rounding/cycle-conversion/
  per-vehicle/per-visit, all guard cases, recommendation rules, tier generation.
  Update `test` script to `node --test tests/`. Add feasible action/permission
  unit checks; note RLS is exercised by the live E2E harness when Supabase is up.

### 5. Validation & review gates (from `apps/web`, sequential)
```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes   # exit 2 = sandbox-blocked, NOT a regression
```
Then assert **en.json key set === ar.json key set**. Fix to green. Review gates:
(1) every action enforces role+`business_id`+Zod+server recompute; (2) no client
total persisted; (3) RLS denies customers and other tenants; (4) no raw i18n keys,
RTL clean, Western digits; (5) no undeclared dependency; (6) guardrail files
untouched.

### 6. Required final report
Files created/modified · the `0025` migration + manual operator steps · features
implemented (incl. tiers + insights) · any dependency added with justification ·
tests run + results · `lint/build/typecheck/test/smoke` + i18n-parity check ·
remaining risks / manual setup.

### 7. Scope discipline
Build only this module. For the roadmap (Expo app, real AI pricing assistant, new
verticals): keep the calc core/recommendations pure & provider-agnostic and the
insights panel behind a clean interface — structure for it, build none of it. No
edits to unrelated modules. Ship small, ship safe, ship green.

---

## Part 2 — Calculation contract (`src/lib/retainer/types.ts`)

> The function is authored in `calculate-retainer.js` (ESM, JSDoc) so `node:test`
> can import it without a build; these interfaces live in `types.ts` for the rest
> of the TS app. All percentages are decimals (40% → `0.4`).

```ts
export type Currency = "AED" | "USD" | "SAR";
export type BillingCycle = "monthly" | "quarterly" | "annual";
export type SlaLevel = "standard" | "priority" | "vip";
export type RoundingStrategy =
  | "none" | "nearest_10" | "nearest_50" | "nearest_100" | "psychological";

export interface LaborItem {
  id: string; role: string; department?: string;
  hourlyCost: number;       // currency / hour
  estimatedHours: number;   // hours / month
  utilization: number;      // decimal 0..1
}
export interface PartsItem {
  id: string; name: string;
  unitCost: number; quantity: number;  // quantity / month
  markup: number;                       // decimal, e.g. 0.3
}
export interface ToolItem {
  id: string; name: string;
  monthlyCost: number; allocation: number; // decimal 0..1
}
export interface OverheadSettings {
  rent: number; utilities: number; equipmentDepreciation: number;
  insurance: number; adminOverhead: number; miscellaneous: number;
}
export interface RiskSettings {
  reworkBuffer: number; emergencySupportBuffer: number;
  prioritySlaPremium: number; warrantyReserve: number; latePaymentRisk: number; // all decimals
}
export interface PricingSettings {
  targetMargin: number;          // decimal, MUST be < 1
  minimumMargin: number;         // decimal
  desiredNetProfit?: number;     // absolute amount, optional
  discount: number;              // decimal
  vat: number;                   // decimal, default 0.05 (UAE)
  rounding: RoundingStrategy;
  annualPrepayDiscount?: number; // decimal, optional
}
export interface RetainerCalculationInput {
  currency: Currency;
  billingCycle: BillingCycle;
  contractLengthMonths: number;  // > 0
  numberOfVehicles: number;      // > 0
  expectedMonthlyVisits: number; // >= 0
  slaLevel: SlaLevel;
  laborItems: LaborItem[];
  partsItems: PartsItem[];
  toolItems: ToolItem[];
  overhead: OverheadSettings;
  risk: RiskSettings;
  pricing: PricingSettings;
}
export interface RetainerWarning { code: string; severity: "info" | "warning" | "critical"; }
export interface RetainerRecommendation { code: string; tone: "positive" | "neutral" | "warning"; }

export interface RetainerCalculationResult {
  ok: boolean;                    // false if a guard tripped (e.g. margin >= 1)
  error?: string;
  currency: Currency;
  laborCost: number;
  internalPartsCost: number;
  billablePartsRevenue: number;
  allocatedToolCost: number;
  overheadCost: number;
  riskBufferAmount: number;
  baseMonthlyCost: number;
  preTaxRetainer: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  vatAmount: number;
  finalMonthlyRetainerRaw: number; // before rounding
  finalMonthlyRetainer: number;    // after rounding — customer-facing
  grossProfit: number;
  grossMargin: number;             // decimal
  breakEvenPrice: number;          // = baseMonthlyCost
  annualContractValue: number;
  totalContractValue: number;      // cycle- and contract-length-aware
  pricePerVehicle: number;
  pricePerVisit: number;
  warnings: RetainerWarning[];
  recommendations: RetainerRecommendation[];
}

// calculate-retainer.js implements:
//   export function calculateRetainer(input: RetainerCalculationInput): RetainerCalculationResult
```

**Formula chain** (decimals throughout):
```
laborCost            = Σ hourlyCost * estimatedHours * utilization
internalPartsCost    = Σ unitCost * quantity
billablePartsRevenue = Σ unitCost * quantity * (1 + markup)
allocatedToolCost    = Σ monthlyCost * allocation
overheadCost         = Σ overhead fields
combinedRisk         = reworkBuffer + emergencySupportBuffer + prioritySlaPremium
                       + warrantyReserve + latePaymentRisk
riskBufferAmount     = (labor + internalParts + tools + overhead) * combinedRisk
baseMonthlyCost      = labor + internalParts + tools + overhead + riskBufferAmount
preTaxRetainer       = baseMonthlyCost / (1 - targetMargin)        // guard targetMargin < 1
discountAmount       = preTaxRetainer * discount
subtotalAfterDiscount= preTaxRetainer - discountAmount
vatAmount            = subtotalAfterDiscount * vat
finalMonthlyRetainerRaw = subtotalAfterDiscount + vatAmount
finalMonthlyRetainer    = applyRounding(finalMonthlyRetainerRaw, rounding)
grossProfit          = subtotalAfterDiscount - baseMonthlyCost
grossMargin          = subtotalAfterDiscount > 0 ? grossProfit / subtotalAfterDiscount : 0
breakEvenPrice       = baseMonthlyCost
monthsPerCycle       = { monthly:1, quarterly:3, annual:12 }[billingCycle]
annualContractValue  = finalMonthlyRetainer * 12 * (1 - (annualPrepayDiscount ?? 0))
totalContractValue   = finalMonthlyRetainer * contractLengthMonths
pricePerVehicle      = numberOfVehicles      > 0 ? finalMonthlyRetainer / numberOfVehicles      : 0
pricePerVisit        = expectedMonthlyVisits > 0 ? finalMonthlyRetainer / expectedMonthlyVisits : 0
```
**Guards:** if `targetMargin >= 1` → `{ ok:false, error:"margin_out_of_range", ... zeros }`.
Treat negative costs as invalid (reject in Zod). Any `NaN`/`Infinity` → coerce to
`0` and push a `warning`. Empty item arrays → `0` subtotals (not errors).

---

## Part 3 — Zod schema (`src/lib/retainer/retainer-schema.ts`, Zod v4)

```ts
import { z } from "zod";

const fraction = z.number().min(0).max(1);          // 0..1 decimal
const nonNeg = z.number().min(0).finite();
const positiveInt = z.number().int().positive();

export const laborItemSchema = z.object({
  id: z.string(), role: z.string().min(1), department: z.string().optional(),
  hourlyCost: nonNeg, estimatedHours: nonNeg, utilization: fraction,
});
export const partsItemSchema = z.object({
  id: z.string(), name: z.string().min(1),
  unitCost: nonNeg, quantity: nonNeg, markup: z.number().min(0).finite(),
});
export const toolItemSchema = z.object({
  id: z.string(), name: z.string().min(1), monthlyCost: nonNeg, allocation: fraction,
});
export const overheadSchema = z.object({
  rent: nonNeg, utilities: nonNeg, equipmentDepreciation: nonNeg,
  insurance: nonNeg, adminOverhead: nonNeg, miscellaneous: nonNeg,
});
export const riskSchema = z.object({
  reworkBuffer: fraction, emergencySupportBuffer: fraction, prioritySlaPremium: fraction,
  warrantyReserve: fraction, latePaymentRisk: fraction,
});
export const pricingSchema = z.object({
  targetMargin: z.number().min(0).lt(1),      // must stay < 100%
  minimumMargin: z.number().min(0).lt(1),
  desiredNetProfit: nonNeg.optional(),
  discount: fraction,
  vat: fraction.default(0.05),
  rounding: z.enum(["none","nearest_10","nearest_50","nearest_100","psychological"]),
  annualPrepayDiscount: fraction.optional(),
});

export const retainerInputSchema = z.object({
  currency: z.enum(["AED","USD","SAR"]),
  billingCycle: z.enum(["monthly","quarterly","annual"]),
  contractLengthMonths: positiveInt,
  numberOfVehicles: positiveInt,
  expectedMonthlyVisits: nonNeg,
  slaLevel: z.enum(["standard","priority","vip"]),
  laborItems: z.array(laborItemSchema),
  partsItems: z.array(partsItemSchema),
  toolItems: z.array(toolItemSchema),
  overhead: overheadSchema,
  risk: riskSchema,
  pricing: pricingSchema,
});
export type RetainerInput = z.infer<typeof retainerInputSchema>;

// Persisted-scenario schema (server actions): metadata + the above blobs.
export const retainerScenarioSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  customerId: z.string().uuid().optional(),
  customerType: z.enum(["individual","fleet","corporate","government","insurance_partner"]),
  serviceCategory: z.enum([
    "general_workshop_maintenance","detailing","tire_services",
    "inspection_package","fleet_maintenance","custom",
  ]),
  input: retainerInputSchema,
});
export type RetainerScenarioInput = z.infer<typeof retainerScenarioSchema>;
```

---

## Part 4 — Permission helper & migration skeleton

**`src/lib/permissions.ts`** (add, mirroring `canManageQuotes`):
```ts
/** Retainer pricing calculator and saved pricing scenarios (owner + manager). */
export function canManagePricingTools(role: MemberRole | null | undefined): boolean {
  return hasRole(role, ["business_owner", "manager"]);
}
```
Page/action gate (server): super-admin passes via the platform-admin path your
admin routes already use; business users pass via `canManagePricingTools(member.role)`.

**`supabase/migrations/0025_retainer_pricing_scenarios.sql`** (skeleton — adjust to
match the exact column types/comments style of 0024):
```sql
create table public.retainer_pricing_scenarios (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  quote_id uuid references public.quotations(id) on delete set null,
  created_by uuid references public.profiles(id),
  title text not null,
  description text,
  customer_type text not null,
  service_category text not null,
  currency text not null default 'AED',
  billing_cycle text not null default 'monthly',
  contract_length_months integer not null default 1,
  number_of_vehicles integer not null default 1,
  expected_monthly_visits numeric not null default 1,
  sla_level text not null default 'standard',
  labor_items jsonb not null default '[]',
  parts_items jsonb not null default '[]',
  tool_items jsonb not null default '[]',
  overhead_items jsonb not null default '{}',
  risk_settings jsonb not null default '{}',
  pricing_settings jsonb not null default '{}',
  calculated_results jsonb not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retainer_contract_len_chk check (contract_length_months > 0),
  constraint retainer_vehicles_chk check (number_of_vehicles > 0),
  constraint retainer_visits_chk check (expected_monthly_visits >= 0),
  constraint retainer_status_chk check (status in ('draft','active','archived','converted_to_quote')),
  constraint retainer_cycle_chk check (billing_cycle in ('monthly','quarterly','annual')),
  constraint retainer_currency_chk check (currency in ('AED','USD','SAR'))
);

create index retainer_scenarios_business_idx   on public.retainer_pricing_scenarios (business_id);
create index retainer_scenarios_customer_idx   on public.retainer_pricing_scenarios (customer_id);
create index retainer_scenarios_quote_idx      on public.retainer_pricing_scenarios (quote_id);
create index retainer_scenarios_created_by_idx on public.retainer_pricing_scenarios (created_by);
create index retainer_scenarios_status_idx     on public.retainer_pricing_scenarios (status);
create index retainer_scenarios_created_at_idx on public.retainer_pricing_scenarios (created_at desc);

create trigger retainer_scenarios_updated_at
  before update on public.retainer_pricing_scenarios
  for each row execute function public.set_updated_at();

alter table public.retainer_pricing_scenarios enable row level security;

create policy "retainer_scenarios_rw" on public.retainer_pricing_scenarios
  for all
  using (
    public.is_platform_admin()
    or public.has_business_role(business_id, array['business_owner','manager']::public.member_role[])
  )
  with check (
    public.is_platform_admin()
    or public.has_business_role(business_id, array['business_owner','manager']::public.member_role[])
  );
```
> Verify the exact `set_updated_at` / `has_business_role` / `is_platform_admin`
> signatures against the real migrations before finalizing.

---

## Part 5 — `retainerCalculator` message skeleton (en/ar, identical keys)

Add to `src/messages/en.json` and `src/messages/ar.json`. Keep keys identical
(the build's parity gate enforces this). Localize **labels only** — never the
stored enum values (`customer_type`, `service_category`, etc.). Arabic below is a
first pass; flag for native review.

**en.json**
```json
"retainerCalculator": {
  "title": "Service Retainer Pricing Calculator",
  "subtitle": "Build profitable monthly service packages for recurring customers.",
  "actions": { "save": "Save scenario", "exportPdf": "Export PDF", "createQuote": "Create quote", "reset": "Reset", "addRow": "Add row", "removeRow": "Remove", "duplicateRow": "Duplicate", "loadPresets": "Load presets", "generateTiers": "Generate tiers", "compare": "Compare", "markRecommended": "Mark as recommended", "attachCustomer": "Attach to customer" },
  "context": { "heading": "Business context", "customerType": "Customer type", "serviceCategory": "Service category", "currency": "Currency", "billingCycle": "Billing cycle", "contractLength": "Contract length", "vehicles": "Vehicles / customers covered", "visits": "Expected monthly visits", "sla": "SLA level" },
  "labor": { "heading": "Labor cost", "role": "Role", "department": "Department", "hourlyCost": "Hourly cost", "hours": "Hours / month", "utilization": "Utilization %", "subtotal": "Subtotal" },
  "parts": { "heading": "Parts & consumables", "item": "Item", "unitCost": "Unit cost", "quantity": "Quantity / month", "markup": "Markup %", "internalSubtotal": "Internal cost", "billableSubtotal": "Billable" },
  "tools": { "heading": "Tools & software", "name": "Tool / software", "monthlyCost": "Monthly cost", "allocation": "Allocation %", "subtotal": "Subtotal" },
  "overhead": { "heading": "Facility & overhead", "rent": "Rent allocation", "utilities": "Utilities", "equipment": "Equipment depreciation", "insurance": "Insurance", "admin": "Admin overhead", "misc": "Miscellaneous" },
  "risk": { "heading": "Risk, buffer & SLA", "rework": "Rework risk buffer %", "emergency": "Emergency support buffer %", "slaPremium": "Priority SLA premium %", "warranty": "Warranty reserve %", "latePayment": "Late payment risk %" },
  "pricing": { "heading": "Profit & pricing strategy", "targetMargin": "Target gross margin %", "minMargin": "Minimum acceptable margin %", "netProfit": "Desired net profit", "discount": "Discount %", "vat": "VAT %", "rounding": "Price rounding", "roundingNone": "No rounding", "roundingNearest10": "Nearest 10", "roundingNearest50": "Nearest 50", "roundingNearest100": "Nearest 100", "roundingPsychological": "Psychological (e.g. 4,999)" },
  "results": { "heading": "Results", "internalCost": "Total internal monthly cost", "recommended": "Recommended monthly retainer", "vat": "VAT amount", "finalPrice": "Final customer price", "grossProfit": "Gross profit", "grossMargin": "Gross margin", "breakEven": "Break-even price", "annualValue": "Annual contract value", "totalValue": "Total contract value", "perVehicle": "Price per vehicle", "perVisit": "Price per visit", "costComposition": "Cost composition", "profitVsCost": "Profit vs cost" },
  "insights": { "heading": "Pricing insights", "whyPrice": "Why this price", "costPressure": "Main cost pressure", "riskLevel": "Risk level", "howToImprove": "How to improve margin" },
  "warnings": { "belowMinMargin": "Margin is below your minimum acceptable margin.", "discountTooDeep": "This discount pushes the margin too low.", "laborHeavy": "Labor is over 60% of total cost — review operational efficiency.", "overheadHigh": "Overhead is high — consider restructuring the package.", "vipUnderpriced": "VIP SLA with a low price — consider a premium uplift.", "fleetTier": "High vehicle count — consider fleet-tier pricing.", "prepaidStrategy": "Long contract — consider a prepaid discount strategy.", "undercharging": "Possible undercharging risk.", "viable": "Pricing is commercially viable." },
  "tiers": { "heading": "Package tiers", "essential": "Essential", "growth": "Growth", "premium": "Premium" },
  "scenarios": { "heading": "Saved scenarios", "empty": "No saved scenarios yet.", "status": "Status", "recommended": "Recommended" },
  "states": { "loading": "Loading…", "denied": "You do not have access to pricing tools.", "calcError": "Could not calculate pricing. Check your inputs.", "saved": "Scenario saved.", "converted": "Quote created from scenario." }
}
```

**ar.json** (same keys)
```json
"retainerCalculator": {
  "title": "حاسبة تسعير العقود الشهرية للخدمات",
  "subtitle": "صمّم باقات خدمات شهرية مربحة للعملاء المتكررين.",
  "actions": { "save": "حفظ السيناريو", "exportPdf": "تصدير PDF", "createQuote": "إنشاء عرض سعر", "reset": "إعادة تعيين", "addRow": "إضافة صف", "removeRow": "إزالة", "duplicateRow": "تكرار", "loadPresets": "تحميل قوالب", "generateTiers": "إنشاء الباقات", "compare": "مقارنة", "markRecommended": "تحديد كموصى به", "attachCustomer": "ربط بعميل" },
  "context": { "heading": "سياق العمل", "customerType": "نوع العميل", "serviceCategory": "فئة الخدمة", "currency": "العملة", "billingCycle": "دورة الفوترة", "contractLength": "مدة العقد", "vehicles": "المركبات / العملاء المشمولون", "visits": "عدد الزيارات الشهرية المتوقعة", "sla": "مستوى اتفاقية الخدمة" },
  "labor": { "heading": "تكلفة العمالة", "role": "الدور", "department": "القسم", "hourlyCost": "التكلفة بالساعة", "hours": "الساعات / شهر", "utilization": "نسبة الاستغلال %", "subtotal": "المجموع الفرعي" },
  "parts": { "heading": "القطع والمستهلكات", "item": "الصنف", "unitCost": "تكلفة الوحدة", "quantity": "الكمية / شهر", "markup": "هامش الربح %", "internalSubtotal": "التكلفة الداخلية", "billableSubtotal": "القابل للفوترة" },
  "tools": { "heading": "الأدوات والبرامج", "name": "الأداة / البرنامج", "monthlyCost": "التكلفة الشهرية", "allocation": "نسبة التخصيص %", "subtotal": "المجموع الفرعي" },
  "overhead": { "heading": "المرافق والمصاريف العامة", "rent": "حصة الإيجار", "utilities": "المرافق", "equipment": "إهلاك المعدات", "insurance": "التأمين", "admin": "المصاريف الإدارية", "misc": "مصاريف متنوعة" },
  "risk": { "heading": "المخاطر والاحتياطي واتفاقية الخدمة", "rework": "احتياطي مخاطر إعادة العمل %", "emergency": "احتياطي الدعم الطارئ %", "slaPremium": "علاوة اتفاقية الخدمة ذات الأولوية %", "warranty": "احتياطي الضمان %", "latePayment": "مخاطر تأخر السداد %" },
  "pricing": { "heading": "الربح واستراتيجية التسعير", "targetMargin": "هامش الربح الإجمالي المستهدف %", "minMargin": "الحد الأدنى المقبول للهامش %", "netProfit": "صافي الربح المطلوب", "discount": "الخصم %", "vat": "ضريبة القيمة المضافة %", "rounding": "تقريب السعر", "roundingNone": "بدون تقريب", "roundingNearest10": "أقرب 10", "roundingNearest50": "أقرب 50", "roundingNearest100": "أقرب 100", "roundingPsychological": "تسعير نفسي (مثل 4,999)" },
  "results": { "heading": "النتائج", "internalCost": "إجمالي التكلفة الشهرية الداخلية", "recommended": "العقد الشهري الموصى به", "vat": "مبلغ ضريبة القيمة المضافة", "finalPrice": "السعر النهائي للعميل", "grossProfit": "الربح الإجمالي", "grossMargin": "هامش الربح الإجمالي", "breakEven": "سعر التعادل", "annualValue": "القيمة السنوية للعقد", "totalValue": "إجمالي قيمة العقد", "perVehicle": "السعر لكل مركبة", "perVisit": "السعر لكل زيارة", "costComposition": "تركيبة التكلفة", "profitVsCost": "الربح مقابل التكلفة" },
  "insights": { "heading": "رؤى التسعير", "whyPrice": "سبب هذا السعر", "costPressure": "أكبر ضغط على التكلفة", "riskLevel": "مستوى المخاطر", "howToImprove": "كيفية تحسين الهامش" },
  "warnings": { "belowMinMargin": "الهامش أقل من الحد الأدنى المقبول لديك.", "discountTooDeep": "هذا الخصم يخفض الهامش أكثر من اللازم.", "laborHeavy": "تتجاوز العمالة 60% من إجمالي التكلفة — راجع كفاءة التشغيل.", "overheadHigh": "المصاريف العامة مرتفعة — فكّر في إعادة هيكلة الباقة.", "vipUnderpriced": "اتفاقية خدمة VIP بسعر منخفض — فكّر في رفع السعر.", "fleetTier": "عدد مركبات كبير — فكّر في تسعير أسطول.", "prepaidStrategy": "عقد طويل — فكّر في استراتيجية خصم مسبق الدفع.", "undercharging": "احتمال خطر التسعير المنخفض.", "viable": "التسعير مجدٍ تجارياً." },
  "tiers": { "heading": "باقات الخدمة", "essential": "أساسية", "growth": "نمو", "premium": "متميزة" },
  "scenarios": { "heading": "السيناريوهات المحفوظة", "empty": "لا توجد سيناريوهات محفوظة بعد.", "status": "الحالة", "recommended": "موصى به" },
  "states": { "loading": "جارٍ التحميل…", "denied": "ليس لديك صلاحية الوصول إلى أدوات التسعير.", "calcError": "تعذّر حساب التسعير. تحقّق من المدخلات.", "saved": "تم حفظ السيناريو.", "converted": "تم إنشاء عرض سعر من السيناريو." }
}
```

---

## Part 6 — Operator runbook (what the human does)

1. **Hand the task to Codex.** Paste Part 1 as the task; point it at Parts 2–5 in
   this file (it's at `apps/web/docs/RETAINER_CALCULATOR_CODEX_PROMPT.md`). Tell it
   to work on a feature branch, not `main`.
2. **While Codex runs**, ensure your local env can validate: `apps/web/.env.local`
   has working Supabase values (`supabase status` for local) so `pnpm test` /
   `pnpm smoke:routes` behave. Never paste secrets into the repo or chat.
3. **Apply the migration** (Codex only writes the file; it must not run this):
   ```bash
   cd ~/Downloads/Revora-app
   supabase migration up            # local; or apply via your hosted project
   ```
4. **Regenerate Supabase types** so `database.types.ts` knows the new table:
   ```bash
   # use the project's existing codegen command (e.g. supabase gen types …)
   ```
5. **Validate** (from `apps/web`, sequential — never build+typecheck together):
   ```bash
   pnpm lint && pnpm build && pnpm typecheck && pnpm test
   APP_URL=https://revora-app.vercel.app pnpm smoke:routes
   ```
6. **Review** Codex's final report against §6 + the review gates in §5. Confirm:
   route gated, customers blocked, scenario→quote works, PDF prints, en/ar keys
   equal, no undeclared dependencies.
7. **Arabic copy review** — have a native speaker check the Part 5 Arabic strings.
8. **Decide later:** whether `employee` (service advisors) should gain
   `canManagePricingTools`; whether to wire PostHog/Sentry env in Vercel; whether
   to upgrade PDF from print-HTML to a true PDF renderer.
9. **Production:** apply the migration to the production Supabase project and
   redeploy. Add any new env vars in Vercel first, then redeploy.
