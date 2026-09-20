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
