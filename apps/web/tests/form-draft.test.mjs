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
