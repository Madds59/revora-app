import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReportTags,
  formatConsoleLine,
  sanitizeExtra,
  isControlFlowError,
  scrubUrl,
} from "../src/lib/observability-context.js";

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

test("sanitizeExtra keeps short ids/numbers/booleans and drops PII-shaped or nested values", () => {
  assert.deepEqual(
    sanitizeExtra({ part: "jobs", count: 3, ok: true, email: "a@b.c", long: "x".repeat(65), nested: { a: 1 }, list: [1], nil: null }),
    { part: "jobs", count: 3, ok: true },
  );
  assert.deepEqual(sanitizeExtra(undefined), {});
});

test("isControlFlowError recognises Next redirect/notFound/http-fallback digests and messages", () => {
  assert.equal(isControlFlowError({ digest: "NEXT_REDIRECT;replace;/login;307;" }), true);
  assert.equal(isControlFlowError({ message: "NEXT_NOT_FOUND" }), true);
  assert.equal(isControlFlowError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }), true);
  assert.equal(isControlFlowError(new Error("boom")), false);
  assert.equal(isControlFlowError(null), false);
  assert.equal(isControlFlowError("NEXT_REDIRECT"), false);
});

test("scrubUrl drops query/hash and redacts share tokens", () => {
  assert.equal(scrubUrl("/en/i/abc123?x=1#f"), "/en/i/[redacted]");
  assert.equal(scrubUrl("https://app.example/en/admin/users?q=a@b.c"), "https://app.example/en/admin/users");
  assert.equal(scrubUrl("/en/jobs"), "/en/jobs");
  assert.equal(scrubUrl(undefined), undefined);
});
