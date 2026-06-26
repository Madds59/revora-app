"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageBusiness } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/database.types";

export type FormState = { error?: string; message?: string };

const INVITABLE_ROLES: MemberRole[] = ["manager", "employee"];

export async function inviteTeammate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can invite teammates." };

  const user = await getUser();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as MemberRole;
  if (!email) return { error: "Email is required." };
  if (!INVITABLE_ROLES.includes(role))
    return { error: "Choose a role (manager or service advisor)." };

  const supabase = await createClient();
  const { error } = await supabase.from("business_invitations").insert({
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
  const { member } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can manage invitations." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing invitation id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    console.error("revokeInvitation failed", error);
    return { error: "Could not revoke invitation. Please try again." };
  }

  revalidatePath("/settings/business");
  return { message: "Invitation revoked." };
}
