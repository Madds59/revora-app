import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 4A — evidence / attachment Storage-path ownership.
//
// Why these matter: private evidence is read back through `signedUrl()`, which
// signs with the SERVICE ROLE and bypasses Storage RLS. A recorded object path
// pointing at another tenant's namespace would therefore become a working
// signed URL, so the path must be provably owned before it is ever persisted.

import {
  complaintEvidenceSchema,
  documentContextSchema,
  documentUploadSchema,
  evidenceMetadataSchema,
  parseOwnedComplaintEvidencePath,
  parseOwnedDocumentPath,
  parseOwnedStoragePath,
  COMPLAINT_EVIDENCE_ENTITY,
  DOCUMENT_ENTITIES,
} from "../src/lib/validation/evidence.js";

const BIZ = "c883e981-3627-4482-be63-348b0950f15e";
const OTHER_BIZ = "11111111-2222-4333-8444-555566667777";
const CID = "22222222-3333-4444-8555-666677778888";
const AR = "صورة توضح الضرر في المكابح.";
const ok = (r) => r.success === true;

const validMeta = {
  objectPath: `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/8f1e2d3c-photo.jpg`,
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: "20480",
};

// --- payload schemas --------------------------------------------------------

test("evidence: valid complaint payload accepted", () => {
  const r = complaintEvidenceSchema.safeParse({ ...validMeta, complaintId: CID });
  assert.equal(ok(r), true);
  assert.equal(r.data.sizeBytes, 20480);
  assert.equal(r.data.mimeType, "image/jpeg");
});

