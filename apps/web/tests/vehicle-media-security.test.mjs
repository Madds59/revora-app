import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 4B — vehicle-media upload authorization.
//
// uploadVehicleMediaAction previously persisted a client-chosen Storage bucket,
// a client-chosen object path, an unverified vehicle id and an unverified
// customer id. Severity was verified rather than assumed: every reader of
// `vehicle_media_uploads` renders `storage_path` as escaped text, and no
// service-role client, signed-URL generator or Storage operation consumes those
// columns today — so this is a write-boundary fix plus a release-gate guard
// that fails if a privileged reader appears without validation.

import {
  authorizeStoredVehicleMediaPath,
  buildVehicleMediaPath,
  parseOwnedVehicleMediaPath,
  vehicleMediaUploadSchema,
  VEHICLE_MEDIA_BUCKET,
  VEHICLE_MEDIA_TYPES,
} from "../src/lib/validation/vehicle-media.js";

const BIZ = "c883e981-3627-4482-be63-348b0950f15e";
const OTHER_BIZ = "11111111-2222-4333-8444-555566667777";
const VEH = "22222222-3333-4444-8555-666677778888";
const OTHER_VEH = "33333333-4444-4555-8666-777788889999";
const CUST = "44444444-5555-4666-8777-888899990000";
const AR = "صورة توضح الضرر في المصد الأمامي.";
const ok = (r) => r.success === true;

const p = (biz = BIZ, veh = VEH, name = "8f1e2d3c-photo.jpg") =>
  `${biz}/vehicles/${veh}/media/${name}`;

const validPayload = {
  vehicleId: VEH,
  objectPath: p(),
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: "20480",
  mediaType: "image",
};

// --- upload payload validation ---------------------------------------------

test("vehicle media: valid payload accepted and normalized", () => {
  const r = vehicleMediaUploadSchema.safeParse(validPayload);
  assert.equal(ok(r), true);
  assert.equal(r.data.sizeBytes, 20480);
  assert.equal(r.data.mediaType, "image");
  assert.equal(r.data.customerId, undefined);
});

test("vehicle media: Arabic description accepted and preserved", () => {
  const r = vehicleMediaUploadSchema.safeParse({ ...validPayload, description: `  ${AR}  ` });
  assert.equal(ok(r), true);
  assert.equal(r.data.description, AR);
});

test("vehicle media: malformed vehicle and customer ids rejected", () => {
  assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, vehicleId: "nope" })), false);
  assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, vehicleId: "" })), false);
  assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, customerId: "nope" })), false);
  // A blank customer stays optional — vehicles may have no linked customer.
  const blank = vehicleMediaUploadSchema.safeParse({ ...validPayload, customerId: "" });
  assert.equal(ok(blank), true);
  assert.equal(blank.data.customerId, undefined);
  const withCustomer = vehicleMediaUploadSchema.safeParse({ ...validPayload, customerId: CUST });
  assert.equal(withCustomer.data.customerId, CUST);
});

test("vehicle media: media type uses the database allowlist and defaults to other", () => {
  assert.deepEqual(VEHICLE_MEDIA_TYPES, ["image", "video", "document", "audio", "other"]);
  for (const t of VEHICLE_MEDIA_TYPES) {
    assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, mediaType: t })), true);
  }
  const blank = vehicleMediaUploadSchema.safeParse({ ...validPayload, mediaType: "" });
  assert.equal(blank.data.mediaType, "other");
  for (const bad of ["hologram", "IMAGE", "image ", "0"]) {
    assert.equal(
      ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, mediaType: bad })),
      false,
      `${bad} must be rejected`,
    );
  }
});

test("vehicle media: size must be a positive integer, no maximum invented", () => {
  for (const bad of ["0", "-1", "abc", "1.5", "1e999", ""]) {
    assert.equal(
      ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, sizeBytes: bad })),
      false,
      `size ${bad || "(blank)"} must be rejected`,
    );
  }
  // A very large upload is still accepted: no product-wide cap exists.
  assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, sizeBytes: "9999999999" })), true);
});

