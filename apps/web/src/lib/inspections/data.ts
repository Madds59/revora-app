import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PRIVATE_BUCKET, signOwnedStorageObject } from "@/lib/storage";
import { INSPECTION_ITEM_ENTITY } from "@/lib/validation/evidence";
import type {
  InspectionContext,
  InspectionResult,
  InspectionStatus,
} from "@/lib/database.types";

/**
 * Read models for the digital vehicle inspection surfaces.
 *
 * Each audience gets its OWN query with its own explicit column list, rather
 * than one shared "get inspection" that later filters fields. The customer and
 * public payloads therefore cannot leak an internal column by accident: a field
 * that is never selected cannot be rendered, logged, or serialised into the RSC
 * payload. Spec section 13 lists what the public payload may and may not carry.
 */

export type InspectionPhoto = {
  id: string;
  url: string;
  fileName: string;
};

export type InspectionItemView = {
  id: string;
  section: string;
  label: string;
  position: number;
  result: InspectionResult;
  note: string | null;
  photos: InspectionPhoto[];
};

export type StaffInspection = {
  id: string;
  status: InspectionStatus;
  context: InspectionContext;
  title: string | null;
  summary: string | null;
  odometerReading: number | null;
  createdAt: string;
  completedAt: string | null;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleLabel: string;
  jobId: string | null;
  appointmentId: string | null;
  quotationId: string | null;
  share: {
    active: boolean;
    createdAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  };
  items: InspectionItemView[];
};

/** `Make Model · PLATE`, with each part omitted when the column is null. */
function vehicleLabel(v: {
  make: string | null;
  model: string | null;
  plate_number: string | null;
}): string {
  const name = [v.make, v.model].filter(Boolean).join(" ").trim();
  return [name || null, v.plate_number].filter(Boolean).join(" · ");
}

/**
 * Sign the photos for a set of checklist items.
 *
 * Signing uses the service role and so bypasses Storage RLS -- the caller MUST
 * already have proven it may see this inspection. Every path is re-authorized
 * against the owning business, the `inspection-item` namespace and the exact
 * item id before a URL is minted, so a row pointing at another tenant's object
 * degrades to "no photo" instead of a working link.
 */
async function signItemPhotos(
  itemIds: string[],
  businessId: string,
  actor: "staff" | "customer",
): Promise<Map<string, InspectionPhoto[]>> {
  const byItem = new Map<string, InspectionPhoto[]>();
  if (itemIds.length === 0) return byItem;

  // Service role: the public/portal readers have no RLS grant on the junction
  // table, and the staff reader has already been scoped by business id.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inspection_item_media")
    .select(
      "id, inspection_item_id, media_assets(object_path, file_name, bucket, business_id)",
    )
    .in("inspection_item_id", itemIds)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    if (error) console.error("signItemPhotos lookup failed", error.code);
    return byItem;
  }

  for (const row of data) {
    const asset = row.media_assets as unknown as {
      object_path: string;
      file_name: string;
      bucket: string;
      business_id: string;
    } | null;
    // Cross-check the asset's own business, not just the junction row's.
    if (!asset || asset.bucket !== PRIVATE_BUCKET) continue;
    if (asset.business_id !== businessId) continue;

    const url = await signOwnedStorageObject(asset.object_path, {
      businessId,
      namespace: INSPECTION_ITEM_ENTITY,
      resourceId: row.inspection_item_id,
      actor,
    });
    if (!url) continue;

    const list = byItem.get(row.inspection_item_id) ?? [];
    list.push({ id: row.id, url, fileName: asset.file_name });
    byItem.set(row.inspection_item_id, list);
  }
  return byItem;
}

export type InspectionListRow = {
  id: string;
  status: InspectionStatus;
  context: InspectionContext;
  createdAt: string;
  completedAt: string | null;
  customerName: string;
  vehicleLabel: string;
  quotationId: string | null;
};

/** Staff list, newest first, optionally narrowed to one vehicle/customer/job. */
export async function listStaffInspections(
  businessId: string,
  filters: {
    vehicleId?: string;
    customerId?: string;
    jobId?: string;
    status?: InspectionStatus;
    limit?: number;
  } = {},
): Promise<InspectionListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("vehicle_inspections")
    .select(
      "id, status, context, created_at, completed_at, quotation_id, customers(full_name), vehicles(make, model, plate_number)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.jobId) query = query.eq("job_id", filters.jobId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error || !data) {
    if (error) console.error("listStaffInspections failed", error.code);
    return [];
  }

  return data.map((row) => {
    const customer = row.customers as unknown as { full_name: string } | null;
    const vehicle = row.vehicles as unknown as {
      make: string | null;
      model: string | null;
      plate_number: string | null;
    } | null;
    return {
      id: row.id,
      status: row.status,
      context: row.context,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      quotationId: row.quotation_id,
      customerName: customer?.full_name ?? "",
      vehicleLabel: vehicle ? vehicleLabel(vehicle) : "",
    };
  });
}

