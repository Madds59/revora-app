/**
 * Phase 1 feature registry. Pure on purpose: no process.env read, no Supabase,
 * no React, so this file stays unit-testable with `node --test` and importable
 * from both server and client components.
 *
 * The raw NEXT_PUBLIC_REVORA_FEATURES string is passed IN rather than read
 * here. Next.js only inlines NEXT_PUBLIC_* through a static
 * `process.env.NEXT_PUBLIC_X` reference, and taking the string as an argument
 * keeps this testable without stubbing the environment.
 */

/** @typedef {import("./types").FeatureKey} FeatureKey */
/** @typedef {import("./types").FeatureFlags} FeatureFlags */

/** @type {FeatureFlags} */
export const PHASE_1_DEFAULTS = Object.freeze({
  vehicleIntelligence: false,
  retainerCalculator: false,
  membershipBundles: false,
  analytics: false,
  maintenance: false,
  feedback: false,
});

/** @type {FeatureKey[]} */
export const FEATURE_KEYS = Object.freeze(Object.keys(PHASE_1_DEFAULTS));

/**
 * @param {unknown} value
 * @returns {boolean} true only for one of the six registry names
 */
export function isFeatureKey(value) {
  return typeof value === "string" && FEATURE_KEYS.includes(value);
}

/**
 * Parse NEXT_PUBLIC_REVORA_FEATURES. Additive: every name listed is forced on.
 * Unknown names, blank entries and padding are dropped — a typo in an env var
 * must never take the app down.
 *
 * @param {unknown} raw
 * @returns {FeatureKey[]}
 */
export function parseFeatureOverrides(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(isFeatureKey);
}

/**
 * @param {unknown} raw NEXT_PUBLIC_REVORA_FEATURES
 * @returns {FeatureFlags} a fresh, unfrozen copy
 */
export function resolveFeatures(raw) {
  /** @type {FeatureFlags} */
  const flags = { ...PHASE_1_DEFAULTS };
  for (const key of parseFeatureOverrides(raw)) {
    flags[key] = true;
  }
  return flags;
}

/**
 * @param {FeatureFlags} flags
 * @param {FeatureKey | undefined} key undefined means the item is not gated
 * @returns {boolean}
 */
export function isFeatureEnabled(flags, key) {
  if (key === undefined) return true;
  return flags[key] === true;
}

/**
 * Narrow a `?disabled=` search param to a known feature key. Anything else
 * yields null so the banner renders nothing rather than echoing user input.
 *
 * @param {unknown} rawParam string | string[] | undefined, as Next supplies it
 * @returns {FeatureKey | null}
 */
export function disabledBannerKey(rawParam) {
  const candidates = Array.isArray(rawParam) ? rawParam : [rawParam];
  for (const candidate of candidates) {
    if (isFeatureKey(candidate)) return candidate;
  }
  return null;
}
