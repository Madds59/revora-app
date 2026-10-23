// Legal document registry.
//
// LEGAL_VERSION is what signup records against the user (terms_version) and
// what every document's `updated` field must equal — the test suite enforces
// that so a text change cannot ship without bumping the version users accept.
//
// LEGAL_REVIEW_STATUS drives the "draft — pending counsel review" banner on
// every legal page. Flip to "reviewed" only after qualified UAE counsel has
// signed off on the current LEGAL_VERSION (see docs/legal/README.md).

import { cookies } from "./content/cookies.js";
import { privacy } from "./content/privacy.js";
import { refunds } from "./content/refunds.js";
import { terms } from "./content/terms.js";

/** @typedef {import("./types").LegalSlug} LegalSlug */
/** @typedef {import("./types").LegalLocale} LegalLocale */
/** @typedef {import("./types").LegalDocument} LegalDocument */
/** @typedef {import("./types").LegalContent} LegalContent */
/** @typedef {import("./types").BusinessDetails} BusinessDetails */

export const LEGAL_VERSION = "2026-09-12";

/** @type {"draft" | "reviewed"} */
export const LEGAL_REVIEW_STATUS = "draft";

/** @type {LegalSlug[]} */
export const LEGAL_SLUGS = ["privacy", "terms", "cookies", "refunds"];

/** @type {Record<LegalSlug, LegalContent>} */
export const LEGAL_CONTENT = { privacy, terms, cookies, refunds };

/** Tokens a document may reference; anything else is a typo (tested). */
export const LEGAL_TOKENS = ["entityName", "address", "email"];

/** @param {unknown} value */
export function isLegalSlug(value) {
  return typeof value === "string" && LEGAL_SLUGS.includes(/** @type {LegalSlug} */ (value));
}

/**
 * @param {LegalSlug} slug
 * @param {string} locale
 * @returns {LegalDocument}
 */
export function getLegalDocument(slug, locale) {
  const content = LEGAL_CONTENT[slug];
  return locale === "ar" ? content.ar : content.en;
}

/**
 * Replace `{token}` placeholders with business details. Unknown tokens are left
 * verbatim so they surface visibly rather than vanish.
 * @param {string} text
 * @param {BusinessDetails} business
 */
export function renderLegalText(text, business) {
  return text.replace(/\{(entityName|address|email)\}/g, (_match, key) => {
    switch (key) {
      case "entityName":
        return business.entityName;
      case "address":
        return business.address;
      case "email":
        return business.email;
      default:
        return _match;
    }
  });
}

/**
 * Collects every `{...}` token used across a document, for the test suite.
 * @param {LegalDocument} doc
 * @returns {string[]}
 */
export function collectTokens(doc) {
  const text = [
    doc.title,
    ...doc.intro,
    ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])]),
  ].join("\n");
  return Array.from(new Set(Array.from(text.matchAll(/\{([a-zA-Z]+)\}/g), (m) => m[1])));
}