/**
 * Full staff read model. Returns `null` for a missing inspection AND for one
 * belonging to another tenant -- the caller must render the same "not found"
 * either way so the id space cannot be probed.
 */
export async function getStaffInspection(
  inspectionId: string,
  businessId: string,
): Promise<StaffInspection | null> {
  const supabase = await createClient();
  const { data: header, error } = await supabase
    .from("vehicle_inspections")
    .select(
      "id, status, context, title, summary, odometer_reading, created_at, completed_at, customer_id, vehicle_id, job_id, appointment_id, quotation_id, share_created_at, share_expires_at, share_revoked_at, share_token_hash, customers(full_name), vehicles(make, model, plate_number)",
    )
    .eq("business_id", businessId)
    .eq("id", inspectionId)
    .maybeSingle();

  if (error) console.error("getStaffInspection failed", error.code);
  if (!header) return null;

  const { data: items } = await supabase
    .from("inspection_items")
    .select("id, section, label, position, result, note")
    .eq("inspection_id", inspectionId)
    .eq("business_id", businessId)
    .order("position", { ascending: true });

  const rows = items ?? [];
  const photos = await signItemPhotos(
    rows.map((i) => i.id),
    businessId,
    "staff",
  );

  const customer = header.customers as unknown as { full_name: string } | null;
  const vehicle = header.vehicles as unknown as {
    make: string | null;
    model: string | null;
    plate_number: string | null;
  } | null;

  return {
    id: header.id,
    status: header.status,
    context: header.context,
    title: header.title,
    summary: header.summary,
    odometerReading: header.odometer_reading,
    createdAt: header.created_at,
    completedAt: header.completed_at,
    customerId: header.customer_id,
    customerName: customer?.full_name ?? "",
    vehicleId: header.vehicle_id,
    vehicleLabel: vehicle ? vehicleLabel(vehicle) : "",
    jobId: header.job_id,
    appointmentId: header.appointment_id,
    quotationId: header.quotation_id,
    share: {
      // Presence of a hash + no revocation + not past expiry. The hash itself
      // is reduced to a boolean here and never travels further.
      active:
        header.share_token_hash != null &&
        header.share_revoked_at == null &&
        (header.share_expires_at == null ||
          new Date(header.share_expires_at) > new Date()),
      createdAt: header.share_created_at,
      expiresAt: header.share_expires_at,
      revokedAt: header.share_revoked_at,
    },
    items: rows.map((i) => ({
      id: i.id,
      section: i.section,
      label: i.label,
      position: i.position,
      result: i.result,
      note: i.note,
      photos: photos.get(i.id) ?? [],
    })),
  };
}

export type PortalInspectionListRow = {
  id: string;
  completedAt: string | null;
  createdAt: string;
  vehicleLabel: string;
  businessName: string;
};

/**
 * Customer-facing list. COMPLETED only, and scoped to the customer rows the
 * session actually owns. Note the absence of `context`, `job_id`, `quotation_id`
 * and every share column: the portal has no business knowing whether a report
 * came from a job or whether a link exists.
 */
export async function listPortalInspections(
  customerIds: string[],
): Promise<PortalInspectionListRow[]> {
  if (customerIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_inspections")
    .select(
      "id, created_at, completed_at, vehicles(make, model, plate_number), businesses(name)",
    )
    .in("customer_id", customerIds)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    if (error) console.error("listPortalInspections failed", error.code);
    return [];
  }

  return data.map((row) => {
    const vehicle = row.vehicles as unknown as {
      make: string | null;
      model: string | null;
      plate_number: string | null;
    } | null;
    const business = row.businesses as unknown as { name: string } | null;
    return {
      id: row.id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      vehicleLabel: vehicle ? vehicleLabel(vehicle) : "",
      businessName: business?.name ?? "",
    };
  });
}

export type PortalInspection = {
  id: string;
  completedAt: string | null;
  summary: string | null;
  odometerReading: number | null;
  vehicleLabel: string;
  businessName: string;
  items: InspectionItemView[];
};

