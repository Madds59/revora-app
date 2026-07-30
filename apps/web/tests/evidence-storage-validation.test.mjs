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
  assert.match(evidenceAction, /parseNewResourceBoundPath\(/);
  assert.match(documentAction, /parseNewResourceBoundPath\(/);
});

test("security: business scope is server-derived, never client-supplied", () => {
  // Complaint evidence takes its business from the RLS-verified complaint row.
  assert.match(evidenceAction, /\.from\("complaints"\)[\s\S]{0,120}\.eq\("id", v\.complaintId\)/);
  assert.match(evidenceAction, /complaint\.business_id/);
  // Documents take theirs from requireMembership().
  assert.match(documentAction, /requireMembership\(\)/);
  assert.match(documentAction, /businessId: business\.id/);
  assert.match(documentAction, /business_id: business\.id/);
});

test("security: only verified path components reach Storage/DB writes", () => {
  // The raw client string must never be persisted or passed to the RPC.
  assert.doesNotMatch(evidenceAction, /p_object_path:\s*v\.objectPath/);
  assert.doesNotMatch(documentAction, /object_path:\s*v\.objectPath/);
  assert.match(evidenceAction, /p_object_path:\s*buildResourceBoundPath\(ownedPath\)/);
  assert.match(documentAction, /object_path:\s*objectPath/);
  assert.match(documentAction, /buildResourceBoundPath\(ownedPath\)/);
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

// === APPSEC-09 Phase 4A corrective pass ====================================
// Two risks the first cut did not close:
//   (a) rows written BEFORE this branch may already hold cross-tenant paths,
//       and the read path signed whatever was stored with the service role;
//   (b) the 3-segment grammar bound a path to a business but not to a resource,
//       so a same-business object could be re-attached to another customer's
//       complaint and signed for them.

import {
  authorizeStoredPathForSigning,
  buildResourceBoundPath,
  parseNewResourceBoundPath,
  parseStoredEvidencePath,
  RESOURCE_BOUND_NAMESPACES,
} from "../src/lib/validation/evidence.js";

const JOB = "33333333-4444-4555-8666-777788889999";
const OTHER_RES = "44444444-5555-4666-8777-888899990000";
const v2 = (biz, ns, res, name = "8f1e-photo.jpg") => `${biz}/${ns}/${res}/${name}`;

// --- v2 write binding -------------------------------------------------------

test("v2 write: path bound to the verified complaint is accepted", () => {
  const p = parseNewResourceBoundPath(v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, CID), {
    businessId: BIZ,
    namespace: COMPLAINT_EVIDENCE_ENTITY,
    resourceId: CID,
  });
  assert.notEqual(p, null);
  assert.equal(p.version, 2);
  assert.equal(p.resourceId, CID);
  assert.equal(buildResourceBoundPath(p), v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, CID));
});

test("v2 write: same-business path for a DIFFERENT complaint is rejected", () => {
  // This is the cross-customer reuse case: the object exists in the same
  // business, but belongs to another complaint.
  assert.equal(
    parseNewResourceBoundPath(v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, OTHER_RES), {
      businessId: BIZ,
      namespace: COMPLAINT_EVIDENCE_ENTITY,
      resourceId: CID,
    }),
    null,
  );
});

