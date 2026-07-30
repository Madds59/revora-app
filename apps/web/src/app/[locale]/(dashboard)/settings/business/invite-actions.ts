"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageBusiness } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/database.types";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  inviteTeammateSchema,
  revokeInvitationSchema,
} from "@/lib/validation/business-settings";

export type FormState = { error?: string; message?: string };

export async function inviteTeammate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can invite teammates." };

  // Role is allowlisted to manager/employee — super_admin, business_owner and
  // customer are rejected even though they exist in the member_role enum.
  const parsed = inviteTeammateSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const email = parsed.data.email;
  const role = parsed.data.role as MemberRole;

  const user = await getUser();
  const supabase = await createClient();
  const { error } = await supabase.from("business_invitations").insert({
    // Tenant + inviter identity are session-derived, never client input.
    business_id: business.id,
    email,
    role,
    invited_by: user?.id ?? null,
  });
  if (error) {
    // Unique partial index → a pending invite for this email already exists.
    if (error.code === "23505")
      return { error: "There's already a pending invite for that email." };
    console.error("inviteTeammate failed", error);
    return { error: "Could not send the invitation. Please try again." };
  }

  revalidatePath("/settings/business");
  return { message: `Invitation sent to ${email}.` };
}

export async function revokeInvitation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can manage invitations." };

  const parsed = revokeInvitationSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };

  // Explicit tenant scoping alongside RLS: an invitation id from another
  // business matches nothing rather than being revoked.
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_invitations")
    .update({ status: "revoked" })
    .eq("id", parsed.data.id)
    .eq("business_id", business.id)
    .eq("status", "pending");
  if (error) {
    console.error("revokeInvitation failed", error);
    return { error: "Could not revoke invitation. Please try again." };
  }

  revalidatePath("/settings/business");
  return { message: "Invitation revoked." };
}