test("evidence: Arabic description accepted and preserved", () => {
  const r = complaintEvidenceSchema.safeParse({
    ...validMeta,
    complaintId: CID,
    description: `  ${AR}  `,
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.description, AR);
});

test("evidence: malformed complaint id rejected", () => {
  for (const bad of ["not-a-uuid", "", null]) {
    assert.equal(
      ok(complaintEvidenceSchema.safeParse({ ...validMeta, complaintId: bad })),
      false,
      `${bad} should be rejected`,
    );
  }
});

test("evidence: blank/malformed upload path rejected at the schema", () => {
  assert.equal(
    ok(complaintEvidenceSchema.safeParse({ ...validMeta, complaintId: CID, objectPath: "" })),
    false,
  );
  assert.equal(
    ok(complaintEvidenceSchema.safeParse({ ...validMeta, complaintId: CID, objectPath: "   " })),
    false,
  );
});

// --- file metadata ----------------------------------------------------------

test("evidence: size must be a real positive integer (zero-byte rejected)", () => {
  for (const bad of ["0", "-1", "abc", "1.5", "1e999", ""]) {
    assert.equal(
      ok(evidenceMetadataSchema.safeParse({ ...validMeta, sizeBytes: bad })),
      false,
      `size ${bad || "(blank)"} should be rejected`,
    );
  }
  assert.equal(ok(evidenceMetadataSchema.safeParse({ ...validMeta, sizeBytes: "1" })), true);
});

test("evidence: MIME is shape-checked only — no invented allowlist", () => {
  // The product defines no evidence MIME allowlist (documents accept */*), so
  // non-image types must still pass; only malformed tokens are refused.
  for (const good of ["image/png", "application/pdf", "video/mp4", "text/csv"]) {
    assert.equal(
      ok(evidenceMetadataSchema.safeParse({ ...validMeta, mimeType: good })),
      true,
      `${good} should be accepted`,
    );
  }
  for (const bad of ["", "image", "image//png", "image/png; drop table", "im age/png"]) {
    assert.equal(
      ok(evidenceMetadataSchema.safeParse({ ...validMeta, mimeType: bad })),
      false,
      `${bad || "(blank)"} should be rejected`,
    );
  }
});

test("evidence: filename is display metadata — separators and blanks rejected", () => {
  for (const bad of ["", "   ", "a/b.png", "a\\b.png"]) {
    assert.equal(
      ok(evidenceMetadataSchema.safeParse({ ...validMeta, fileName: bad })),
      false,
      `${bad || "(blank)"} should be rejected`,
    );
  }
  const r = evidenceMetadataSchema.safeParse({ ...validMeta, fileName: "  تقرير.pdf  " });
  assert.equal(ok(r), true);
  assert.equal(r.data.fileName, "تقرير.pdf"); // Unicode display names preserved
});

// --- path ownership ---------------------------------------------------------

test("path: legitimate owned evidence path accepted and parsed into components", () => {
  const p = parseOwnedComplaintEvidencePath(
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/8f1e2d3c-photo.jpg`,
    BIZ,
  );
  assert.notEqual(p, null);
  assert.equal(p.businessId, BIZ);
  assert.equal(p.entity, COMPLAINT_EVIDENCE_ENTITY);
  assert.equal(p.objectName, "8f1e2d3c-photo.jpg");
});

test("path: cross-tenant namespace and prefix collisions rejected", () => {
  const rejected = [
    `${OTHER_BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, // another business
    `${BIZ}-evil/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, // prefix collision
    `${BIZ}x/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, // prefix collision
    `${BIZ.slice(0, -1)}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, // truncated id
  ];
  for (const p of rejected) {
    assert.equal(parseOwnedComplaintEvidencePath(p, BIZ), null, `${p} must be rejected`);
  }
});

test("path: traversal, absolute, backslash, and empty segments rejected", () => {
  const rejected = [
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/../../${OTHER_BIZ}/x.jpg`,
    `${BIZ}/../${OTHER_BIZ}/x.jpg`,
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/..`,
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/.`,
    `/${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, // absolute
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg/`, // trailing slash
    `${BIZ}//${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, // double slash
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}//x.jpg`, // empty segment
    `${BIZ}\\${COMPLAINT_EVIDENCE_ENTITY}\\x.jpg`, // backslash
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/sub/x.jpg`, // extra segment
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}`, // missing segment
    BIZ,
    "",
  ];
  for (const p of rejected) {
    assert.equal(parseOwnedComplaintEvidencePath(p, BIZ), null, `${p} must be rejected`);
  }
});

test("path: control characters and NUL rejected", () => {
  for (const ctrl of ["\u0000", "\u0001", "\u001F", "\u007F", "\n", "\r", "\t"]) {
    const bad = `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x${ctrl}.jpg`;
    assert.equal(
      parseOwnedComplaintEvidencePath(bad, BIZ),
      null,
      `control char U+${ctrl.charCodeAt(0).toString(16)} must be rejected`,
    );
  }
});

test("path: unsafe object names rejected", () => {
  for (const name of ["-leading-dash.jpg", ".hidden", "with space.jpg", "a".repeat(220)]) {
    assert.equal(
      parseOwnedComplaintEvidencePath(`${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/${name}`, BIZ),
      null,
      `${name} must be rejected`,
    );
  }
});

test("path: namespace must match the action — entities are not interchangeable", () => {
  // A document namespace must not pass the complaint-evidence check...
  assert.equal(parseOwnedComplaintEvidencePath(`${BIZ}/documents/x.jpg`, BIZ), null);
  assert.equal(parseOwnedComplaintEvidencePath(`${BIZ}/job-photos/x.jpg`, BIZ), null);
  assert.equal(parseOwnedComplaintEvidencePath(`${BIZ}/branding/x.png`, BIZ), null);
  // ...and complaint evidence must not pass the document check.
  assert.equal(parseOwnedDocumentPath(`${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, BIZ), null);
  for (const entity of DOCUMENT_ENTITIES) {
    assert.notEqual(parseOwnedDocumentPath(`${BIZ}/${entity}/8f-x.jpg`, BIZ), null);
  }
});

test("path: malformed business id or missing allowlist never authorizes", () => {
  assert.equal(parseOwnedStoragePath(`${BIZ}/documents/x.jpg`, { businessId: "nope", allowedEntities: ["documents"] }), null);
  assert.equal(parseOwnedStoragePath(`${BIZ}/documents/x.jpg`, { businessId: BIZ, allowedEntities: [] }), null);
  assert.equal(parseOwnedStoragePath(null, { businessId: BIZ, allowedEntities: ["documents"] }), null);
  assert.equal(parseOwnedStoragePath(`${BIZ}/documents/x.jpg`, { businessId: null, allowedEntities: ["documents"] }), null);
});

// --- document context -------------------------------------------------------

test("documents: link ids validated, blanks normalized, malformed rejected", () => {
  const r = documentContextSchema.safeParse({
    customerId: CID,
    quotationId: "",
    complaintId: null,
    jobId: undefined,
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.customerId, CID);
  assert.equal(r.data.quotationId, undefined);
  assert.equal(ok(documentContextSchema.safeParse({ jobId: "not-a-uuid" })), false);
});

test("documents: upload payload strips client-supplied tenant identity", () => {
  const r = documentUploadSchema.safeParse({
    ...validMeta,
    objectPath: `${BIZ}/documents/8f-x.pdf`,
    business_id: OTHER_BIZ,
    businessId: OTHER_BIZ,
    uploaded_by: CID,
    bucket: "revora-public",
  });
  assert.equal(ok(r), true);
  for (const key of ["business_id", "businessId", "uploaded_by", "bucket"]) {
    assert.equal(key in r.data, false, `${key} must be stripped`);
  }
});

// --- static regressions -----------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceAction = readFileSync(path.resolve(here, "../src/lib/evidence-actions.ts"), "utf8");
const documentAction = readFileSync(path.resolve(here, "../src/lib/document-actions.ts"), "utf8");

test("security: evidence actions validate and pin the path before mutating", () => {
  assert.match(evidenceAction, /complaintEvidenceSchema\.safeParse\(/);
  assert.match(documentAction, /documentUploadSchema\.safeParse\(/);
  assert.match(evidenceAction, /firstValidationMessage\(/);
  assert.match(documentAction, /firstValidationMessage\(/);
  // Path ownership is proven before the RPC / insert.
  assert.match(evidenceAction, /parseOwnedComplaintEvidencePath\(/);
  assert.match(documentAction, /parseOwnedDocumentPath\(/);
});

test("security: business scope is server-derived, never client-supplied", () => {
  // Complaint evidence takes its business from the RLS-verified complaint row.
  assert.match(evidenceAction, /\.from\("complaints"\)[\s\S]{0,120}\.eq\("id", v\.complaintId\)/);
  assert.match(evidenceAction, /complaint\.business_id/);
  // Documents take theirs from requireMembership().
  assert.match(documentAction, /requireMembership\(\)/);
  assert.match(documentAction, /parseOwnedDocumentPath\(v\.objectPath, business\.id\)/);
  assert.match(documentAction, /business_id: business\.id/);
});

test("security: only verified path components reach Storage/DB writes", () => {
  // The raw client string must never be persisted or passed to the RPC.
  assert.doesNotMatch(evidenceAction, /p_object_path:\s*v\.objectPath/);
  assert.doesNotMatch(documentAction, /object_path:\s*v\.objectPath/);
  assert.match(evidenceAction, /p_object_path:\s*`\$\{ownedPath\.businessId\}/);
  assert.match(documentAction, /object_path:\s*objectPath/);
  assert.match(documentAction, /const objectPath = `\$\{ownedPath\.businessId\}/);
});

test("security: linked document resources are ownership-checked before insert", () => {
  assert.match(documentAction, /LINK_TABLES/);
  assert.match(documentAction, /\.eq\("business_id", business\.id\)/);
  assert.match(documentAction, /if \(!row\) return \{ error: TARGET_UNAVAILABLE \}/);
});

test("security: ownership failures are non-enumerating and errors stay generic", () => {
  for (const src of [evidenceAction, documentAction]) {
    assert.match(src, /Evidence target not found or unavailable\./);
    // Raw provider messages must not be returned or logged.
    assert.doesNotMatch(src, /error\.message/);
  }
});

test("security: no Storage remove/delete path exists to be abused", () => {
  // Phase 4A found no evidence deletion/replacement action anywhere; assert that
  // none was introduced here with an unverified client path.
  for (const src of [evidenceAction, documentAction]) {
    assert.doesNotMatch(src, /storage\s*\.\s*from\([\s\S]{0,40}\.remove\(/);
    assert.doesNotMatch(src, /\.remove\(/);
  }
});

test("security: no product-wide upload-size limit was invented", () => {
  const schemaSrc = readFileSync(
    path.resolve(here, "../src/lib/validation/evidence.js"),
    "utf8",
  );
  // Size is bounded below (positive integer) but deliberately has no maximum.
  assert.match(schemaSrc, /Number\.isInteger\(n\) && n > 0/);
  assert.doesNotMatch(schemaSrc, /MAX_(UPLOAD|FILE)_SIZE|maxSizeBytes/);
});
