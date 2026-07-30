import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 2 — customer-portal server-action validation and the
// APPSEC-11 explicit ownership-check pattern. Offline unit tests (no Supabase,
// no secrets), importing the .js schema modules directly like the Phase 1 suite.

import {
  portalComplaintReplySchema,
  portalCreateComplaintSchema,
} from "../src/lib/validation/complaints.js";
import {
  approveQuoteSchema,
  rejectQuoteSchema,
} from "../src/lib/validation/quotations.js";

const UID = "c883e981-3627-4482-be63-348b0950f15e";
const UID2 = "11111111-2222-4333-8444-555566667777";
const AR = "السيارة ما زالت تصدر صوتاً غريباً بعد الإصلاح."; // Arabic content
const ok = (r) => r.success === true;

// --- portal createComplaint ------------------------------------------------

test("portal createComplaint: valid English payload accepted, severity defaults to medium", () => {
  const r = portalCreateComplaintSchema.safeParse({
    customerId: UID,
    businessId: UID2,
    subject: "Brake noise after service",
    description: "The brakes still squeal at low speed.",
    severity: "",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.severity, "medium");
});

test("portal createComplaint: valid Arabic payload accepted and preserved", () => {
  const r = portalCreateComplaintSchema.safeParse({
    customerId: UID,
    businessId: UID2,
    subject: "  مشكلة في المكابح  ",
    description: AR,
    severity: "high",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.subject, "مشكلة في المكابح"); // trimmed, Unicode intact
  assert.equal(r.data.description, AR);
});

test("portal createComplaint: blank subject/description rejected", () => {
  const base = { customerId: UID, businessId: UID2, severity: "low" };
  assert.equal(
    ok(portalCreateComplaintSchema.safeParse({ ...base, subject: "   ", description: "x" })),
    false,
  );
  assert.equal(
    ok(portalCreateComplaintSchema.safeParse({ ...base, subject: "x", description: "   " })),
    false,
  );
});

test("portal createComplaint: malformed account ids and invalid severity rejected", () => {
  const base = { subject: "s", description: "d", severity: "medium" };
  assert.equal(
    ok(portalCreateComplaintSchema.safeParse({ ...base, customerId: "x", businessId: UID2 })),
    false,
  );
  assert.equal(
    ok(portalCreateComplaintSchema.safeParse({ ...base, customerId: UID, businessId: "x" })),
    false,
  );
  assert.equal(
    ok(
      portalCreateComplaintSchema.safeParse({
        ...base,
        customerId: UID,
        businessId: UID2,
        severity: "apocalyptic",
      }),
    ),
    false,
  );
});

// --- portal addComplaintReply ----------------------------------------------

test("portal reply: valid English and Arabic replies accepted; blank rejected", () => {
  const base = { complaintId: UID, businessId: UID2 };
  assert.equal(ok(portalComplaintReplySchema.safeParse({ ...base, body: "Thanks!" })), true);
  assert.equal(ok(portalComplaintReplySchema.safeParse({ ...base, body: AR })), true);
  assert.equal(ok(portalComplaintReplySchema.safeParse({ ...base, body: "   " })), false);
});

test("portal reply: malformed complaint/parent ids rejected", () => {
  assert.equal(
    ok(portalComplaintReplySchema.safeParse({ complaintId: "x", businessId: UID2, body: "hi" })),
    false,
  );
  assert.equal(
    ok(
      portalComplaintReplySchema.safeParse({
        complaintId: UID,
        businessId: UID2,
        body: "hi",
        parentMessageId: "not-a-uuid",
      }),
    ),
    false,
  );
});

// --- portal approveQuote ---------------------------------------------------

test("portal approveQuote: valid payload accepted; malformed quote id rejected", () => {
  const base = {
    businessId: UID2,
    customerId: UID,
    quotationVersion: "2",
    language: "ar",
    signature: "Aisha Al Nuaimi",
  };
  const good = approveQuoteSchema.safeParse({ ...base, quotationId: UID });
  assert.equal(ok(good), true);
  assert.equal(good.data.quotationVersion, 2);
  assert.equal(ok(approveQuoteSchema.safeParse({ ...base, quotationId: "x" })), false);
});

test("portal approveQuote: blank signature and invalid version rejected", () => {
  const base = { quotationId: UID, businessId: UID2, customerId: UID };
  assert.equal(
    ok(approveQuoteSchema.safeParse({ ...base, signature: "   " })),
    false,
  );
  assert.equal(
    ok(approveQuoteSchema.safeParse({ ...base, signature: "A", quotationVersion: "0" })),
    false,
  );
});

// --- portal rejectQuote ----------------------------------------------------

test("portal rejectQuote: valid payload accepted, note optional and trimmed", () => {
  const withNote = rejectQuoteSchema.safeParse({
    quotationId: UID,
    businessId: UID2,
    customerId: UID,
    rejectionNote: "  Too expensive  ",
  });
  assert.equal(ok(withNote), true);
  assert.equal(withNote.data.rejectionNote, "Too expensive");
  const noNote = rejectQuoteSchema.safeParse({
    quotationId: UID,
    businessId: UID2,
    customerId: UID,
    rejectionNote: "",
  });
  assert.equal(ok(noNote), true);
  assert.equal(noNote.data.rejectionNote, undefined);
});

test("portal rejectQuote: malformed ids rejected", () => {
  assert.equal(
    ok(rejectQuoteSchema.safeParse({ quotationId: "x", businessId: UID2, customerId: UID })),
    false,
  );
  assert.equal(
    ok(rejectQuoteSchema.safeParse({ quotationId: UID, businessId: UID2, customerId: "" })),
    false,
  );
});

// --- security regressions (static source assertions, supplementing the
// --- behavioral schema tests above) ----------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const portalActions = readFileSync(
  path.resolve(here, "../src/app/[locale]/(portal)/portal/actions.ts"),
  "utf8",
);
const quoteDetailPage = readFileSync(
  path.resolve(here, "../src/app/[locale]/(portal)/portal/quotes/[id]/page.tsx"),
  "utf8",
);

test("security: portal actions validate via safeParse with curated messages", () => {
  assert.match(portalActions, /portalCreateComplaintSchema\.safeParse\(/);
  assert.match(portalActions, /portalComplaintReplySchema\.safeParse\(/);
  assert.match(portalActions, /approveQuoteSchema\.safeParse\(/);
  assert.match(portalActions, /rejectQuoteSchema\.safeParse\(/);
  assert.match(portalActions, /firstValidationMessage\(/);
});

test("security: mutations use session-derived identity, not raw client ids", () => {
  // Complaint insert uses the resolved session account row.
  assert.match(portalActions, /business_id:\s*account\.business_id/);
  assert.match(portalActions, /customer_id:\s*account\.id/);
  // Reply + approval identity comes from the ownership-verified row.
  assert.match(portalActions, /business_id:\s*complaintRow\.business_id/);
  assert.match(portalActions, /business_id:\s*quoteRow\.business_id/);
  assert.match(portalActions, /customer_id:\s*quoteRow\.customer_id/);
  assert.match(portalActions, /target_customer_id:\s*account\.id/);
  // Raw client ids must not be written to mutations.
  assert.doesNotMatch(portalActions, /business_id:\s*businessId\b/);
  assert.doesNotMatch(portalActions, /customer_id:\s*customerId\b/);
  assert.doesNotMatch(portalActions, /target_customer_id:\s*customerId\b/);
});

test("security: explicit ownership queries precede quote and reply mutations (APPSEC-11)", () => {
  // A quotations lookup with owner comparison must exist for approve AND reject.
  const ownershipLookups = portalActions.match(
    /from\("quotations"\)\s*\.select\("id, business_id, customer_id/g,
  );
  assert.ok(
    ownershipLookups && ownershipLookups.length >= 2,
    "approveQuote and rejectQuote must each query the quotation before mutating",
  );
  assert.match(portalActions, /quoteRow\.customer_id !== account\.id/);
  assert.match(portalActions, /from\("complaints"\)\s*\.select\("id, business_id, customer_id"\)/);
  // State gating: only 'sent' quotes may transition.
  assert.match(portalActions, /quoteRow\.status !== "sent"/);
});

test("security: ownership failures use a non-enumerating response", () => {
  assert.match(portalActions, /Quotation not found or unavailable\./);
  assert.match(portalActions, /Complaint not found or unavailable\./);
  // The old access-revealing phrasings are gone from the four hardened actions.
  assert.doesNotMatch(portalActions, /You do not have access to this quotation/);
  assert.doesNotMatch(portalActions, /You do not have access to this complaint/);
});

test("security: quote detail page performs an explicit ownership check (APPSEC-11)", () => {
  assert.match(quoteDetailPage, /accounts\.some\(/);
  assert.match(quoteDetailPage, /account\.id === quote\.customer_id/);
  assert.match(quoteDetailPage, /account\.business_id === quote\.business_id/);
});
