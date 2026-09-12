import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGAL_CONTENT,
  LEGAL_SLUGS,
  LEGAL_TOKENS,
  LEGAL_VERSION,
  LEGAL_REVIEW_STATUS,
  collectTokens,
  getLegalDocument,
  isLegalSlug,
  renderLegalText,
} from "../src/lib/legal/index.js";
import {
  PLACEHOLDER_PREFIX,
  buildBusinessDetails,
  parseJurisdiction,
} from "../src/lib/legal/business.js";

// Legal documents are published unauthenticated in two locales. These checks
// stop the two most likely regressions: a locale drifting out of sync with the
// other, and a text change shipping without bumping the version users accept.

for (const slug of LEGAL_SLUGS) {
  const content = LEGAL_CONTENT[slug];

  test(`${slug}: both locales present and structurally aligned`, () => {
    for (const locale of ["en", "ar"]) {
      const doc = content[locale];
      assert.ok(doc, `${slug}.${locale} missing`);
      assert.ok(doc.title.trim().length > 0);
      assert.ok(doc.intro.length > 0, `${slug}.${locale} intro empty`);
      assert.ok(doc.sections.length > 0, `${slug}.${locale} sections empty`);
      for (const section of doc.sections) {
        assert.ok(section.heading.trim().length > 0);
        assert.ok(section.paragraphs.length > 0, `${section.heading} has no paragraphs`);
        for (const p of section.paragraphs) assert.ok(p.trim().length > 0);
        for (const b of section.bullets ?? []) assert.ok(b.trim().length > 0);
      }
    }
    assert.equal(
      content.en.sections.length,
      content.ar.sections.length,
      `${slug}: EN/AR section counts differ`,
    );
    content.en.sections.forEach((section, i) => {
      const ar = content.ar.sections[i];
      assert.equal(
        Boolean(section.bullets),
        Boolean(ar.bullets),
        `${slug} section ${i}: bullets present in one locale only`,
      );
      if (section.bullets) {
        assert.equal(
          section.bullets.length,
          ar.bullets.length,
          `${slug} section ${i}: bullet counts differ`,
        );
      }
    });
  });

  test(`${slug}: updated date equals LEGAL_VERSION`, () => {
    assert.equal(content.en.updated, LEGAL_VERSION);
    assert.equal(content.ar.updated, LEGAL_VERSION);
  });

  test(`${slug}: only known tokens, no config placeholders baked in`, () => {
    for (const locale of ["en", "ar"]) {
      const doc = content[locale];
      for (const token of collectTokens(doc)) {
        assert.ok(LEGAL_TOKENS.includes(token), `${slug}.${locale} uses unknown token {${token}}`);
      }
      const text = JSON.stringify(doc);
      assert.ok(!text.includes(PLACEHOLDER_PREFIX), `${slug}.${locale} contains a placeholder`);
      assert.ok(!/\bTBD\b|\bTODO\b|lorem ipsum/i.test(text), `${slug}.${locale} has draft filler`);
    }
  });
}

test("registry helpers", () => {
  assert.equal(isLegalSlug("privacy"), true);
  assert.equal(isLegalSlug("admin"), false);
  assert.equal(isLegalSlug(42), false);
  assert.equal(getLegalDocument("terms", "ar").title, LEGAL_CONTENT.terms.ar.title);
  assert.equal(getLegalDocument("terms", "fr").title, LEGAL_CONTENT.terms.en.title);
  assert.ok(["draft", "reviewed"].includes(LEGAL_REVIEW_STATUS));
  assert.match(LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("renderLegalText substitutes known tokens and leaves unknown ones visible", () => {
  const business = buildBusinessDetails({
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "Revora Technologies LLC",
    NEXT_PUBLIC_LEGAL_ADDRESS: "Dubai, UAE",
    NEXT_PUBLIC_LEGAL_EMAIL: "legal@example.com",
  });
  assert.equal(
    renderLegalText("{entityName} at {address}: {email} {unknown}", business),
    "Revora Technologies LLC at Dubai, UAE: legal@example.com {unknown}",
  );
});

test("business details fall back to visible placeholders and report isConfigured", () => {
  const empty = buildBusinessDetails({});
  assert.equal(empty.isConfigured, false);
  assert.ok(empty.entityName.startsWith(PLACEHOLDER_PREFIX));
  assert.ok(empty.address.startsWith(PLACEHOLDER_PREFIX));
  assert.ok(empty.email.startsWith(PLACEHOLDER_PREFIX));
  assert.equal(empty.license, null);
  assert.equal(empty.jurisdiction, "mainland");

  const partial = buildBusinessDetails({
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "  Revora LLC ",
    NEXT_PUBLIC_LEGAL_EMAIL: "legal@example.com",
    NEXT_PUBLIC_LEGAL_LICENSE: " 12345 ",
    NEXT_PUBLIC_LEGAL_JURISDICTION: "DIFC",
  });
  assert.equal(partial.isConfigured, false, "address missing");
  assert.equal(partial.entityName, "Revora LLC");
  assert.equal(partial.license, "12345");
  assert.equal(partial.jurisdiction, "difc");

  const full = buildBusinessDetails({
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "Revora LLC",
    NEXT_PUBLIC_LEGAL_ADDRESS: "Dubai",
    NEXT_PUBLIC_LEGAL_EMAIL: "legal@example.com",
  });
  assert.equal(full.isConfigured, true);
});

test("parseJurisdiction rejects unknown values", () => {
  assert.equal(parseJurisdiction("adgm"), "adgm");
  assert.equal(parseJurisdiction("Mainland"), "mainland");
  assert.equal(parseJurisdiction("mars"), "mainland");
  assert.equal(parseJurisdiction(undefined), "mainland");
});