test("vehicle media: MIME shape-checked, filename is display metadata only", () => {
  for (const good of ["image/jpeg", "video/mp4", "application/pdf"]) {
    assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, mimeType: good })), true);
  }
  for (const bad of ["", "image", "image//png", "im age/png"]) {
    assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, mimeType: bad })), false);
  }
  for (const bad of ["", "a/b.png", "a\\b.png"]) {
    assert.equal(ok(vehicleMediaUploadSchema.safeParse({ ...validPayload, fileName: bad })), false);
  }
});

test("vehicle media: client-supplied bucket and tenant identity are not accepted fields", () => {
  const r = vehicleMediaUploadSchema.safeParse({
    ...validPayload,
    storage_bucket: "revora-public",
    storageBucket: "revora-public",
    business_id: OTHER_BIZ,
    businessId: OTHER_BIZ,
    uploaded_by: CUST,
  });
  assert.equal(ok(r), true);
  for (const key of ["storage_bucket", "storageBucket", "business_id", "businessId", "uploaded_by"]) {
    assert.equal(key in r.data, false, `${key} must be stripped`);
  }
});

// --- path ownership ---------------------------------------------------------

test("path: legitimate owned vehicle-media path parsed into components", () => {
  const parsed = parseOwnedVehicleMediaPath(p(), { businessId: BIZ, vehicleId: VEH });
  assert.notEqual(parsed, null);
  assert.equal(parsed.businessId, BIZ);
  assert.equal(parsed.vehicleId, VEH);
  assert.equal(parsed.objectName, "8f1e2d3c-photo.jpg");
  assert.equal(buildVehicleMediaPath(parsed), p());
});

test("path: wrong business and prefix collisions rejected", () => {
  for (const bad of [
    p(OTHER_BIZ),
    `${BIZ}-evil/vehicles/${VEH}/media/x.jpg`,
    `${BIZ}x/vehicles/${VEH}/media/x.jpg`,
    `${BIZ.slice(0, -1)}/vehicles/${VEH}/media/x.jpg`,
  ]) {
    assert.equal(parseOwnedVehicleMediaPath(bad, { businessId: BIZ, vehicleId: VEH }), null, bad);
  }
});

test("path: same-business WRONG vehicle rejected", () => {
  assert.equal(
    parseOwnedVehicleMediaPath(p(BIZ, OTHER_VEH), { businessId: BIZ, vehicleId: VEH }),
    null,
  );
  assert.equal(
    parseOwnedVehicleMediaPath(`${BIZ}/vehicles/not-a-uuid/media/x.jpg`, {
      businessId: BIZ, vehicleId: VEH,
    }),
    null,
  );
});

test("path: wrong namespace segments rejected", () => {
  for (const bad of [
    `${BIZ}/complaint-evidence/${VEH}/media/x.jpg`,
    `${BIZ}/vehicles/${VEH}/photos/x.jpg`,
    `${BIZ}/Vehicles/${VEH}/media/x.jpg`,
    `${BIZ}/vehicles/${VEH}/media/sub/x.jpg`,
    `${BIZ}/vehicles/${VEH}/x.jpg`,
  ]) {
    assert.equal(parseOwnedVehicleMediaPath(bad, { businessId: BIZ, vehicleId: VEH }), null, bad);
  }
});

