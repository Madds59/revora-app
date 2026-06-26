"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireMembership } from "@/lib/auth";
import { canManageBusiness } from "@/lib/permissions";
import { createBillingPortalSession } from "@/lib/stripe";

export type BillingActionState = { error?: string; message?: string };

export async function openBillingPortal(): Promise<BillingActionState> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role)) {
    return { error: "Billing portal access is available to business owners only." };
  }
  if (!business.stripe_customer_id) {
    return { error: "This business does not have a Stripe customer id yet." };
  }

  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return { error: "Unable to determine the return URL." };

  let session;
  try {
    session = await createBillingPortalSession({
      customerId: business.stripe_customer_id,
      returnUrl: `${proto}://${host}/billing`,
    });
  } catch (error) {
    console.error("openBillingPortal failed", error);
    return { error: "Unable to open the billing portal right now." };
  }

  redirect(session.url);
}
