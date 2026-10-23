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