test("path: traversal, absolute, backslash and empty segments rejected", () => {
  for (const bad of [
    `${BIZ}/vehicles/${VEH}/media/../../x.jpg`,
    `${BIZ}/vehicles/${VEH}/media/..`,
    `${BIZ}/vehicles/${VEH}/media/.`,
    `/${BIZ}/vehicles/${VEH}/media/x.jpg`,
    `${BIZ}/vehicles/${VEH}/media/x.jpg/`,
    `${BIZ}//vehicles/${VEH}/media/x.jpg`,
    `${BIZ}/vehicles/${VEH}/media//x.jpg`,
    `${BIZ}\\vehicles\\${VEH}\\media\\x.jpg`,
    "",
    BIZ,
  ]) {
    assert.equal(parseOwnedVehicleMediaPath(bad, { businessId: BIZ, vehicleId: VEH }), null, bad);
  }
});

test("path: control characters, NUL and unsafe object names rejected", () => {
  for (const ctrl of ["\u0000", "\u001F", "\u007F", "\n", "\t"]) {
    assert.equal(
      parseOwnedVehicleMediaPath(p(BIZ, VEH, `x${ctrl}.jpg`), { businessId: BIZ, vehicleId: VEH }),
      null,
    );
  }
  for (const name of ["-lead.jpg", ".hidden", "with space.jpg", "a".repeat(220)]) {
    assert.equal(
      parseOwnedVehicleMediaPath(p(BIZ, VEH, name), { businessId: BIZ, vehicleId: VEH }),
      null,
      name,
    );
  }
});

test("path: unverified business/vehicle inputs never authorize", () => {
  assert.equal(parseOwnedVehicleMediaPath(p(), { businessId: "nope", vehicleId: VEH }), null);
  assert.equal(parseOwnedVehicleMediaPath(p(), { businessId: BIZ, vehicleId: "nope" }), null);
  assert.equal(parseOwnedVehicleMediaPath(null, { businessId: BIZ, vehicleId: VEH }), null);
});

// --- privileged-boundary guard (for any future reader) ----------------------

test("guard: stored path authorized only with approved bucket and matching ids", () => {
  const okDecision = authorizeStoredVehicleMediaPath({
    storedPath: p(), storedBucket: VEHICLE_MEDIA_BUCKET, businessId: BIZ, vehicleId: VEH,
  });
  assert.equal(okDecision.allowed, true);
  assert.equal(okDecision.bucket, VEHICLE_MEDIA_BUCKET);
  assert.equal(okDecision.objectPath, p());

  // A row claiming a different bucket is refused, not followed.
  const badBucket = authorizeStoredVehicleMediaPath({
    storedPath: p(), storedBucket: "revora-public", businessId: BIZ, vehicleId: VEH,
  });
  assert.equal(badBucket.allowed, false);
  assert.equal(badBucket.code, "bucket_unapproved");
  assert.equal(badBucket.objectPath, undefined);
});

test("guard: cross-tenant, wrong-vehicle and malformed stored paths denied", () => {
  for (const storedPath of [p(OTHER_BIZ), p(BIZ, OTHER_VEH), `${BIZ}/vehicles/${VEH}/media/../x`, ""]) {
    const d = authorizeStoredVehicleMediaPath({
      storedPath, storedBucket: VEHICLE_MEDIA_BUCKET, businessId: BIZ, vehicleId: VEH,
    });
    assert.equal(d.allowed, false, storedPath);
    assert.equal(d.code, "path_unverified");
    assert.equal(d.objectPath, undefined);
  }
});

// --- source regressions ------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.resolve(here, "../src", rel), "utf8");
const action = src("lib/vehicle-intelligence/actions.ts");

