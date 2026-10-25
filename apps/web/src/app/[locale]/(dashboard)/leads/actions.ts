"use server";

import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { canManageLeads } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import { convertLeadSchema, updateLeadSchema } from "@/lib/validation/leads";

export type FormState = { error?: string; message?: string };

/** Must match the sentinel the triage form's assignee Select submits. */
const UNASSIGNED_SENTINEL = "unassigned";

/**
 * Triage: status, urgency and owner.
 *
 * Only fields actually submitted are written, matching updateComplaint, so a
 * form that renders a subset cannot silently blank the rest. business_id is
 * taken from the session's membership and used to scope the write; it is never
 * read from the form. RLS and 0048's composite foreign keys remain the
 * backstop.
 */
export async function updateLead(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageLeads(member.role)) {
    return { error: "You don't have permission to manage leads." };
  }

  // The assignee Select submits "unassigned" for "no owner", because a Select
  // cannot carry an empty string value. Map it to null before validation:
  // optionalUuid would read the sentinel as a malformed uuid and reject the
  // whole form rather than clearing the field.
  const rawAssignee = formData.get("assigned_to");
  const assigneeInput = rawAssignee === UNASSIGNED_SENTINEL ? null : rawAssignee;

  const parsed = updateLeadSchema.safeParse({
    leadId: formData.get("lead_id"),
    status: formData.get("status"),
    urgency: formData.get("urgency"),
    assignedTo: assigneeInput,
    summary: formData.get("summary"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { leadId, status, urgency, assignedTo, summary } = parsed.data;

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("leads")
    .select("id, status, first_response_at")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (currentError) {
    console.error("updateLead lookup failed", currentError);
    return { error: "Could not load lead. Please try again." };
  }
  if (!current) return { error: "Lead not found." };

  const updates: {
    assigned_to?: string | null;
    closed_at?: string | null;
    first_response_at?: string | null;
    status?: string;
    summary?: string | null;
    urgency?: string;
  } = {};

  if (status) {
    updates.status = status;
    // Closing the lead stamps closed_at once, and only on the transition, so
    // re-saving an already-lost lead does not move the timestamp.
    const closing = status === "lost" || status === "spam" || status === "duplicate";
    if (closing && current.status !== status) {
      updates.closed_at = new Date().toISOString();
    }
    // Moving off `new` is the first human action on the inquiry, which is what
    // first_response_at measures. It is set once.
    if (current.status === "new" && status !== "new" && !current.first_response_at) {
      updates.first_response_at = new Date().toISOString();
    }
  }
  if (urgency) updates.urgency = urgency;
  if (formData.has("assigned_to")) updates.assigned_to = assignedTo ?? null;
  if (formData.has("summary")) updates.summary = summary ?? null;

  if (Object.keys(updates).length === 0) return { message: "Nothing to update." };

  const { error } = await supabase
    .from("leads")
    .update(updates as never)
    .eq("id", leadId)
    .eq("business_id", business.id);
  if (error) {
    console.error("updateLead failed", error);
    return { error: "Could not update lead. Please try again." };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { message: "Lead updated." };
}

/**
 * Convert: create a customer record from the inquiry and link it.
 *
 * Deliberately does NOT create a quote or an appointment. Those have their own
 * flows at /quotations/new and /appointments/new, with their own validation and
 * permissions (quotes are owner/manager only, which lead work is not), and
 * duplicating either here would be a second path to the same records.
 *
 * The lead's status moves to `qualified` rather than `converted`: 0048 treats a
 * lead as converted when appointment_id or quotation_id is set, and creating a
 * customer alone does not do that. Claiming otherwise would make the conversion
 * metric wrong.
 */
export async function convertLead(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageLeads(member.role)) {
    return { error: "You don't have permission to manage leads." };
  }

  const parsed = convertLeadSchema.safeParse({
    leadId: formData.get("lead_id"),
    fullName: formData.get("full_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { leadId, fullName, phone, email } = parsed.data;

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, status, customer_id, channel_identity_id")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (leadError) {
    console.error("convertLead lookup failed", leadError);
    return { error: "Could not load lead. Please try again." };
  }
  if (!lead) return { error: "Lead not found." };
  if (lead.customer_id) {
    return { error: "This lead is already linked to a customer." };
  }

  // Fall back to what the channel knows. An Instagram DM carries a display
  // name at best and often only a handle, so refusing without a typed name
  // would block the common case.
  let resolvedName = fullName?.trim() ?? "";
  if (!resolvedName && lead.channel_identity_id) {
    const { data: identity, error: identityError } = await supabase
      .from("channel_identities")
      .select("display_name, external_handle")
      .eq("id", lead.channel_identity_id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (identityError) {
      console.error("convertLead identity lookup failed", identityError);
      return { error: "Could not load the channel identity. Please try again." };
    }
    resolvedName =
      identity?.display_name?.trim() || identity?.external_handle?.trim() || "";
  }
  if (!resolvedName) return { error: "Enter a name for the customer." };

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      business_id: business.id,
      full_name: resolvedName,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      created_by: member.user_id,
      // Messaging a business is not marketing consent. A Meta lead form
      // carries its own, and that lives on the lead, not here.
      marketing_consent: false,
    })
    .select("id")
    .single();
  if (customerError || !customer) {
    console.error("convertLead customer insert failed", customerError);
    return { error: "Could not create the customer. Please try again." };
  }

  const { error: linkError } = await supabase
    .from("leads")
    .update({
      customer_id: customer.id,
      status: lead.status === "new" || lead.status === "triaging" ? "qualified" : lead.status,
    } as never)
    .eq("id", leadId)
    .eq("business_id", business.id);
  if (linkError) {
    // The customer exists but the link failed. Say so plainly rather than
    // reporting success: the operator needs to know a record was created.
    console.error("convertLead link failed", linkError);
    return {
      error:
        "The customer was created but could not be linked to this lead. Open the customer record and link it manually.",
    };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/customers");
  return { message: "Customer created and linked." };
}
