import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getLeadChannelLabel,
  getLeadContactLabel,
  getLeadStatusLabel,
  getLeadUrgencyLabel,
  LEAD_CHANNELS,
  LEAD_STATUSES,
  LEAD_STATUS_VARIANT,
  LEAD_URGENCIES,
  LEAD_URGENCY_VARIANT,
  OPEN_LEAD_STATUSES,
} from "../src/lib/leads.js";
import {
  convertLeadSchema,
  LEAD_STATUSES as SCHEMA_STATUSES,
  LEAD_URGENCIES as SCHEMA_URGENCIES,
  updateLeadSchema,
} from "../src/lib/validation/leads.js";
import { DASHBOARD_NAV } from "../src/lib/nav/model.js";
import { PHASE_1_DEFAULTS } from "../src/lib/features/flags.js";

const migration0048 = readFileSync(
  new URL("../../../supabase/migrations/0048_inbound_capture.sql", import.meta.url),
  "utf8",
);
const en = JSON.parse(
  readFileSync(new URL("../src/messages/en.json", import.meta.url), "utf8"),
);
const ar = JSON.parse(
  readFileSync(new URL("../src/messages/ar.json", import.meta.url), "utf8"),
);

/** Pulls the allowlist out of a `check (col in ('a','b'))` constraint. */
function domainFromCheck(sql, constraint) {
  const match = new RegExp(
    `constraint ${constraint}[\\s\\S]*?in \\(([^)]*)\\)`,
  ).exec(sql);
  assert.ok(match, `could not find ${constraint} in the migration`);
  return match[1]
    .split(",")
    .map((value) => value.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// The vocabularies the UI offers must be exactly what the database accepts.
// A status in the dropdown that the check constraint rejects is a 500 on save;
// one the database allows but the UI cannot label renders a blank badge.
// ---------------------------------------------------------------------------

test("the status filter and form offer exactly the statuses 0048 allows", () => {
  const dbStatuses = domainFromCheck(migration0048, "leads_status_check");
  assert.deepEqual([...LEAD_STATUSES].sort(), [...dbStatuses].sort());
  assert.deepEqual([...SCHEMA_STATUSES].sort(), [...dbStatuses].sort());
});

test("the urgency control offers exactly the urgencies 0048 allows", () => {
  const dbUrgencies = domainFromCheck(migration0048, "leads_urgency_check");
  assert.deepEqual([...LEAD_URGENCIES].sort(), [...dbUrgencies].sort());
  assert.deepEqual([...SCHEMA_URGENCIES].sort(), [...dbUrgencies].sort());
});

test("the channel filter covers exactly the inbound_channel enum", () => {
  const match = /create type public\.inbound_channel as enum \(([\s\S]*?)\);/.exec(
    migration0048,
  );
  assert.ok(match, "inbound_channel enum not found");
  const dbChannels = match[1]
    .split(",")
    .map((value) => value.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
  assert.deepEqual([...LEAD_CHANNELS].sort(), [...dbChannels].sort());
});

test("every status, urgency and channel has a label in both locales and a badge variant", () => {
  for (const status of LEAD_STATUSES) {
    assert.ok(getLeadStatusLabel(status, "en"), `en label for ${status}`);
    assert.ok(getLeadStatusLabel(status, "ar"), `ar label for ${status}`);
    assert.ok(LEAD_STATUS_VARIANT[status], `variant for ${status}`);
  }
  for (const urgency of LEAD_URGENCIES) {
    assert.ok(getLeadUrgencyLabel(urgency, "en"), `en label for ${urgency}`);
    assert.ok(getLeadUrgencyLabel(urgency, "ar"), `ar label for ${urgency}`);
    assert.ok(LEAD_URGENCY_VARIANT[urgency], `variant for ${urgency}`);
  }
  for (const channel of LEAD_CHANNELS) {
    assert.ok(getLeadChannelLabel(channel, "en"), `en label for ${channel}`);
    assert.ok(getLeadChannelLabel(channel, "ar"), `ar label for ${channel}`);
  }
});

test("Arabic labels are actually translated, not English copies", () => {
  // A locale file that silently falls back to English is worse than an
  // obviously missing translation, because nothing surfaces it.
  const sameAsEnglish = LEAD_STATUSES.filter(
    (status) => getLeadStatusLabel(status, "ar") === getLeadStatusLabel(status, "en"),
  );
  assert.deepEqual(sameAsEnglish, []);
});

test("the open-lead statuses match what the inbound route treats as open", () => {
  // lib/inbound/service.ts reuses an OPEN lead rather than creating a second
  // one per message. If the queue's idea of "open" drifts from the route's, a
  // follow-up DM either starts a duplicate lead or lands on one the queue has
  // stopped showing.
  const service = readFileSync(
    new URL("../src/lib/inbound/service.ts", import.meta.url),
    "utf8",
  );
  const match = /const OPEN_STATUSES = \[([^\]]*)\]/.exec(service);
  assert.ok(match, "OPEN_STATUSES not found in the inbound service");
  const routeStatuses = match[1]
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  assert.deepEqual([...OPEN_LEAD_STATUSES].sort(), [...routeStatuses].sort());
});

test("every open status is a real status", () => {
  for (const status of OPEN_LEAD_STATUSES) {
    assert.ok(LEAD_STATUSES.includes(status), `${status} is not a lead status`);
  }
});

// ---------------------------------------------------------------------------
// Contact labelling.
// ---------------------------------------------------------------------------

test("the contact label degrades from customer to display name to handle", () => {
  assert.equal(
    getLeadContactLabel({
      customer_name: "Sara Hassan",
      identity_display_name: "sara.h",
      identity_handle: "@sara",
    }),
    "Sara Hassan",
  );
  assert.equal(
    getLeadContactLabel({ customer_name: null, identity_display_name: "sara.h" }),
    "sara.h",
  );
  assert.equal(
    getLeadContactLabel({ identity_handle: "@sara" }),
    "@sara",
  );
  assert.equal(getLeadContactLabel({}, "Unknown"), "Unknown");
  // Whitespace-only values must not win over a real one further down.
  assert.equal(
    getLeadContactLabel({ customer_name: "   ", identity_handle: "@sara" }),
    "@sara",
  );
});

// ---------------------------------------------------------------------------
// Server-action input validation.
// ---------------------------------------------------------------------------

const LEAD_ID = "11111111-2222-4333-8444-555555555555";

test("updateLead accepts a valid triage submission", () => {
  const parsed = updateLeadSchema.safeParse({
    leadId: LEAD_ID,
    status: "qualified",
    urgency: "high",
    assignedTo: "99999999-2222-4333-8444-555555555555",
    summary: "Wants a brake inspection this week",
  });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

test("updateLead rejects a status or urgency the database would reject", () => {
  assert.equal(
    updateLeadSchema.safeParse({ leadId: LEAD_ID, status: "archived" }).success,
    false,
  );
  assert.equal(
    updateLeadSchema.safeParse({ leadId: LEAD_ID, urgency: "urgent" }).success,
    false,
  );
  assert.equal(updateLeadSchema.safeParse({ leadId: "not-a-uuid" }).success, false);
  assert.equal(
    updateLeadSchema.safeParse({ leadId: LEAD_ID, assignedTo: "nope" }).success,
    false,
  );
});

test("clearing the assignee is valid, which is how the unassigned sentinel is handled", () => {
  const parsed = updateLeadSchema.safeParse({ leadId: LEAD_ID, assignedTo: null });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

test("neither lead schema accepts a client-supplied business_id", () => {
  // business_id is derived from the session's membership. If it were ever
  // accepted here, a caller could aim a write at another tenant and rely on
  // nothing but RLS to stop it.
  for (const schema of [updateLeadSchema, convertLeadSchema]) {
    const parsed = schema.safeParse({
      leadId: LEAD_ID,
      businessId: "33333333-2222-4333-8444-555555555555",
      business_id: "33333333-2222-4333-8444-555555555555",
    });
    assert.equal(parsed.success, true);
    assert.equal("businessId" in parsed.data, false);
    assert.equal("business_id" in parsed.data, false);
  }
});

test("convertLead works with no contact details at all", () => {
  // A DM carries neither a phone nor an email, and often no name; the action
  // falls back to the channel identity rather than refusing.
  const parsed = convertLeadSchema.safeParse({ leadId: LEAD_ID });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

// ---------------------------------------------------------------------------
// Access and navigation.
// ---------------------------------------------------------------------------

test("canManageLeads names exactly the roles the 0048 policy admits", () => {
  // Asserted against the declaration, not the behaviour: permissions.ts is a
  // .ts module and this runner can only import .js, which is why the repo's
  // pure logic lives in .js. The behavioural check is hasRole's own.
  //
  // leads_manage in 0048 is is_business_member(business_id) -- any ACTIVE
  // member -- so the three staff roles belong and `customer` must not.
  const source = readFileSync(
    new URL("../src/lib/permissions.ts", import.meta.url),
    "utf8",
  );
  const match = /export function canManageLeads\([\s\S]*?hasRole\(role, \[([^\]]*)\]\)/.exec(
    source,
  );
  assert.ok(match, "canManageLeads not found");
  const roles = match[1]
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  assert.deepEqual(roles.sort(), ["business_owner", "employee", "manager"]);
  assert.equal(roles.includes("customer"), false);
});

test("the lead vocabulary types match the arrays they describe", () => {
  // leads-types.ts restates the members as literal unions because a JSDoc
  // const array cannot produce one. This is what keeps the duplication from
  // drifting silently.
  const types = readFileSync(
    new URL("../src/lib/leads-types.ts", import.meta.url),
    "utf8",
  );
  const unionMembers = (name) => {
    const match = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(types);
    assert.ok(match, `${name} union not found`);
    return (match[1].match(/"([a-z_]+)"/g) ?? []).map((value) => value.replaceAll('"', ""));
  };
  assert.deepEqual(unionMembers("LeadStatus").sort(), [...LEAD_STATUSES].sort());
  assert.deepEqual(unionMembers("LeadUrgency").sort(), [...LEAD_URGENCIES].sort());
});

test("the leads nav item is feature-gated and localised in both languages", () => {
  const item = DASHBOARD_NAV.flatMap((group) => group.items).find(
    (navItem) => navItem.href === "/leads",
  );
  assert.ok(item, "no /leads nav item");
  // Gated, so a tenant with no connected channel does not get a nav entry
  // leading only to an empty state.
  assert.equal(item.feature, "inboundCapture");
  assert.equal(PHASE_1_DEFAULTS.inboundCapture, false);
  assert.ok(en.nav[item.labelKey], "en nav label");
  assert.ok(ar.nav[item.labelKey], "ar nav label");
});

test("the leads message blocks have identical key sets in both locales", () => {
  const keys = (object, prefix = "") =>
    Object.entries(object).flatMap(([key, value]) =>
      value && typeof value === "object"
        ? [prefix + key, ...keys(value, `${prefix}${key}.`)]
        : [prefix + key],
    );
  assert.deepEqual(keys(en.dashboardLeads).sort(), keys(ar.dashboardLeads).sort());
});