test("v2 write: wrong business, wrong namespace and unbound v1 all rejected", () => {
  const ctx = { businessId: BIZ, namespace: COMPLAINT_EVIDENCE_ENTITY, resourceId: CID };
  assert.equal(parseNewResourceBoundPath(v2(OTHER_BIZ, COMPLAINT_EVIDENCE_ENTITY, CID), ctx), null);
  assert.equal(parseNewResourceBoundPath(v2(BIZ, "job-photos", CID), ctx), null);
  assert.equal(parseNewResourceBoundPath(`${BIZ}-evil/${COMPLAINT_EVIDENCE_ENTITY}/${CID}/x.jpg`, ctx), null);
  // A legacy 3-segment path is no longer acceptable for a NEW write.
  assert.equal(parseNewResourceBoundPath(`${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, ctx), null);
});

test("v2 write: job photos are bound to the verified job", () => {
  const ctx = { businessId: BIZ, namespace: "job-photos", resourceId: JOB };
  assert.notEqual(parseNewResourceBoundPath(v2(BIZ, "job-photos", JOB), ctx), null);
  assert.equal(parseNewResourceBoundPath(v2(BIZ, "job-photos", OTHER_RES), ctx), null);
});

test("v2 write: malformed resource segment and traversal rejected", () => {
  const ctx = { businessId: BIZ, namespace: COMPLAINT_EVIDENCE_ENTITY, resourceId: CID };
  for (const bad of [
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/not-a-uuid/x.jpg`,
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/${CID}/../x.jpg`,
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/${CID}//x.jpg`,
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/${CID}/a/x.jpg`,
    `/${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/${CID}/x.jpg`,
  ]) {
    assert.equal(parseNewResourceBoundPath(bad, ctx), null, `${bad} must be rejected`);
  }
});

test("v2: a verified resource id is mandatory — none means no authorization", () => {
  assert.equal(
    parseStoredEvidencePath(v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, CID), {
      businessId: BIZ,
      namespace: COMPLAINT_EVIDENCE_ENTITY,
    }),
    null,
  );
});

// --- read-time signing authorization ---------------------------------------

const signCtx = (over = {}) => ({
  businessId: BIZ,
  namespace: COMPLAINT_EVIDENCE_ENTITY,
  resourceId: CID,
  actor: "staff",
  ...over,
});

test("signing: valid v2 path is authorized and rebuilt canonically", () => {
  const d = authorizeStoredPathForSigning(v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, CID), signCtx());
  assert.equal(d.allowed, true);
  assert.equal(d.objectPath, v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, CID));
});

test("signing: cross-tenant stored path denied before the signer (legacy AND v2)", () => {
  // The legacy row is the pre-patch attack: it is already in the database.
  const legacyCross = authorizeStoredPathForSigning(
    `${OTHER_BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`,
    signCtx(),
  );
  assert.equal(legacyCross.allowed, false);
  assert.equal(legacyCross.code, "path_unverified");
  assert.equal(legacyCross.objectPath, undefined);

  const v2Cross = authorizeStoredPathForSigning(
    v2(OTHER_BIZ, COMPLAINT_EVIDENCE_ENTITY, CID),
    signCtx(),
  );
  assert.equal(v2Cross.allowed, false);
});

test("signing: same-business WRONG-resource v2 path denied", () => {
  const d = authorizeStoredPathForSigning(
    v2(BIZ, COMPLAINT_EVIDENCE_ENTITY, OTHER_RES),
    signCtx(),
  );
  assert.equal(d.allowed, false);
  assert.equal(d.code, "path_unverified");
});

test("signing: malformed stored paths denied with a stable code", () => {
  for (const bad of [
    `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/${CID}/../../x.jpg`,
    `${BIZ}\\${COMPLAINT_EVIDENCE_ENTITY}\\x.jpg`,
    `${BIZ}//${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`,
    "",
  ]) {
    const d = authorizeStoredPathForSigning(bad, signCtx());
    assert.equal(d.allowed, false, `${bad} must be denied`);
    assert.equal(d.code, "path_unverified");
  }
});

test("signing: wrong namespace denied", () => {
  assert.equal(
    authorizeStoredPathForSigning(v2(BIZ, "job-photos", CID), signCtx()).allowed,
    false,
  );
});

// --- legacy compatibility policy --------------------------------------------

test("legacy: unbound path is staff-viewable but FAILS CLOSED for portal customers", () => {
  const legacy = `${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/8f1e-photo.jpg`;
  const staff = authorizeStoredPathForSigning(legacy, signCtx({ actor: "staff" }));
  assert.equal(staff.allowed, true);
  assert.equal(staff.legacy, true);
  assert.equal(staff.objectPath, legacy);

  const customer = authorizeStoredPathForSigning(legacy, signCtx({ actor: "customer" }));
  assert.equal(customer.allowed, false);
  assert.equal(customer.code, "legacy_unbound_customer");
});

test("legacy: staff allowance still requires exact business and namespace", () => {
  const staffCtx = signCtx({ actor: "staff" });
  assert.equal(
    authorizeStoredPathForSigning(`${OTHER_BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, staffCtx).allowed,
    false,
  );
  assert.equal(
    authorizeStoredPathForSigning(`${BIZ}-evil/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, staffCtx).allowed,
    false,
  );
  assert.equal(
    authorizeStoredPathForSigning(`${BIZ}/documents/x.jpg`, staffCtx).allowed,
    false,
  );
});

test("legacy: the documents namespace is business-scoped by design, not legacy-gated", () => {
  // Standalone documents have no single owning resource, so a 3-segment path is
  // their canonical form — but a customer still needs independently proven
  // ownership of the row (see the fail-closed tests below).
  const d = authorizeStoredPathForSigning(`${BIZ}/documents/8f1e-file.pdf`, {
    businessId: BIZ,
    namespace: "documents",
    actor: "customer",
    ownershipProven: true,
  });
  assert.equal(d.allowed, true);
  assert.equal(RESOURCE_BOUND_NAMESPACES.documents, undefined);
  assert.equal(RESOURCE_BOUND_NAMESPACES[COMPLAINT_EVIDENCE_ENTITY], "complaint");
  assert.equal(RESOURCE_BOUND_NAMESPACES["job-photos"], "job");
});

// --- static regressions for the corrective pass -----------------------------

const storageSrc = readFileSync(path.resolve(here, "../src/lib/storage.ts"), "utf8");
const evidenceLib = readFileSync(path.resolve(here, "../src/lib/evidence.ts"), "utf8");
const documentsLib = readFileSync(path.resolve(here, "../src/lib/documents.ts"), "utf8");
const portalDocs = readFileSync(
  path.resolve(here, "../src/app/[locale]/(portal)/portal/documents/page.tsx"),
  "utf8",
);

test("security: every service-role read site goes through the signing guard", () => {
  for (const [name, src] of [
    ["evidence.ts", evidenceLib],
    ["documents.ts", documentsLib],
    ["portal documents page", portalDocs],
  ]) {
    assert.match(src, /signOwnedStorageObject\(/, `${name} must use the guard`);
    // The raw stored path must never be handed straight to the signer.
    assert.doesNotMatch(
      src.replace(/\s+/g, " "),
      /signedUrl\(\s*row\.media/,
      `${name} must not sign the stored path directly`,
    );
  }
});

test("security: the guard authorizes before signing and logs only a code", () => {
  assert.match(storageSrc, /authorizeStoredPathForSigning\(/);
  // Authorization must precede the signedUrl call inside the guard.
  const guard = storageSrc.slice(storageSrc.indexOf("signOwnedStorageObject"));
  assert.ok(
    guard.indexOf("authorizeStoredPathForSigning") < guard.indexOf("return signedUrl("),
    "authorization must run before signing",
  );
  assert.match(storageSrc, /decision\.code/);
  assert.doesNotMatch(storageSrc, /console\.error\([^)]*objectPath/);
});

test("security: new writes require resource-bound paths", () => {
  assert.match(evidenceAction, /parseNewResourceBoundPath\(/);
  assert.match(evidenceAction, /resourceId: complaint\.id/);
  assert.match(documentAction, /parseNewResourceBoundPath\(/);
  assert.match(documentAction, /resourceId: links\.jobId/);
});

test("security: uploader emits the resource-bound key when a parent is given", () => {
  const uploader = readFileSync(path.resolve(here, "../src/components/file-upload.tsx"), "utf8");
  assert.match(uploader, /resourceId\s*\n?\s*\?\s*`\$\{businessId\}\/\$\{entity\}\/\$\{resourceId\}/);
});

test("security: corrective pass introduced no migration or RLS change", () => {
  const standard = readFileSync(
    path.resolve(here, "../../../docs/security/INPUT_VALIDATION_STANDARD.md"),
    "utf8",
  );
  assert.match(standard, /no policy or migration change/i);
});

// --- standalone-document ownership proof (release-critical residual) --------

test("standalone documents: portal customer FAILS CLOSED without ownership proof", () => {
  const unbound = `${BIZ}/documents/8f1e-file.pdf`;
  const noProof = authorizeStoredPathForSigning(unbound, {
    businessId: BIZ, namespace: "documents", actor: "customer",
  });
  assert.equal(noProof.allowed, false);
  assert.equal(noProof.code, "unbound_customer_unproven");
  assert.equal(noProof.objectPath, undefined);

  // Explicitly passing false must not be treated as proof either.
  assert.equal(
    authorizeStoredPathForSigning(unbound, {
      businessId: BIZ, namespace: "documents", actor: "customer", ownershipProven: false,
    }).allowed,
    false,
  );
  // Only a truthy-but-not-true value must also fail (no coercion).
  assert.equal(
    authorizeStoredPathForSigning(unbound, {
      businessId: BIZ, namespace: "documents", actor: "customer", ownershipProven: "yes",
    }).allowed,
    false,
  );
});

test("standalone documents: proven-ownership customer is allowed; staff unchanged", () => {
  const unbound = `${BIZ}/documents/8f1e-file.pdf`;
  const proven = authorizeStoredPathForSigning(unbound, {
    businessId: BIZ, namespace: "documents", actor: "customer", ownershipProven: true,
  });
  assert.equal(proven.allowed, true);
  assert.equal(proven.objectPath, unbound);

  // Staff keep business-wide access without needing per-row proof.
  assert.equal(
    authorizeStoredPathForSigning(unbound, {
      businessId: BIZ, namespace: "documents", actor: "staff",
    }).allowed,
    true,
  );
});

test("standalone documents: ownership proof never rescues a bad path", () => {
  const proven = { ownershipProven: true, actor: "customer" };
  // Cross-tenant, wrong namespace and traversal still fail with proof supplied.
  assert.equal(
    authorizeStoredPathForSigning(`${OTHER_BIZ}/documents/x.pdf`, {
      businessId: BIZ, namespace: "documents", ...proven,
    }).allowed,
    false,
  );
  assert.equal(
    authorizeStoredPathForSigning(`${BIZ}-evil/documents/x.pdf`, {
      businessId: BIZ, namespace: "documents", ...proven,
    }).allowed,
    false,
  );
  assert.equal(
    authorizeStoredPathForSigning(`${BIZ}/documents/../x.pdf`, {
      businessId: BIZ, namespace: "documents", ...proven,
    }).allowed,
    false,
  );
  // And proof does NOT unlock an unbound resource-bound namespace for customers.
  assert.equal(
    authorizeStoredPathForSigning(`${BIZ}/${COMPLAINT_EVIDENCE_ENTITY}/x.jpg`, {
      businessId: BIZ, namespace: COMPLAINT_EVIDENCE_ENTITY, resourceId: CID, ...proven,
    }).code,
    "legacy_unbound_customer",
  );
});

test("security: the portal documents page supplies ownership proof from session accounts", () => {
  const portalDocsPage = readFileSync(
    path.resolve(here, "../src/app/[locale]/(portal)/portal/documents/page.tsx"),
    "utf8",
  );
  assert.match(portalDocsPage, /ownershipProven:\s*\n?\s*!!row\.customer_id && customerIds\.includes\(row\.customer_id\)/);
  // The proof must come from the session-derived account ids.
  assert.match(portalDocsPage, /const customerIds = accounts\.map\(/);
});