test("security: upload validates, verifies the vehicle, and derives identity", () => {
  assert.match(action, /vehicleMediaUploadSchema\.safeParse\(/);
  assert.match(action, /firstValidationMessage\(/);
  // Vehicle resolved under the authenticated business before any write.
  assert.match(action, /\.from\("vehicles"\)[\s\S]{0,160}\.eq\("business_id", business\.id\)/);
  assert.match(action, /if \(!vehicle\) return \{ error: VEHICLE_MEDIA_UNAVAILABLE \}/);
  // Customer comes from the verified vehicle row; a mismatch is refused.
  assert.match(action, /customer_id: vehicle\.customer_id/);
  assert.match(action, /v\.customerId !== vehicle\.customer_id/);
});

test("security: bucket is server-controlled and the path is canonically rebuilt", () => {
  assert.match(action, /storage_bucket: VEHICLE_MEDIA_BUCKET/);
  assert.match(action, /storage_path: buildVehicleMediaPath\(ownedPath\)/);
  assert.match(action, /parseOwnedVehicleMediaPath\(v\.objectPath/);
  // The raw client bucket/path must never be persisted.
  assert.doesNotMatch(action, /storage_bucket: str\(formData/);
  assert.doesNotMatch(action, /storage_path: objectPath/);
  assert.doesNotMatch(action, /vehicle_id: vehicleId/);
});

test("security: errors are non-enumerating and logs carry codes only", () => {
  assert.match(action, /Vehicle media target not found or unavailable\./);
  assert.match(action, /console\.error\("recordVehicleMediaUpload failed", error\.code\)/);
  // The stored path must not be echoed into the AI tool-call audit payload.
  assert.doesNotMatch(action, /inputJson: \{ objectPath/);
});

test("security: no VIN decoding or specification enrichment in the media path", () => {
  const uploadFn = action.slice(action.indexOf("export async function uploadVehicleMediaAction"));
  assert.doesNotMatch(uploadFn, /decodeVin|validateVin|nhtsa|fetch\(/i);
});

// --- release gate: database-stored values at privileged boundaries -----------
//
// Registry of the service-role Storage consumers we know about. This is an
// explicit list, not a repo-wide regex, so it cannot go green by accident — but
// it also only covers what is enumerated here, which is why the standard
// documents the rule for new code.

test("release gate: vehicle media has no unguarded privileged reader", () => {
  const readers = [
    "app/[locale]/(dashboard)/vehicles/[id]/page.tsx",
    "app/[locale]/(portal)/portal/vehicles/[id]/page.tsx",
  ];
  for (const rel of readers) {
    const body = src(rel);
    assert.match(body, /storage_path/, `${rel} should still read vehicle media`);
    // If a reader ever starts signing/downloading, it must use the guard first.
    const privileged = /createAdminClient|createSignedUrl|signedUrl\(|\.download\(|\.remove\(|\.copy\(|\.move\(/;
    if (privileged.test(body)) {
      assert.match(
        body,
        /authorizeStoredVehicleMediaPath\(/,
        `${rel} performs a privileged Storage operation and must authorize the stored path first`,
      );
    }
  }
});

test("release gate: stored vehicle-media values are not rendered as active URLs", () => {
  for (const rel of [
    "app/[locale]/(dashboard)/vehicles/[id]/page.tsx",
    "app/[locale]/(portal)/portal/vehicles/[id]/page.tsx",
  ]) {
    const body = src(rel).replace(/\s+/g, " ");
    for (const attr of ["src=", "href=", "background", "srcSet="]) {
      assert.ok(
        !new RegExp(`${attr}\\{[^}]{0,80}storage_path`).test(body),
        `${rel} must not render storage_path into ${attr}`,
      );
    }
  }
});

test("release gate: the standard records the stored-value revalidation rule", () => {
  const standard = readFileSync(
    path.resolve(here, "../../../docs/security/INPUT_VALIDATION_STANDARD.md"),
    "utf8",
  );
  assert.match(standard, /revalidated immediately before/i);
  assert.match(standard, /service-role/i);
});

test("release gate: no migration, RLS change, or upload-size cap was introduced", () => {
  const moduleSrc = src("lib/validation/vehicle-media.js");
  assert.match(moduleSrc, /Number\.isInteger\(n\) && n > 0/);
  assert.doesNotMatch(moduleSrc, /MAX_(UPLOAD|FILE)_SIZE|maxSizeBytes/);
  assert.match(moduleSrc, /no policy or migration change/i);
});
