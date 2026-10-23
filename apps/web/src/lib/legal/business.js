// Business (legal entity) details rendered on legal pages and footers.
//
// Authored as .js (ESM) so the offline `node --test` suite can import it, matching
// lib/ratings.js and lib/validation/*.js. Values are `NEXT_PUBLIC_*` so the same
// details reach Server and Client Components. Missing required values fall back to
// a visible bracketed hint rather than an empty string, so a misconfigured
// deployment shows the gap instead of silently publishing a policy with no
// controller identity.

/** @typedef {import("./types").BusinessDetails} BusinessDetails */
/** @typedef {import("./types").LegalJurisdiction} LegalJurisdiction */

export const LEGAL_JURISDICTIONS = ["mainland", "difc", "adgm"];

/** Prefix of every fallback value; tests and the footer detect it. */
export const PLACEHOLDER_PREFIX = "[Set ";

/** @param {string} name */
function placeholder(name) {
  return `${PLACEHOLDER_PREFIX}${name}]`;
}

/**
 * @param {string} name
 * @param {string | undefined} value
 */
function readRequired(name, value) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : placeholder(name);
}

/**
 * @param {string | undefined} value
 * @returns {LegalJurisdiction}
 */
export function parseJurisdiction(value) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return LEGAL_JURISDICTIONS.includes(normalized)
    ? /** @type {LegalJurisdiction} */ (normalized)
    : "mainland";
}

/**
 * @param {{
 *   NEXT_PUBLIC_LEGAL_ENTITY_NAME?: string,
 *   NEXT_PUBLIC_LEGAL_ADDRESS?: string,
 *   NEXT_PUBLIC_LEGAL_EMAIL?: string,
 *   NEXT_PUBLIC_LEGAL_LICENSE?: string,
 *   NEXT_PUBLIC_LEGAL_JURISDICTION?: string,
 * }} env
 * @returns {BusinessDetails}
 */
export function buildBusinessDetails(env) {
  const entityName = readRequired(
    "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
    env.NEXT_PUBLIC_LEGAL_ENTITY_NAME,
  );
  const address = readRequired("NEXT_PUBLIC_LEGAL_ADDRESS", env.NEXT_PUBLIC_LEGAL_ADDRESS);
  const email = readRequired("NEXT_PUBLIC_LEGAL_EMAIL", env.NEXT_PUBLIC_LEGAL_EMAIL);
  const license = env.NEXT_PUBLIC_LEGAL_LICENSE?.trim() || null;

  return {
    entityName,
    address,
    email,
    license,
    jurisdiction: parseJurisdiction(env.NEXT_PUBLIC_LEGAL_JURISDICTION),
    isConfigured: ![entityName, address, email].some((v) =>
      v.startsWith(PLACEHOLDER_PREFIX),
    ),
  };
}

/**
 * Read from `process.env`. Each variable is referenced by its full name so the
 * Next.js build can inline `NEXT_PUBLIC_*` values for Client Components.
 * @returns {BusinessDetails}
 */
export function getBusinessDetails() {
  return buildBusinessDetails({
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME,
    NEXT_PUBLIC_LEGAL_ADDRESS: process.env.NEXT_PUBLIC_LEGAL_ADDRESS,
    NEXT_PUBLIC_LEGAL_EMAIL: process.env.NEXT_PUBLIC_LEGAL_EMAIL,
    NEXT_PUBLIC_LEGAL_LICENSE: process.env.NEXT_PUBLIC_LEGAL_LICENSE,
    NEXT_PUBLIC_LEGAL_JURISDICTION: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION,
  });
}
