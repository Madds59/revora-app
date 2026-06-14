import { redirect } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { isAccountIntent, type AccountIntent } from "@/lib/account-intent";
import type {
  Business,
  BusinessMember,
  Customer,
  Profile,
} from "@/lib/database.types";

export type Membership = {
  member: BusinessMember;
  business: Business;
};

export type CustomerAccount = Customer & {
  business: Business | null;
};

export const ACTIVE_BUSINESS_COOKIE = "revora_active_business_id";

type MembershipRow = BusinessMember & {
  business: Business | null;
};

type ProfileRow = Pick<Profile, "id" | "full_name" | "account_intent">;

function normalizeAccountIntent(
  value: string | null | undefined,
): AccountIntent | null {
  return isAccountIntent(value) ? value : null;
}

/** The authenticated Supabase user, or null. Cached per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The current user's active business membership and business, or null if the
 * user has not completed onboarding. RLS restricts the rows to the caller, so
 * we simply take their first active membership (one business per user in MVP).
 */
export const getCurrentMembership = cache(
  async (): Promise<Membership | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_members")
      .select("*, business:businesses(*)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<MembershipRow[]>();

    if (error || !data || data.length === 0) return null;

    const activeBusinessId = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
    const selected =
      data.find((row) => row.business_id === activeBusinessId) ?? data[0];
    if (!selected.business) return null;

    const { business, ...member } = selected;
    return { member, business };
  },
);

export const getCurrentMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("*, business:businesses(*)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .returns<MembershipRow[]>();

  if (error || !data) return [];
  return data
    .filter((row): row is MembershipRow & { business: Business } => !!row.business)
    .map(({ business, ...member }) => ({ member, business }));
});

/** The current user's profile row, or null if it hasn't been created yet. */
export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, account_intent")
    .eq("id", user.id)
    .maybeSingle();

  return (data as ProfileRow | null) ?? null;
});

/** The user's intended account type, if they selected one during signup. */
export const getCurrentAccountIntent = cache(async (): Promise<AccountIntent | null> => {
  const user = await getUser();
  if (!user) return null;

  const profile = await getCurrentProfile();
  return (
    normalizeAccountIntent(profile?.account_intent) ??
    normalizeAccountIntent(
      typeof user.user_metadata?.account_intent === "string"
        ? user.user_metadata.account_intent
        : null,
    )
  );
});

/**
 * Links any unclaimed customer records whose email matches the authenticated
 * user's Supabase email. The SECURITY DEFINER RPC also ensures a profile row.
 */
export async function claimCustomerRecords(): Promise<number> {
  const user = await getUser();
  if (!user) return 0;

  const supabase = await createClient();
  const { data } = await supabase.rpc("claim_customer_records");
  return data ?? 0;
}

/** Linked customer records for the current portal user. */
export const getCurrentCustomerAccounts = cache(async (): Promise<
  CustomerAccount[]
> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*, business:businesses(*)")
    .eq("app_user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as unknown as CustomerAccount[];
});

/**
 * Accepts any pending teammate invitations matching the user's email, turning
 * them into business memberships. SECURITY DEFINER RPC; also ensures a profile.
 */
export async function claimBusinessInvitations(): Promise<number> {
  const user = await getUser();
  if (!user) return 0;

  const supabase = await createClient();
  const { data } = await supabase.rpc("claim_business_invitations");
  return data ?? 0;
}

/** Whether the current user is a platform super admin. Cached per request. */
export const isSuperAdmin = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
});

/** Redirects to /login when unauthenticated. Returns the user otherwise. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Guards the platform /admin area. Redirects non-super-admins to /. */
export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!(await isSuperAdmin())) redirect("/");
  return user;
}

/**
 * Guards dashboard routes: requires auth (-> /login) and a completed business
 * (-> /onboarding). Returns the membership + business.
 */
export async function requireMembership(): Promise<Membership> {
  const user = await requireUser();
  const membership = await getCurrentMembership();
  if (!membership) {
    if (await isSuperAdmin()) redirect("/admin");

    const intent = await getCurrentAccountIntent();
    if (intent === null || intent === "staff_invited") {
      // A freshly-signed-up teammate may have a pending invitation; accepting
      // it creates a membership, so re-enter via a fresh request.
      const claimedInvites = await claimBusinessInvitations();
      if (claimedInvites > 0) redirect("/");
    }

    await claimCustomerRecords();
    const customerAccounts = await getCurrentCustomerAccounts();

    if (intent === "customer") redirect("/portal");
    if (intent === "staff_invited") redirect("/onboarding");
    if (intent === "business_owner") redirect("/onboarding");
    if (customerAccounts.length > 0) redirect("/portal");

    if (user.user_metadata?.account_intent === "customer") redirect("/portal");

    redirect("/onboarding");
  }
  return membership;
}

/** Guards customer portal routes. */
export async function requireCustomerPortal(): Promise<{
  accounts: CustomerAccount[];
}> {
  await requireUser();
  const membership = await getCurrentMembership();
  if (membership) redirect("/");
  await claimCustomerRecords();
  const accounts = await getCurrentCustomerAccounts();
  if (accounts.length > 0) return { accounts };

  const intent = await getCurrentAccountIntent();
  if (intent === "business_owner" || intent === "staff_invited") {
    redirect("/onboarding");
  }

  return { accounts };
}