/**
 * One completed report for a portal customer.
 *
 * The `in(customer_id, …)` clause is application-layer defence; RLS
 * (`vehicle_inspections_read`, which requires `status = 'completed'` and
 * `is_customer_for_business`) is the real gate. Internal columns -- staff
 * identity, job/quotation links, pricing, share state -- are never selected.
 */
export async function getPortalInspection(
  inspectionId: string,
  customerIds: string[],
): Promise<PortalInspection | null> {
  if (customerIds.length === 0) return null;
  const supabase = await createClient();
  const { data: header, error } = await supabase
    .from("vehicle_inspections")
    .select(
      "id, business_id, completed_at, summary, odometer_reading, vehicles(make, model, plate_number), businesses(name)",
    )
    .eq("id", inspectionId)
    .eq("status", "completed")
    .in("customer_id", customerIds)
    .maybeSingle();

  if (error) console.error("getPortalInspection failed", error.code);
  if (!header) return null;

  const { data: items } = await supabase
    .from("inspection_items")
    .select("id, section, label, position, result, note")
    .eq("inspection_id", inspectionId)
    .order("position", { ascending: true });

  const rows = items ?? [];
  const photos = await signItemPhotos(
    rows.map((i) => i.id),
    header.business_id,
    "customer",
  );

  const vehicle = header.vehicles as unknown as {
    make: string | null;
    model: string | null;
    plate_number: string | null;
  } | null;
  const business = header.businesses as unknown as { name: string } | null;

  return {
    id: header.id,
    completedAt: header.completed_at,
    summary: header.summary,
    odometerReading: header.odometer_reading,
    vehicleLabel: vehicle ? vehicleLabel(vehicle) : "",
    businessName: business?.name ?? "",
    items: rows.map((i) => ({
      id: i.id,
      section: i.section,
      label: i.label,
      position: i.position,
      result: i.result,
      note: i.note,
      photos: photos.get(i.id) ?? [],
    })),
  };
}

export type PublicInspection = {
  businessName: string;
  vehicleLabel: string;
  completedAt: string | null;
  summary: string | null;
  items: InspectionItemView[];
};

/**
 * Resolve a share token into the public payload (spec section 13).
 *
 * `tokenHashHex` is a SHA-256 digest -- the plaintext token never reaches this
 * function's callers' logs, and must never be passed here. The two resolver
 * RPCs are the ONLY database functions granted to `anon`; they encapsulate the
 * completed / not-revoked / not-expired predicate so the route cannot forget it.
 *
 * Returns `null` for unknown, expired, revoked AND malformed tokens alike --
 * one indistinguishable outcome, no existence oracle.
 */
export async function getPublicInspection(
  tokenHashHex: string,
): Promise<PublicInspection | null> {
  const supabase = await createClient();

  const { data: headers, error } = await supabase.rpc(
    "resolve_inspection_share",
    { target_token_hash: tokenHashHex },
  );
  if (error) {
    // Stable code only -- an error string could echo the argument.
    console.error("resolve_inspection_share failed", error.code);
    return null;
  }
  const header = headers?.[0];
  if (!header) return null;

  const { data: items, error: itemsError } = await supabase.rpc(
    "resolve_inspection_share_items",
    { target_token_hash: tokenHashHex },
  );
  if (itemsError) {
    console.error("resolve_inspection_share_items failed", itemsError.code);
    return null;
  }

  const rows = items ?? [];

  // Media is signed ONLY now, after the token has resolved. The business id is
  // taken from the resolved inspection, never from the request.
  const admin = createAdminClient();
  const { data: owner } = await admin
    .from("vehicle_inspections")
    .select("business_id")
    .eq("id", header.inspection_id)
    .maybeSingle();

  const photos = owner
    ? await signItemPhotos(
        rows.map((i) => i.item_id),
        owner.business_id,
        // A public link holder is not an authenticated customer, but the object
        // is bound to the exact item id resolved from a valid token, which is
        // the same proof the portal path relies on.
        "customer",
      )
    : new Map<string, InspectionPhoto[]>();

  return {
    businessName: header.business_name,
    vehicleLabel: header.vehicle_label,
    completedAt: header.completed_at,
    summary: header.summary,
    items: rows.map((i) => ({
      id: i.item_id,
      section: i.section,
      label: i.label,
      position: i.item_position,
      result: i.result,
      note: i.note,
      photos: photos.get(i.item_id) ?? [],
    })),
  };
}

/** Active checklist templates for the business, default first. */
export async function listInspectionTemplates(businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inspection_templates")
    .select("id, name, description, is_default")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true });

  if (error) console.error("listInspectionTemplates failed", error.code);
  return data ?? [];
}
